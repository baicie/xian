import { Body, Controller, Delete, ForbiddenException, Get, Injectable, Param, Post, Req, Res, UnauthorizedException } from '@nestjs/common'
import { createHash, randomBytes } from 'node:crypto'
import type { Request, Response } from 'express'
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { DatabaseService } from '../database/database.service.js'
import { documentCreateSchema, planCreateSchema } from '../common/contracts.js'
import { AppRequest, parse, Public } from '../common/http.js'
import { DocumentService } from './documents.js'
import { PlanService } from './plans.js'
import { ProjectService } from './projects.js'
import { TaskService } from './tasks.js'
import { WorkspaceService } from './workspaces.js'

type McpScope='READ'|'WRITE'
type McpIdentity={tokenId:string;workspaceId:string;userId:string;scopes:McpScope[]}
const tokenInput=z.object({name:z.string().trim().min(1).max(80),write:z.boolean().default(true)}).strict()
export const mcpTokenHash=(token:string)=>createHash('sha256').update(token).digest('hex')
const text=(value:unknown)=>({content:[{type:'text' as const,text:JSON.stringify(value,null,2)}]})

@Injectable()
export class McpTokenService {
  constructor(private readonly db:DatabaseService,private readonly workspaces:WorkspaceService){}
  async list(workspaceId:string,userId:string){await this.workspaces.role(workspaceId,userId,'workspace.manage');return this.db.client`SELECT id,name,scopes,last_used_at AS "lastUsedAt",created_at AS "createdAt" FROM mcp_tokens WHERE workspace_id=${workspaceId} AND revoked_at IS NULL ORDER BY created_at DESC`}
  async create(workspaceId:string,userId:string,name:string,write:boolean){await this.workspaces.role(workspaceId,userId,'workspace.manage');const token=`thm_${randomBytes(32).toString('base64url')}`,scopes:McpScope[]=write?['READ','WRITE']:['READ'];const [row]=await this.db.client`INSERT INTO mcp_tokens(workspace_id,user_id,name,token_hash,scopes) VALUES(${workspaceId},${userId},${name},${mcpTokenHash(token)},${scopes}) RETURNING id,name,scopes,created_at AS "createdAt"`;return{...row,token}}
  async revoke(workspaceId:string,userId:string,tokenId:string){await this.workspaces.role(workspaceId,userId,'workspace.manage');await this.db.client`UPDATE mcp_tokens SET revoked_at=now() WHERE id=${tokenId} AND workspace_id=${workspaceId}`;return{ok:true}}
  async authenticate(header:string|undefined){const token=header?.match(/^Bearer (.+)$/i)?.[1];if(!token)throw new UnauthorizedException('Missing bearer token');const [identity]=await this.db.client<McpIdentity[]>`UPDATE mcp_tokens SET last_used_at=now() WHERE token_hash=${mcpTokenHash(token)} AND revoked_at IS NULL RETURNING id AS "tokenId",workspace_id AS "workspaceId",user_id AS "userId",scopes`;if(!identity)throw new UnauthorizedException('Invalid bearer token');return identity}
}

@Injectable()
export class McpService {
  constructor(private readonly db:DatabaseService,private readonly projects:ProjectService,private readonly tasks:TaskService,private readonly documents:DocumentService,private readonly plans:PlanService){}

