import { BadGatewayException, Body, Controller, Delete, Get, Injectable, NotFoundException, Param, Post, Put, Req } from '@nestjs/common'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import { DatabaseService } from '../database/database.service.js'
import { AppRequest, parse } from '../common/http.js'
import { WorkspaceService } from './workspaces.js'

type Encrypted={ciphertext:string;iv:string;tag:string}
const configInput=z.object({repoUrl:z.string().url(),token:z.string().min(20).max(500),projectId:z.string().uuid()}).strict()
const repoResponse=z.object({full_name:z.string()})
const issue=z.object({number:z.number().int(),title:z.string(),body:z.string().nullable(),state:z.enum(['open','closed']),html_url:z.string().url().optional(),pull_request:z.unknown().optional(),labels:z.array(z.union([z.string(),z.object({name:z.string().nullable()})])).default([])})
const issueResponse=issue
const issuesResponse=z.array(issue)
const contentResponse=z.object({content:z.object({sha:z.string()}).optional(),sha:z.string().optional()})
const resolveInput=z.object({resolution:z.enum(['KEEP_LOCAL','USE_GITHUB'])}).strict()
const taskLinksInput=z.object({links:z.array(z.object({kind:z.enum(['ISSUE','PR']),number:z.number().int().positive()})).max(20)}).strict()

export type GitHubReference={kind:'ISSUE'|'PR';number:number;title:string;url:string;state:'open'|'closed'}
export function toGitHubReference(value:z.infer<typeof issue>,owner:string,repo:string):GitHubReference{return{kind:value.pull_request?'PR':'ISSUE',number:value.number,title:value.title,url:value.html_url??`https://github.com/${owner}/${repo}/${value.pull_request?'pull':'issues'}/${value.number}`,state:value.state}}

export function githubHttpError(status:number,rateLimitRemaining:string|null){
  if(status===401)return{code:'GITHUB_TOKEN_INVALID',message:'GitHub Token 无效或已被撤销'}
  if(status===403&&rateLimitRemaining==='0')return{code:'GITHUB_RATE_LIMITED',message:'GitHub API 请求次数已用尽，请稍后重试'}
  if(status===403)return{code:'GITHUB_ACCESS_DENIED',message:'GitHub Token 没有访问该仓库所需的权限'}
  if(status===404)return{code:'GITHUB_REPOSITORY_NOT_FOUND',message:'GitHub 仓库不存在，或 Token 无权访问该仓库'}
  return{code:'GITHUB_API_ERROR',message:`GitHub 请求失败（${status}）`}
}

export function githubNetworkError(error:unknown){
  const name=error instanceof Error?error.name:''
  if(name==='TimeoutError'||name==='AbortError')return{code:'GITHUB_TIMEOUT',message:'连接 GitHub 超时，请稍后重试'}
  return{code:'GITHUB_UNREACHABLE',message:'无法连接 GitHub，请检查网络或代理设置'}
}

const encryptionKey=()=>{const value=process.env.APP_ENCRYPTION_KEY;if(!value&&process.env.NODE_ENV==='production')throw new Error('APP_ENCRYPTION_KEY is required in production');return createHash('sha256').update(value||'task-harbor-development-only').digest()}
export function encryptSecret(secret:string,key=encryptionKey()):Encrypted{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),ciphertext=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);return{ciphertext:ciphertext.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64')}}
export function decryptSecret(value:Encrypted,key=encryptionKey()){const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(value.iv,'base64'));decipher.setAuthTag(Buffer.from(value.tag,'base64'));return Buffer.concat([decipher.update(Buffer.from(value.ciphertext,'base64')),decipher.final()]).toString('utf8')}
export function parseGitHubRepo(value:string){const url=new URL(value);if(url.protocol!=='https:'||url.hostname!=='github.com')throw new Error('仅支持 https://github.com 仓库地址');const parts=url.pathname.replace(/^\/|\/$/g,'').split('/');if(parts.length!==2||!parts[0]||!parts[1])throw new Error('GitHub 仓库地址无效');return{owner:parts[0],repo:parts[1].replace(/\.git$/,'')}}

