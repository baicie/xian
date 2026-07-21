import { BadRequestException, Controller, Get, Injectable, Param, Post, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { Response } from 'express'
import { DatabaseService } from '../database/database.service.js'
import type { AppRequest } from '../common/http.js'
import { createArchive, readArchive, readArchiveBundle, type WorkspaceSnapshot } from './archive.js'
import { WorkspaceService } from './workspaces.js'

const iso=(value:unknown)=>value instanceof Date?value.toISOString():String(value)
type ExportRow=Record<string,any>
type Upload={buffer:Buffer}
const fileData=(file:Upload|undefined)=>{if(!file?.buffer)throw new BadRequestException({code:'BACKUP_FILE_REQUIRED',message:'请选择备份文件'});return file.buffer}
const storageRoot=resolve(process.env.ASSET_STORAGE_ROOT??join(process.cwd(),'data','assets'))
const assetPath=(key:string)=>resolve(storageRoot,key)

@Injectable()
export class TransferService {
  constructor(private readonly db:DatabaseService,private readonly workspaces:WorkspaceService){}

  async snapshot(workspaceId:string,userId:string):Promise<WorkspaceSnapshot>{
    await this.workspaces.role(workspaceId,userId,'workspace.read')
    const [workspace]=await this.db.client<{name:string}[]>`SELECT name FROM workspaces WHERE id=${workspaceId}`
    const [members,projects,columns,transitions,tasks,assignees,labels,checks,comments,documents,versions,plans,planItems,assets]=await Promise.all([
      this.db.client`SELECT u.email,u.name,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=${workspaceId} AND m.disabled_at IS NULL`,
      this.db.client`SELECT id AS "sourceId",name,code,description,color,workflow_template AS "workflowTemplate",archived_at IS NOT NULL AS archived FROM projects WHERE workspace_id=${workspaceId} AND deleted_at IS NULL ORDER BY created_at`,
      this.db.client`SELECT id AS "sourceId",project_id AS "projectSourceId",key,name,color,state_type AS "stateType",position FROM board_columns WHERE workspace_id=${workspaceId} ORDER BY position`,
      this.db.client`SELECT wt.project_id AS "projectSourceId",source.id AS "fromColumnSourceId",target.id AS "toColumnSourceId",wt.name,wt.bug_name AS "bugName",wt.requires_comment AS "requiresComment",wt.position FROM workflow_transitions wt JOIN board_columns source ON source.id=wt.from_column_id JOIN board_columns target ON target.id=wt.to_column_id WHERE wt.workspace_id=${workspaceId} ORDER BY wt.position`,
      this.db.client`SELECT id AS "sourceId",project_id AS "projectSourceId",column_id AS "columnSourceId",number,title,description,kind,type_fields AS "typeFields",priority,due_date AS "dueDate",position,version,archived_at IS NOT NULL AS archived FROM tasks WHERE workspace_id=${workspaceId} AND deleted_at IS NULL ORDER BY project_id,number`,
      this.db.client`SELECT ta.task_id AS "taskSourceId",u.email FROM task_assignees ta JOIN users u ON u.id=ta.user_id WHERE ta.workspace_id=${workspaceId}`,
      this.db.client`SELECT tl.task_id AS "taskSourceId",l.name FROM task_labels tl JOIN labels l ON l.id=tl.label_id WHERE tl.workspace_id=${workspaceId}`,
      this.db.client`SELECT task_id AS "taskSourceId",title,is_done AS "isDone",position FROM checklist_items WHERE workspace_id=${workspaceId} ORDER BY position`,
      this.db.client`SELECT c.task_id AS "taskSourceId",c.body,c.status,u.email AS "authorEmail",c.created_at AS "createdAt",coalesce((SELECT json_agg(ca.asset_id) FROM comment_assets ca WHERE ca.comment_id=c.id),'[]') AS "assetSourceIds" FROM comments c JOIN users u ON u.id=c.author_id WHERE c.workspace_id=${workspaceId} AND c.deleted_at IS NULL ORDER BY c.created_at`,
      this.db.client`SELECT id AS "sourceId",project_id AS "projectSourceId",title,kind,status,content,version FROM documents WHERE workspace_id=${workspaceId} ORDER BY updated_at`,
      this.db.client`SELECT document_id AS "documentSourceId",version,title,kind,status,content,change_note AS "changeNote",created_at AS "createdAt" FROM document_versions WHERE workspace_id=${workspaceId} ORDER BY document_id,version`,
      this.db.client`SELECT id AS "sourceId",project_id AS "projectSourceId",title,goal,status,source,version FROM plans WHERE workspace_id=${workspaceId} ORDER BY created_at`,
      this.db.client`SELECT plan_id AS "planSourceId",position,title,description,kind,priority,task_id AS "taskSourceId" FROM plan_items WHERE workspace_id=${workspaceId} ORDER BY plan_id,position`,
      this.db.client`SELECT id AS "sourceId",original_name AS "originalName",content_type AS "contentType",size_bytes AS "sizeBytes",sha256,storage_key AS "storageKey" FROM assets WHERE workspace_id=${workspaceId} ORDER BY created_at`,
    ]) as [ExportRow[],ExportRow[],ExportRow[],ExportRow[],ExportRow[],ExportRow[],ExportRow[],ExportRow[],ExportRow[],ExportRow[],ExportRow[],ExportRow[],ExportRow[],ExportRow[]]
    const taskRows:ExportRow[]=tasks.map(task=>({...task,position:Number(task.position),assigneeEmails:assignees.filter(row=>row.taskSourceId===task.sourceId).map(row=>String(row.email)),labels:labels.filter(row=>row.taskSourceId===task.sourceId).map(row=>String(row.name)),checklist:checks.filter(row=>row.taskSourceId===task.sourceId).map(row=>({title:String(row.title),isDone:Boolean(row.isDone),position:Number(row.position)})),comments:comments.filter(row=>row.taskSourceId===task.sourceId).map(row=>({body:String(row.body),authorEmail:String(row.authorEmail),createdAt:iso(row.createdAt),status:row.status,assetSourceIds:row.assetSourceIds}))}))
    return{schemaVersion:4,workspace:{name:workspace!.name},members:members as WorkspaceSnapshot['members'],projects:projects.map(project=>({...project,columns:columns.filter(column=>column.projectSourceId===project.sourceId).map(({projectSourceId:_,...column})=>({...column,position:Number(column.position)})),transitions:transitions.filter(transition=>transition.projectSourceId===project.sourceId).map(({projectSourceId:_,...transition})=>({...transition,position:Number(transition.position)})),tasks:taskRows.filter(task=>task.projectSourceId===project.sourceId).map(({projectSourceId:_,...task})=>task)})) as WorkspaceSnapshot['projects'],documents:documents.map(document=>({...document,versions:versions.filter(version=>version.documentSourceId===document.sourceId).map(({documentSourceId:_,...version})=>({...version,createdAt:iso(version.createdAt)}))})) as WorkspaceSnapshot['documents'],plans:plans.map(plan=>({...plan,items:planItems.filter(item=>item.planSourceId===plan.sourceId).map(({planSourceId:_,...item})=>item)})) as WorkspaceSnapshot['plans'],assets:assets.map(({storageKey:_,...asset})=>asset) as WorkspaceSnapshot['assets']}
  }

  async archive(workspaceId:string,userId:string){const snapshot=await this.snapshot(workspaceId,userId),rows=await this.db.client<{id:string;storageKey:string}[]>`SELECT id,storage_key AS "storageKey" FROM assets WHERE workspace_id=${workspaceId}`,files=new Map<string,Uint8Array>();for(const row of rows)files.set(row.id,await readFile(assetPath(row.storageKey)));return createArchive(snapshot,files)}
  preview(data:Uint8Array){const snapshot=readArchive(data);return{workspaceName:snapshot.workspace.name,suggestedName:`${snapshot.workspace.name} 恢复`,counts:{members:snapshot.members.length,projects:snapshot.projects.length,tasks:snapshot.projects.reduce((total,project)=>total+project.tasks.length,0),documents:snapshot.documents.length,plans:snapshot.plans.length,assets:snapshot.assets.length}}}

  async restore(data:Uint8Array,userId:string){
    const {snapshot,assetFiles}=readArchiveBundle(data),slug=`${snapshot.workspace.name.toLowerCase().replace(/\W+/g,'-').slice(0,32)}-${randomBytes(3).toString('hex')}`,now=new Date().toISOString()
    const createdPaths:string[]=[]
    try{return await this.db.client.begin(async sql=>{
      const [workspace]=await sql<{id:string;name:string}[]>`INSERT INTO workspaces(name,slug,created_by) VALUES(${`${snapshot.workspace.name} 恢复`},${slug},${userId}) RETURNING id,name`
      await sql`INSERT INTO memberships(workspace_id,user_id,role) VALUES(${workspace!.id},${userId},'OWNER')`
      for(const member of snapshot.members){const [user]=await sql<{id:string}[]>`SELECT id FROM users WHERE email=${member.email}`;if(user&&user.id!==userId)await sql`INSERT INTO memberships(workspace_id,user_id,role) VALUES(${workspace!.id},${user.id},${member.role==='OWNER'?'ADMIN':member.role}::member_role) ON CONFLICT DO NOTHING`}
      const projectIds=new Map<string,string>(),taskIds=new Map<string,string>(),assetIds=new Map<string,string>()
      for(const asset of snapshot.assets){const storageKey=join(workspace!.id,asset.sha256.slice(0,2),asset.sha256),path=assetPath(storageKey);await mkdir(dirname(path),{recursive:true});await writeFile(path,assetFiles.get(asset.sourceId)!,{flag:'wx'}).then(()=>createdPaths.push(path)).catch(error=>{if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error});const [created]=await sql<{id:string}[]>`INSERT INTO assets(workspace_id,uploaded_by,original_name,content_type,size_bytes,sha256,storage_key) VALUES(${workspace!.id},${userId},${asset.originalName},${asset.contentType},${asset.sizeBytes},${asset.sha256},${storageKey}) RETURNING id`;assetIds.set(asset.sourceId,created!.id)}
      for(const project of snapshot.projects){
        const [created]=await sql<{id:string}[]>`INSERT INTO projects(workspace_id,name,code,description,color,lead_id,workflow_template,archived_at) VALUES(${workspace!.id},${project.name},${project.code},${project.description},${project.color},${userId},${project.workflowTemplate??'CUSTOM'},${project.archived?now:null}) RETURNING id`;projectIds.set(project.sourceId,created!.id)
        const restoredColumnIds=new Map<string,string>(),restoredColumnId=(sourceId:string)=>{const id=restoredColumnIds.get(sourceId);if(!id)throw new BadRequestException({code:'BACKUP_WORKFLOW_INVALID',message:'备份中的任务或流程引用了其他项目的状态'});return id}
        for(const [index,column] of project.columns.entries()){const last=project.columns.length-1,state=column.stateType??(index===0?'BACKLOG':index===last?'DONE':index===last-1?'REVIEW':'ACTIVE'),key=column.key??(index===0?'BACKLOG':index===last?'DONE':index===last-1?'REVIEW':index===1?'ACTIVE':`ACTIVE_${index+1}`);const [next]=await sql<{id:string}[]>`INSERT INTO board_columns(workspace_id,project_id,key,name,color,state_type,position) VALUES(${workspace!.id},${created!.id},${key},${column.name},${column.color},${state},${column.position}) RETURNING id`;restoredColumnIds.set(column.sourceId,next!.id)}
        if(project.transitions?.length){for(const transition of project.transitions)await sql`INSERT INTO workflow_transitions(workspace_id,project_id,from_column_id,to_column_id,name,bug_name,requires_comment,position) VALUES(${workspace!.id},${created!.id},${restoredColumnId(transition.fromColumnSourceId)},${restoredColumnId(transition.toColumnSourceId)},${transition.name},${transition.bugName},${transition.requiresComment},${transition.position})`}
        else for(const [index,column] of project.columns.entries()){const next=project.columns[index+1];if(next)await sql`INSERT INTO workflow_transitions(workspace_id,project_id,from_column_id,to_column_id,name,bug_name,position) VALUES(${workspace!.id},${created!.id},${restoredColumnId(column.sourceId)},${restoredColumnId(next.sourceId)},'下一状态','下一状态',${(index+1)*1000})`;if((column.stateType==='REVIEW'||(!column.stateType&&index===project.columns.length-2))&&index>0){const previous=project.columns[index-1]!;await sql`INSERT INTO workflow_transitions(workspace_id,project_id,from_column_id,to_column_id,name,bug_name,requires_comment,position) VALUES(${workspace!.id},${created!.id},${restoredColumnId(column.sourceId)},${restoredColumnId(previous.sourceId)},'驳回修改','验证失败',true,${(index+1)*1000+500})`}}
        for(const task of project.tasks){const [next]=await sql<{id:string}[]>`INSERT INTO tasks(workspace_id,project_id,column_id,number,title,description,kind,type_fields,priority,creator_id,due_date,position,version,archived_at) VALUES(${workspace!.id},${created!.id},${restoredColumnId(task.columnSourceId)},${task.number},${task.title},${task.description},${task.kind},${JSON.stringify(task.typeFields)}::jsonb,${task.priority},${userId},${task.dueDate},${task.position},${task.version},${task.archived?now:null}) RETURNING id`;taskIds.set(task.sourceId,next!.id)
          for(const email of task.assigneeEmails)await sql`INSERT INTO task_assignees(workspace_id,task_id,user_id) SELECT ${workspace!.id},${next!.id},u.id FROM users u JOIN memberships m ON m.user_id=u.id AND m.workspace_id=${workspace!.id} WHERE u.email=${email} ON CONFLICT DO NOTHING`
          for(const name of task.labels){const [label]=await sql<{id:string}[]>`INSERT INTO labels(workspace_id,name) VALUES(${workspace!.id},${name}) ON CONFLICT(workspace_id,name) DO UPDATE SET name=excluded.name RETURNING id`;await sql`INSERT INTO task_labels(workspace_id,task_id,label_id) VALUES(${workspace!.id},${next!.id},${label!.id}) ON CONFLICT DO NOTHING`}
          for(const item of task.checklist)await sql`INSERT INTO checklist_items(workspace_id,task_id,title,is_done,position) VALUES(${workspace!.id},${next!.id},${item.title},${item.isDone},${item.position})`
          for(const comment of task.comments){const [author]=await sql<{id:string}[]>`SELECT id FROM users WHERE email=${comment.authorEmail}`;const [createdComment]=await sql<{id:string}[]>`INSERT INTO comments(workspace_id,task_id,author_id,body,status,created_at) VALUES(${workspace!.id},${next!.id},${author?.id??userId},${comment.body},${comment.status},${comment.createdAt}) RETURNING id`;for(const sourceId of comment.assetSourceIds){const assetId=assetIds.get(sourceId);if(assetId)await sql`INSERT INTO comment_assets(workspace_id,comment_id,asset_id) VALUES(${workspace!.id},${createdComment!.id},${assetId})`}}
        }
        await sql`UPDATE projects SET next_task_number=${Math.max(0,...project.tasks.map(task=>task.number))+1} WHERE id=${created!.id}`
      }
      for(const document of snapshot.documents){const [next]=await sql<{id:string}[]>`INSERT INTO documents(workspace_id,project_id,title,kind,status,content,version,created_by,updated_by) VALUES(${workspace!.id},${document.projectSourceId?projectIds.get(document.projectSourceId)??null:null},${document.title},${document.kind},${document.status},${document.content},${document.version},${userId},${userId}) RETURNING id`;for(const version of document.versions)await sql`INSERT INTO document_versions(workspace_id,document_id,project_id,title,kind,status,content,version,change_note,created_by,created_at) VALUES(${workspace!.id},${next!.id},${document.projectSourceId?projectIds.get(document.projectSourceId)??null:null},${version.title},${version.kind},${version.status},${version.content},${version.version},${version.changeNote},${userId},${version.createdAt})`}
      for(const plan of snapshot.plans){const [next]=await sql<{id:string}[]>`INSERT INTO plans(workspace_id,project_id,title,goal,status,source,version,created_by,updated_by,applied_at) VALUES(${workspace!.id},${projectIds.get(plan.projectSourceId)!},${plan.title},${plan.goal},${plan.status},${plan.source},${plan.version},${userId},${userId},${plan.status==='APPLIED'?now:null}) RETURNING id`;for(const item of plan.items)await sql`INSERT INTO plan_items(workspace_id,plan_id,position,title,description,kind,priority,task_id) VALUES(${workspace!.id},${next!.id},${item.position},${item.title},${item.description},${item.kind},${item.priority},${item.taskSourceId?taskIds.get(item.taskSourceId)??null:null})`}
      await sql`INSERT INTO audit_logs(workspace_id,actor_id,action,entity_type,entity_id,request_id,after_data) VALUES(${workspace!.id},${userId},'workspace.imported','workspace',${workspace!.id},'import',${JSON.stringify(this.preview(data).counts)}::jsonb)`
      return workspace
    })}catch(error){await Promise.all(createdPaths.map(path=>unlink(path).catch(()=>undefined)));throw error}
  }
}

const upload=FileInterceptor('file',{limits:{fileSize:300*1024*1024,files:1}})

@Controller('workspaces')
export class TransferController {
  constructor(private readonly transfer:TransferService){}
  @Get(':workspaceId/export')async export(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string,@Res() res:Response){const archive=await this.transfer.archive(workspaceId,req.user!.id);res.setHeader('content-type','application/zip');res.setHeader('content-disposition',`attachment; filename="taskharbor-${new Date().toISOString().slice(0,10)}.zip"`);res.send(Buffer.from(archive))}
  @Post('import/preview')@UseInterceptors(upload)preview(@UploadedFile() file?:Upload){return this.transfer.preview(fileData(file))}
  @Post('import')@UseInterceptors(upload)restore(@Req() req:AppRequest,@UploadedFile() file?:Upload){return this.transfer.restore(fileData(file),req.user!.id)}
}