  server(identity:McpIdentity){
    const server=new McpServer({name:'task-harbor',version:'0.1.0'})
    const requireScope=(scope:McpScope)=>{if(!identity.scopes.includes(scope))throw new ForbiddenException(`MCP token requires ${scope} scope`)}
    const run=async(name:string,action:()=>Promise<unknown>)=>{const result=await action();await this.audit(identity,name);return text(result)}
    server.registerTool('list_projects',{description:'List projects in the authorized Task Harbor workspace.',inputSchema:{},annotations:{readOnlyHint:true,openWorldHint:false}},async()=>run('list_projects',()=>this.projects.list(identity.workspaceId,identity.userId)))
    server.registerTool('list_tasks',{description:'List active tasks, optionally filtered to a project.',inputSchema:{projectId:z.string().uuid().optional(),query:z.string().max(200).optional()},annotations:{readOnlyHint:true,openWorldHint:false}},async input=>run('list_tasks',()=>this.tasks.list(identity.workspaceId,identity.userId,{...input,pageSize:100})))
    server.registerTool('create_plan_draft',{description:'Create a reviewable plan draft. This never creates tasks until apply_plan is called.',inputSchema:planCreateSchema,annotations:{openWorldHint:false}},async input=>{requireScope('WRITE');return run('create_plan_draft',()=>this.plans.create(identity.workspaceId,identity.userId,input,'MCP'))})
    server.registerTool('save_design_document',{description:'Save a versioned Markdown design document in the authorized workspace.',inputSchema:documentCreateSchema,annotations:{openWorldHint:false}},async input=>{requireScope('WRITE');return run('save_design_document',()=>this.documents.create(identity.workspaceId,identity.userId,input))})
    server.registerTool('apply_plan',{description:'Apply a reviewed plan once and create its tasks. Repeated calls are idempotent.',inputSchema:{planId:z.string().uuid()},annotations:{destructiveHint:true,openWorldHint:false}},async({planId})=>{requireScope('WRITE');return run('apply_plan',()=>this.plans.apply(identity.workspaceId,identity.userId,planId,`mcp:${identity.tokenId}`))})
    server.registerPrompt('plan_project_work',{description:'Plan project work as a reviewable Task Harbor draft.',argsSchema:{projectId:z.string().uuid(),goal:z.string().min(1)}},async({projectId,goal})=>({messages:[{role:'user',content:{type:'text',text:`Inspect project ${projectId} and its tasks, then propose a focused plan for: ${goal}. Save it with create_plan_draft. Do not call apply_plan until a human explicitly approves the draft.`}}]}))
    const own=(workspaceId:string|string[]|undefined)=>{const value=Array.isArray(workspaceId)?workspaceId[0]:workspaceId;if(value!==identity.workspaceId)throw new ForbiddenException('Resource is outside the token workspace')}
    server.registerResource('workspace',new ResourceTemplate('taskharbor://workspaces/{workspaceId}',{list:undefined}),{mimeType:'application/json'},async(uri,variables)=>{own(variables.workspaceId);const [workspace]=await this.db.client`SELECT w.id,w.name,(SELECT count(*)::int FROM projects WHERE workspace_id=w.id AND deleted_at IS NULL) AS projects,(SELECT count(*)::int FROM tasks WHERE workspace_id=w.id AND deleted_at IS NULL) AS tasks FROM workspaces w WHERE w.id=${identity.workspaceId}`;return{contents:[{uri:uri.href,mimeType:'application/json',text:JSON.stringify(workspace)}]}})
    server.registerResource('project',new ResourceTemplate('taskharbor://workspaces/{workspaceId}/projects/{projectId}',{list:undefined}),{mimeType:'application/json'},async(uri,variables)=>{own(variables.workspaceId);const projectId=String(variables.projectId);const [project]=await this.db.client`SELECT id,name,code,description FROM projects WHERE id=${projectId} AND workspace_id=${identity.workspaceId} AND deleted_at IS NULL`;if(!project)throw new Error('Project not found');const tasks=await this.tasks.list(identity.workspaceId,identity.userId,{projectId,pageSize:100});return{contents:[{uri:uri.href,mimeType:'application/json',text:JSON.stringify({...project,tasks:tasks.data})}]}})
    server.registerResource('document',new ResourceTemplate('taskharbor://workspaces/{workspaceId}/documents/{documentId}',{list:undefined}),{mimeType:'text/markdown'},async(uri,variables)=>{own(variables.workspaceId);const document=await this.documents.get(identity.workspaceId,identity.userId,String(variables.documentId)) as {content:string};return{contents:[{uri:uri.href,mimeType:'text/markdown',text:document.content}]}})
    return server
  }

  private async audit(identity:McpIdentity,tool:string){await this.db.client`INSERT INTO audit_logs(workspace_id,actor_id,action,entity_type,entity_id,request_id,after_data) VALUES(${identity.workspaceId},${identity.userId},${`mcp.tool.${tool}`},'mcp_token',${identity.tokenId},${`mcp:${identity.tokenId}`},${JSON.stringify({tool})}::jsonb)`}
}

@Controller('workspaces/:workspaceId/mcp-tokens')
export class McpTokenController {
  constructor(private readonly tokens:McpTokenService){}
  @Get() list(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string){return this.tokens.list(workspaceId,req.user!.id)}
  @Post() create(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string,@Body() body:unknown){const input=parse(tokenInput,body);return this.tokens.create(workspaceId,req.user!.id,input.name,input.write)}
  @Delete(':tokenId') revoke(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string,@Param('tokenId') tokenId:string){return this.tokens.revoke(workspaceId,req.user!.id,tokenId)}
}

@Public()
@Controller('mcp')
export class McpController {
  constructor(private readonly tokens:McpTokenService,private readonly mcp:McpService){}
  @Post()
  async handle(@Req() req:Request,@Res() res:Response){
    try{
      if(process.env.NODE_ENV==='production'){const allowed=new URL(process.env.APP_ORIGIN!).host;if(req.headers.host!==allowed){res.status(403).json({jsonrpc:'2.0',error:{code:-32000,message:'Invalid host'},id:null});return}}
      const identity=await this.tokens.authenticate(req.headers.authorization),server=this.mcp.server(identity),transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true})
      await server.connect(transport);await transport.handleRequest(req,res,req.body);res.on('close',()=>{void transport.close();void server.close()})
    }catch(error){if(!res.headersSent)res.status(error instanceof UnauthorizedException?401:500).json({jsonrpc:'2.0',error:{code:-32603,message:error instanceof Error?error.message:'Internal server error'},id:null})}
  }
}