type Integration={workspaceId:string;projectId:string;owner:string;repo:string;tokenCiphertext:string;tokenIv:string;tokenTag:string}

@Injectable()
export class GitHubService {
  constructor(private readonly db:DatabaseService,private readonly workspaces:WorkspaceService){}

  async get(workspaceId:string,userId:string){await this.workspaces.role(workspaceId,userId,'workspace.manage');const [row]=await this.db.client`SELECT project_id AS "projectId",owner,repo,token_last4 AS "tokenLast4",updated_at AS "updatedAt" FROM github_integrations WHERE workspace_id=${workspaceId}`;return row??null}
  async configure(workspaceId:string,userId:string,raw:unknown){await this.workspaces.role(workspaceId,userId,'workspace.manage');const input=parse(configInput,raw),repo=parseGitHubRepo(input.repoUrl),[project]=await this.db.client`SELECT id FROM projects WHERE id=${input.projectId} AND workspace_id=${workspaceId} AND deleted_at IS NULL`;if(!project)throw new NotFoundException({code:'PROJECT_NOT_FOUND',message:'项目不存在'});await this.github(input.token,repo.owner,repo.repo,'',{},repoResponse);const encrypted=encryptSecret(input.token);await this.db.client`INSERT INTO github_integrations(workspace_id,project_id,owner,repo,token_ciphertext,token_iv,token_tag,token_last4,created_by) VALUES(${workspaceId},${input.projectId},${repo.owner},${repo.repo},${encrypted.ciphertext},${encrypted.iv},${encrypted.tag},${input.token.slice(-4)},${userId}) ON CONFLICT(workspace_id) DO UPDATE SET project_id=excluded.project_id,owner=excluded.owner,repo=excluded.repo,token_ciphertext=excluded.token_ciphertext,token_iv=excluded.token_iv,token_tag=excluded.token_tag,token_last4=excluded.token_last4,updated_at=now()`;return this.get(workspaceId,userId)}
  async remove(workspaceId:string,userId:string){await this.workspaces.role(workspaceId,userId,'workspace.manage');await this.db.client`DELETE FROM github_integrations WHERE workspace_id=${workspaceId}`;return{ok:true}}

  async push(workspaceId:string,userId:string){await this.workspaces.role(workspaceId,userId,'workspace.manage');const config=await this.config(workspaceId),token=this.token(config);let tasks=0,documents=0
    const taskRows=await this.db.client<Record<string,any>[]>`SELECT t.id,t.title,t.description,t.kind,t.priority,t.due_date AS "dueDate",c.name AS "columnName",c.position=(SELECT max(position) FROM board_columns WHERE project_id=t.project_id) AS completed FROM tasks t JOIN board_columns c ON c.id=t.column_id WHERE t.workspace_id=${workspaceId} AND t.project_id=${config.projectId} AND t.deleted_at IS NULL`
    for(const task of taskRows){const [mapping]=await this.db.client<{githubNumber:number}[]>`SELECT github_number AS "githubNumber" FROM github_mappings WHERE workspace_id=${workspaceId} AND entity_type='TASK' AND entity_id=${task.id}`;const body=`${task.description}\n\n---\nTask Harbor: ${task.kind} · ${task.priority}${task.dueDate?` · due ${task.dueDate}`:''}\n<!-- taskharbor:task:${task.id} -->`,payload={title:task.title,body,state:task.completed?'closed':'open'},result=await this.github(token,config.owner,config.repo,mapping?`/issues/${mapping.githubNumber}`:'/issues',{method:mapping?'PATCH':'POST',body:JSON.stringify(payload)},issueResponse);await this.db.client`INSERT INTO github_mappings(workspace_id,entity_type,entity_id,github_number) VALUES(${workspaceId},'TASK',${task.id},${result.number}) ON CONFLICT(workspace_id,entity_type,entity_id) DO UPDATE SET github_number=excluded.github_number,updated_at=now()`;tasks++}
    const docs=await this.db.client<Record<string,any>[]>`SELECT id,title,content FROM documents WHERE workspace_id=${workspaceId} AND (project_id=${config.projectId} OR project_id IS NULL) AND status<>'ARCHIVED'`
    for(const document of docs){const path=`task-harbor/docs/${document.id}.md`,[mapping]=await this.db.client<{githubSha:string|null}[]>`SELECT github_sha AS "githubSha" FROM github_mappings WHERE workspace_id=${workspaceId} AND entity_type='DOCUMENT' AND entity_id=${document.id}`,payload={message:`docs: sync ${document.title}`,content:Buffer.from(document.content).toString('base64'),...(mapping?.githubSha?{sha:mapping.githubSha}:{})},result=await this.github(token,config.owner,config.repo,`/contents/${path.split('/').map(encodeURIComponent).join('/')}`,{method:'PUT',body:JSON.stringify(payload)},contentResponse),sha=result.content?.sha??result.sha!;await this.db.client`INSERT INTO github_mappings(workspace_id,entity_type,entity_id,github_path,github_sha) VALUES(${workspaceId},'DOCUMENT',${document.id},${path},${sha}) ON CONFLICT(workspace_id,entity_type,entity_id) DO UPDATE SET github_path=excluded.github_path,github_sha=excluded.github_sha,updated_at=now()`;documents++}
    await this.audit(workspaceId,userId,'github.pushed',{tasks,documents});return{tasks,documents}}

  async pull(workspaceId:string,userId:string){await this.workspaces.role(workspaceId,userId,'workspace.manage');const config=await this.config(workspaceId),token=this.token(config),issues=await this.github(token,config.owner,config.repo,'/issues?state=all&per_page=100',{},issuesResponse),[column]=await this.db.client<{id:string}[]>`SELECT id FROM board_columns WHERE project_id=${config.projectId} AND workspace_id=${workspaceId} ORDER BY position LIMIT 1`;let imported=0,conflicts=0
    for(const remote of issues.filter(item=>!item.pull_request)){const description=(remote.body??'').split('\n\n---\n')[0]!,[mapping]=await this.db.client<{entityId:string}[]>`SELECT entity_id AS "entityId" FROM github_mappings WHERE workspace_id=${workspaceId} AND entity_type='TASK' AND github_number=${remote.number}`
      if(mapping){const [local]=await this.db.client<{title:string;description:string}[]>`SELECT title,description FROM tasks WHERE id=${mapping.entityId} AND workspace_id=${workspaceId}`;if(local&&(local.title!==remote.title||local.description!==description)){await this.db.client`INSERT INTO github_sync_conflicts(workspace_id,entity_type,entity_id,remote_ref,remote_data) VALUES(${workspaceId},'TASK',${mapping.entityId},${`issue:${remote.number}`},${JSON.stringify({title:remote.title,description})}::jsonb) ON CONFLICT(workspace_id,entity_type,entity_id,remote_ref) WHERE resolved_at IS NULL DO UPDATE SET remote_data=excluded.remote_data,created_at=now()`;conflicts++}continue}
      const labels=remote.labels.map(label=>typeof label==='string'?label:label.name??''),kind=labels.some(label=>label.toLowerCase()==='bug')?'BUG':'TASK',[project]=await this.db.client<{number:number}[]>`UPDATE projects SET next_task_number=next_task_number+1 WHERE id=${config.projectId} AND workspace_id=${workspaceId} RETURNING next_task_number-1 AS number`,[task]=await this.db.client<{id:string}[]>`INSERT INTO tasks(workspace_id,project_id,column_id,number,title,description,kind,priority,creator_id,position,archived_at) VALUES(${workspaceId},${config.projectId},${column!.id},${project!.number},${remote.title},${description},${kind},'MEDIUM',${userId},${remote.number*1000},${remote.state==='closed'?new Date().toISOString():null}) RETURNING id`;await this.db.client`INSERT INTO github_mappings(workspace_id,entity_type,entity_id,github_number) VALUES(${workspaceId},'TASK',${task!.id},${remote.number})`;imported++}
    await this.audit(workspaceId,userId,'github.pulled',{imported,conflicts});return{imported,conflicts}}

  async references(workspaceId:string,userId:string){await this.workspaces.role(workspaceId,userId,'task.read');const config=await this.config(workspaceId),items=await this.github(this.token(config),config.owner,config.repo,'/issues?state=all&per_page=100',{},issuesResponse);return{projectId:config.projectId,items:items.map(item=>toGitHubReference(item,config.owner,config.repo))}}
  async taskLinks(workspaceId:string,userId:string,taskId:string){await this.workspaces.role(workspaceId,userId,'task.read');await this.assertTask(workspaceId,taskId);return this.db.client`SELECT github_kind AS kind,github_number AS number,title,url,state FROM github_task_links WHERE workspace_id=${workspaceId} AND task_id=${taskId} ORDER BY github_kind,github_number`}
  async setTaskLinks(workspaceId:string,userId:string,taskId:string,raw:unknown){await this.workspaces.role(workspaceId,userId,'task.update');const task=await this.assertTask(workspaceId,taskId),input=parse(taskLinksInput,raw),available=await this.references(workspaceId,userId);if(task.projectId!==available.projectId)throw new NotFoundException({code:'GITHUB_PROJECT_NOT_CONNECTED',message:'该任务所属项目未连接此 GitHub 仓库'});const byKey=new Map(available.items.map(item=>[`${item.kind}:${item.number}`,item])),selected=input.links.map(link=>byKey.get(`${link.kind}:${link.number}`));if(selected.some(item=>!item))throw new NotFoundException({code:'GITHUB_REFERENCE_NOT_FOUND',message:'GitHub Issue 或 PR 不存在'});await this.db.client.begin(async sql=>{await sql`DELETE FROM github_task_links WHERE workspace_id=${workspaceId} AND task_id=${taskId}`;for(const item of selected as GitHubReference[])await sql`INSERT INTO github_task_links(workspace_id,task_id,github_kind,github_number,title,url,state) VALUES(${workspaceId},${taskId},${item.kind},${item.number},${item.title},${item.url},${item.state})`});return{links:selected}}

  async conflicts(workspaceId:string,userId:string){await this.workspaces.role(workspaceId,userId,'workspace.manage');return this.db.client`SELECT c.id,c.entity_id AS "entityId",c.remote_ref AS "remoteRef",c.remote_data AS "remoteData",c.created_at AS "createdAt",t.title AS "localTitle" FROM github_sync_conflicts c JOIN tasks t ON t.id=c.entity_id WHERE c.workspace_id=${workspaceId} AND c.resolved_at IS NULL ORDER BY c.created_at DESC`}
  async resolve(workspaceId:string,userId:string,conflictId:string,raw:unknown){await this.workspaces.role(workspaceId,userId,'workspace.manage');const input=parse(resolveInput,raw);return this.db.client.begin(async sql=>{const [conflict]=await sql<{entityId:string;remoteData:{title:string;description:string}}[]>`SELECT entity_id AS "entityId",remote_data AS "remoteData" FROM github_sync_conflicts WHERE id=${conflictId} AND workspace_id=${workspaceId} AND resolved_at IS NULL FOR UPDATE`;if(!conflict)throw new NotFoundException({code:'CONFLICT_NOT_FOUND',message:'同步冲突不存在'});if(input.resolution==='USE_GITHUB')await sql`UPDATE tasks SET title=${conflict.remoteData.title},description=${conflict.remoteData.description},version=version+1,updated_at=now() WHERE id=${conflict.entityId} AND workspace_id=${workspaceId}`;await sql`UPDATE github_sync_conflicts SET resolved_at=now(),resolution=${input.resolution} WHERE id=${conflictId}`;return{ok:true}})}

  private async config(workspaceId:string){const [config]=await this.db.client<Integration[]>`SELECT workspace_id AS "workspaceId",project_id AS "projectId",owner,repo,token_ciphertext AS "tokenCiphertext",token_iv AS "tokenIv",token_tag AS "tokenTag" FROM github_integrations WHERE workspace_id=${workspaceId}`;if(!config)throw new NotFoundException({code:'GITHUB_NOT_CONNECTED',message:'尚未连接 GitHub 仓库'});return config}
  private async assertTask(workspaceId:string,taskId:string){const [task]=await this.db.client<{id:string;projectId:string}[]>`SELECT id,project_id AS "projectId" FROM tasks WHERE id=${taskId} AND workspace_id=${workspaceId} AND deleted_at IS NULL`;if(!task)throw new NotFoundException({code:'TASK_NOT_FOUND',message:'任务不存在'});return task}
  private token(config:Integration){return decryptSecret({ciphertext:config.tokenCiphertext,iv:config.tokenIv,tag:config.tokenTag})}
  private async github<T>(token:string,owner:string,repo:string,path:string,init:RequestInit,schema:z.ZodType<T>){
    let response:Response
    try{response=await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${path}`,{...init,headers:{accept:'application/vnd.github+json',authorization:`Bearer ${token}`,'x-github-api-version':'2022-11-28','user-agent':'task-harbor','content-type':'application/json'},signal:AbortSignal.timeout(15000)})}
    catch(error){throw new BadGatewayException(githubNetworkError(error))}
    const data=await response.json().catch(()=>({}))
    if(!response.ok)throw new BadGatewayException(githubHttpError(response.status,response.headers.get('x-ratelimit-remaining')))
    const parsed=schema.safeParse(data)
    if(!parsed.success)throw new BadGatewayException({code:'GITHUB_RESPONSE_INVALID',message:'GitHub 返回了无法识别的数据'})
    return parsed.data
  }
  private async audit(workspaceId:string,userId:string,action:string,data:unknown){await this.db.client`INSERT INTO audit_logs(workspace_id,actor_id,action,entity_type,entity_id,request_id,after_data) VALUES(${workspaceId},${userId},${action},'github',${workspaceId},'github-sync',${JSON.stringify(data)}::jsonb)`}
}

@Controller('workspaces/:workspaceId/integrations/github')
export class GitHubController {
  constructor(private readonly github:GitHubService){}
  @Get()get(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string){return this.github.get(workspaceId,req.user!.id)}
  @Put()configure(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string,@Body() body:unknown){return this.github.configure(workspaceId,req.user!.id,body)}
  @Delete()remove(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string){return this.github.remove(workspaceId,req.user!.id)}
  @Post('push')push(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string){return this.github.push(workspaceId,req.user!.id)}
  @Post('pull')pull(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string){return this.github.pull(workspaceId,req.user!.id)}
  @Get('references')references(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string){return this.github.references(workspaceId,req.user!.id)}
  @Get('tasks/:taskId/links')taskLinks(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string,@Param('taskId') taskId:string){return this.github.taskLinks(workspaceId,req.user!.id,taskId)}
  @Put('tasks/:taskId/links')setTaskLinks(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string,@Param('taskId') taskId:string,@Body() body:unknown){return this.github.setTaskLinks(workspaceId,req.user!.id,taskId,body)}
  @Get('conflicts')conflicts(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string){return this.github.conflicts(workspaceId,req.user!.id)}
  @Post('conflicts/:conflictId/resolve')resolve(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string,@Param('conflictId') conflictId:string,@Body() body:unknown){return this.github.resolve(workspaceId,req.user!.id,conflictId,body)}
}
