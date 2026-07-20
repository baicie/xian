import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Injectable, NotFoundException, Param, Patch, Post, Query, Req, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { z } from 'zod'
import { DatabaseService } from '../database/database.service.js'
import { commentSchema, taskBulkSchema, taskPatchSchema, taskSchema } from '../common/contracts.js'
import { AppRequest, parse } from '../common/http.js'
import { WorkspaceService } from './workspaces.js'
import { analyzeTaskWorkbook, normalizeTaskTitle, type TaskWorkbookMapping } from './task-xlsx.js'

const listSchema=z.object({projectId:z.string().uuid().optional(),query:z.string().max(200).optional(),priority:z.enum(['HIGH','MEDIUM','LOW']).optional(),kind:z.enum(['TASK','STORY','BUG']).optional(),archived:z.preprocess(value=>value==='true',z.boolean()).default(false),page:z.coerce.number().int().min(1).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(50)})
const workbookMappingSchema=z.object({titleColumn:z.number().int().min(0).max(49),descriptionColumns:z.array(z.number().int().min(0).max(49)).max(48),kindColumn:z.number().int().min(0).max(49).nullable(),priorityColumn:z.number().int().min(0).max(49).nullable()}).strict()
const importFieldsSchema=z.object({projectId:z.string().uuid(),columnId:z.string().uuid().optional(),mapping:z.string().max(5000).optional()}).strict()
const subtaskCreateSchema=z.object({title:z.string().trim().min(1).max(300)}).strict()
const subtaskUpdateSchema=z.object({title:z.string().trim().min(1).max(300).optional(),isDone:z.boolean().optional()}).strict().refine(input=>input.title!==undefined||input.isDone!==undefined)
const subtaskReorderSchema=z.object({subtaskIds:z.array(z.string().uuid()).max(200).refine(ids=>new Set(ids).size===ids.length)}).strict()

function parseWorkbookMapping(value?:string):TaskWorkbookMapping|undefined{
  if(!value)return undefined
  try{return workbookMappingSchema.parse(JSON.parse(value))}catch{throw new BadRequestException({code:'TASK_XLSX_MAPPING_INVALID',message:'Excel 字段映射无效'})}
}

@Injectable()
export class TaskService {
  constructor(private readonly db:DatabaseService,private readonly workspaces:WorkspaceService) {}
  async list(workspaceId:string,userId:string,raw:unknown) {
    await this.workspaces.role(workspaceId,userId,'task.read')
    const q=parse(listSchema,raw),offset=(q.page-1)*q.pageSize,project=q.projectId??null,needle=q.query?`%${q.query}%`:null,priority=q.priority??null,kind=q.kind??null
    const data=await this.db.client`SELECT t.id,t.number,t.kind,t.title,t.description,t.priority,t.due_date AS "dueDate",t.position,t.version,t.project_id AS "projectId",t.column_id AS "columnId",p.code,c.name AS "columnName",(SELECT count(*)::int FROM checklist_items ci WHERE ci.task_id=t.id) AS "subtaskTotal",(SELECT count(*)::int FROM checklist_items ci WHERE ci.task_id=t.id AND ci.is_done) AS "subtaskDone",coalesce(json_agg(json_build_object('id',u.id,'name',u.name)) FILTER(WHERE u.id IS NOT NULL),'[]') AS assignees,coalesce((SELECT json_agg(l.name ORDER BY l.name) FROM task_labels tl JOIN labels l ON l.id=tl.label_id WHERE tl.task_id=t.id),'[]') AS labels FROM tasks t JOIN projects p ON p.id=t.project_id JOIN board_columns c ON c.id=t.column_id LEFT JOIN task_assignees ta ON ta.task_id=t.id LEFT JOIN users u ON u.id=ta.user_id WHERE t.workspace_id=${workspaceId} AND t.deleted_at IS NULL AND ((${q.archived}=true AND t.archived_at IS NOT NULL) OR (${q.archived}=false AND t.archived_at IS NULL)) AND (${project}::uuid IS NULL OR t.project_id=${project}) AND (${needle}::text IS NULL OR t.title ILIKE ${needle}) AND (${priority}::task_priority IS NULL OR t.priority=${priority}) AND (${kind}::task_kind IS NULL OR t.kind=${kind}) GROUP BY t.id,p.code,c.name,c.position ORDER BY c.position,t.position LIMIT ${q.pageSize} OFFSET ${offset}`
    const countRows=await this.db.client<{count:number}[]>`SELECT count(*)::int AS count FROM tasks WHERE workspace_id=${workspaceId} AND deleted_at IS NULL AND ((${q.archived}=true AND archived_at IS NOT NULL) OR (${q.archived}=false AND archived_at IS NULL)) AND (${project}::uuid IS NULL OR project_id=${project}) AND (${kind}::task_kind IS NULL OR kind=${kind})`
    const count=countRows[0]?.count??0
    return {data,pagination:{page:q.page,pageSize:q.pageSize,totalItems:count,totalPages:Math.ceil(count/q.pageSize)}}
  }
  async create(workspaceId:string,userId:string,input:ReturnType<typeof taskSchema.parse>) {
    await this.workspaces.role(workspaceId,userId,'task.create')
    const [column]=await this.db.client`SELECT 1 FROM board_columns WHERE id=${input.columnId} AND project_id=${input.projectId} AND workspace_id=${workspaceId}`
    if(!column)throw new NotFoundException({code:'COLUMN_NOT_FOUND',message:'看板列不存在'})
    return this.db.client.begin(async sql=>{
      const [project]=await sql<{number:number;code:string}[]>`UPDATE projects SET next_task_number=next_task_number+1 WHERE id=${input.projectId} AND workspace_id=${workspaceId} RETURNING next_task_number-1 AS number,code`
      if(!project)throw new NotFoundException({code:'PROJECT_NOT_FOUND',message:'项目不存在'})
      const positionRows=await sql<{position:number}[]>`SELECT coalesce(max(position),0)+1000 AS position FROM tasks WHERE column_id=${input.columnId}`
      const [task]=await sql<{id:string;version:number}[]>`INSERT INTO tasks(workspace_id,project_id,column_id,number,title,description,kind,priority,creator_id,due_date,position) VALUES(${workspaceId},${input.projectId},${input.columnId},${project.number},${input.title},${input.description},${input.kind},${input.priority},${userId},${input.dueDate},${positionRows[0]?.position??1000}) RETURNING id,version`
      for(const assignee of input.assigneeIds)await sql`INSERT INTO task_assignees(workspace_id,task_id,user_id) SELECT ${workspaceId},${task!.id},user_id FROM memberships WHERE workspace_id=${workspaceId} AND user_id=${assignee} AND disabled_at IS NULL`
      for(const name of input.labels){const [label]=await sql<{id:string}[]>`INSERT INTO labels(workspace_id,name) VALUES(${workspaceId},${name}) ON CONFLICT(workspace_id,name) DO UPDATE SET name=excluded.name RETURNING id`;await sql`INSERT INTO task_labels(workspace_id,task_id,label_id) VALUES(${workspaceId},${task!.id},${label!.id})`}
      await sql`INSERT INTO activities(workspace_id,task_id,actor_id,action,data) VALUES(${workspaceId},${task!.id},${userId},'task.created',${JSON.stringify({title:input.title,kind:input.kind})}::jsonb)`
      return {...task,key:`${project.code}-${project.number}`}
    })
  }
  private async analyzeXlsx(workspaceId:string,projectId:string,data:Buffer,mapping?:TaskWorkbookMapping){
    let analysis:Awaited<ReturnType<typeof analyzeTaskWorkbook>>
    try{analysis=await analyzeTaskWorkbook(data,mapping)}catch(error){throw new BadRequestException({code:'TASK_XLSX_INVALID',message:error instanceof Error?error.message:'Excel 文件无法解析'})}
    const existingRows=await this.db.client<{title:string}[]>`SELECT title FROM tasks WHERE workspace_id=${workspaceId} AND project_id=${projectId} AND deleted_at IS NULL`,existing=new Set(existingRows.map(row=>normalizeTaskTitle(row.title)))
    return{analysis,existing}
  }
  async previewXlsx(workspaceId:string,userId:string,projectId:string,data:Buffer,mapping?:TaskWorkbookMapping){
    await this.workspaces.role(workspaceId,userId,'task.create')
    const [project]=await this.db.client`SELECT 1 FROM projects WHERE id=${projectId} AND workspace_id=${workspaceId} AND deleted_at IS NULL`
    if(!project)throw new NotFoundException({code:'PROJECT_NOT_FOUND',message:'项目不存在'})
    const {analysis,existing}=await this.analyzeXlsx(workspaceId,projectId,data,mapping)
    let valid=0,invalid=0,duplicates=0
    const rows=analysis.rows.map(row=>{const duplicate=row.errors.length===0&&(row.duplicateInFile||existing.has(normalizeTaskTitle(row.title)));if(row.errors.length)invalid++;else if(duplicate)duplicates++;else valid++;return{...row,duplicate}})
    return{...analysis,rows,counts:{total:rows.length,valid,invalid,duplicates,ignored:analysis.ignoredRows}}
  }
  async importXlsx(workspaceId:string,userId:string,projectId:string,columnId:string,data:Buffer,mapping?:TaskWorkbookMapping) {
    await this.workspaces.role(workspaceId,userId,'task.create')
    const [column]=await this.db.client`SELECT 1 FROM board_columns WHERE id=${columnId} AND project_id=${projectId} AND workspace_id=${workspaceId}`
    if(!column)throw new NotFoundException({code:'COLUMN_NOT_FOUND',message:'看板列不存在'})
    const {analysis,existing}=await this.analyzeXlsx(workspaceId,projectId,data,mapping),seen=new Set<string>();let invalidRows=0,duplicateRows=0
    const tasks=analysis.rows.flatMap(row=>{if(row.errors.length){invalidRows++;return[]}const key=normalizeTaskTitle(row.title);if(row.duplicateInFile||seen.has(key)||existing.has(key)){duplicateRows++;return[]}seen.add(key);const {errors:_,duplicateInFile:__,...task}=row;return[task]})
    if(!tasks.length)return{imported:0,invalidRows,duplicateRows,ignoredRows:analysis.ignoredRows,sheetName:analysis.sheetName}
    return this.db.client.begin(async sql=>{
      const [project]=await sql<{startNumber:number;code:string}[]>`UPDATE projects SET next_task_number=next_task_number+${tasks.length} WHERE id=${projectId} AND workspace_id=${workspaceId} AND deleted_at IS NULL RETURNING next_task_number-${tasks.length} AS "startNumber",code`
      if(!project)throw new NotFoundException({code:'PROJECT_NOT_FOUND',message:'项目不存在'})
      const [position]=await sql<{value:number}[]>`SELECT coalesce(max(position),0) AS value FROM tasks WHERE column_id=${columnId}`
      for(const [index,item] of tasks.entries()){
        const number=project.startNumber+index
        const [task]=await sql<{id:string}[]>`INSERT INTO tasks(workspace_id,project_id,column_id,number,title,description,kind,priority,creator_id,position) VALUES(${workspaceId},${projectId},${columnId},${number},${item.title},${item.description},${item.kind},${item.priority},${userId},${Number(position?.value??0)+(index+1)*1000}) RETURNING id`
        await sql`INSERT INTO activities(workspace_id,task_id,actor_id,action,data) VALUES(${workspaceId},${task!.id},${userId},'task.imported',${JSON.stringify({sheet:analysis.sheetName,row:item.sourceRow})}::jsonb)`
      }
      return{imported:tasks.length,invalidRows,duplicateRows,ignoredRows:analysis.ignoredRows,sheetName:analysis.sheetName}
    })
  }
  async update(workspaceId:string,userId:string,id:string,input:ReturnType<typeof taskPatchSchema.parse>) {
    await this.workspaces.role(workspaceId,userId,'task.update')
    return this.db.client.begin(async sql=>{
      const [before]=await sql<{column_id:string;project_id:string;version:number}[]>`SELECT column_id,project_id,version FROM tasks WHERE id=${id} AND workspace_id=${workspaceId} AND deleted_at IS NULL`
      if(!before)throw new NotFoundException({code:'TASK_NOT_FOUND',message:'任务不存在'})
      if(input.columnId){const [column]=await sql`SELECT 1 FROM board_columns WHERE id=${input.columnId} AND project_id=${before.project_id} AND workspace_id=${workspaceId}`;if(!column)throw new NotFoundException({code:'COLUMN_NOT_FOUND',message:'看板列不存在'})}
      const [task]=await sql<{id:string;version:number}[]>`UPDATE tasks SET title=coalesce(${input.title??null},title),description=coalesce(${input.description??null},description),kind=coalesce(${input.kind??null}::task_kind,kind),priority=coalesce(${input.priority??null}::task_priority,priority),column_id=coalesce(${input.columnId??null}::uuid,column_id),due_date=CASE WHEN ${'dueDate' in input} THEN ${input.dueDate??null}::date ELSE due_date END,version=version+1,updated_at=now() WHERE id=${id} AND workspace_id=${workspaceId} AND version=${input.version} RETURNING id,version`
      if(!task)throw new ConflictException({code:'TASK_VERSION_CONFLICT',message:'任务已被其他成员修改',details:{currentVersion:before.version}})
      if(input.assigneeIds){await sql`DELETE FROM task_assignees WHERE task_id=${id} AND workspace_id=${workspaceId}`;for(const assignee of input.assigneeIds)await sql`INSERT INTO task_assignees(workspace_id,task_id,user_id) SELECT ${workspaceId},${id},user_id FROM memberships WHERE workspace_id=${workspaceId} AND user_id=${assignee} AND disabled_at IS NULL`}
      if(input.labels){await sql`DELETE FROM task_labels WHERE task_id=${id} AND workspace_id=${workspaceId}`;for(const name of input.labels){const [label]=await sql<{id:string}[]>`INSERT INTO labels(workspace_id,name) VALUES(${workspaceId},${name}) ON CONFLICT(workspace_id,name) DO UPDATE SET name=excluded.name RETURNING id`;await sql`INSERT INTO task_labels(workspace_id,task_id,label_id) VALUES(${workspaceId},${id},${label!.id})`}}
      await sql`INSERT INTO activities(workspace_id,task_id,actor_id,action,data) VALUES(${workspaceId},${id},${userId},'task.updated',${JSON.stringify({fromColumn:before.column_id,toColumn:input.columnId})}::jsonb)`
      return task
    })
  }
  async bulkUpdate(workspaceId:string,userId:string,input:ReturnType<typeof taskBulkSchema.parse>) {
    await this.workspaces.role(workspaceId,userId,input.action.type==='DELETE'?'task.delete':'task.update')
    return this.db.client.begin(async sql=>{
      if(input.action.type==='ASSIGN'){
        for(const assigneeId of input.action.assigneeIds){
          const [member]=await sql`SELECT 1 FROM memberships WHERE workspace_id=${workspaceId} AND user_id=${assigneeId} AND disabled_at IS NULL`
          if(!member)throw new BadRequestException({code:'ASSIGNEE_NOT_MEMBER',message:'负责人不是当前工作区的有效成员'})
        }
      }
      let updated=0
      for(const taskId of input.taskIds){
        const [task]=await sql<{projectId:string}[]>`SELECT project_id AS "projectId" FROM tasks WHERE id=${taskId} AND workspace_id=${workspaceId} AND deleted_at IS NULL`
        if(!task)throw new NotFoundException({code:'TASK_NOT_FOUND',message:'批量操作中包含不存在的任务'})
        if(input.action.type==='ASSIGN'){
          await sql`DELETE FROM task_assignees WHERE task_id=${taskId} AND workspace_id=${workspaceId}`
          for(const assigneeId of input.action.assigneeIds)await sql`INSERT INTO task_assignees(workspace_id,task_id,user_id) VALUES(${workspaceId},${taskId},${assigneeId})`
          await sql`UPDATE tasks SET version=version+1,updated_at=now() WHERE id=${taskId} AND workspace_id=${workspaceId}`
        }else if(input.action.type==='MOVE'){
          const [column]=await sql`SELECT 1 FROM board_columns WHERE id=${input.action.columnId} AND project_id=${task.projectId} AND workspace_id=${workspaceId}`
          if(!column)throw new NotFoundException({code:'COLUMN_NOT_FOUND',message:'目标状态不属于所选任务的项目'})
          await sql`UPDATE tasks SET column_id=${input.action.columnId},version=version+1,updated_at=now() WHERE id=${taskId} AND workspace_id=${workspaceId}`
        }else if(input.action.type==='PRIORITY'){
          await sql`UPDATE tasks SET priority=${input.action.priority},version=version+1,updated_at=now() WHERE id=${taskId} AND workspace_id=${workspaceId}`
        }else if(input.action.type==='KIND'){
          await sql`UPDATE tasks SET kind=${input.action.kind},version=version+1,updated_at=now() WHERE id=${taskId} AND workspace_id=${workspaceId}`
        }else{
          await sql`UPDATE tasks SET deleted_at=now(),deleted_by=${userId},version=version+1,updated_at=now() WHERE id=${taskId} AND workspace_id=${workspaceId}`
        }
        await sql`INSERT INTO activities(workspace_id,task_id,actor_id,action,data) VALUES(${workspaceId},${taskId},${userId},${input.action.type==='DELETE'?'task.bulk_deleted':'task.bulk_updated'},${JSON.stringify(input.action)}::jsonb)`
        updated++
      }
      return{updated}
    })
  }
}

@Controller('workspaces/:workspaceId/tasks')
export class TaskController {
  constructor(private readonly tasks:TaskService,private readonly workspaces:WorkspaceService,private readonly db:DatabaseService) {}
  @Get() list(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string,@Query() query:unknown){return this.tasks.list(workspaceId,req.user!.id,query)}
  @Post() create(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string,@Body() body:unknown){return this.tasks.create(workspaceId,req.user!.id,parse(taskSchema,body))}
  @Post('import/xlsx/preview')@UseInterceptors(FileInterceptor('file',{limits:{fileSize:10*1024*1024,files:1}})) previewXlsx(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string,@Body() body:Record<string,string>,@UploadedFile() file?:{buffer:Buffer;originalname:string}){
    if(!file?.buffer)throw new BadRequestException({code:'TASK_XLSX_REQUIRED',message:'请选择 .xlsx 文件'})
    if(!file.originalname.toLowerCase().endsWith('.xlsx'))throw new BadRequestException({code:'TASK_XLSX_TYPE',message:'仅支持 .xlsx 文件'})
    const input=parse(importFieldsSchema,body)
    return this.tasks.previewXlsx(workspaceId,req.user!.id,input.projectId,file.buffer,parseWorkbookMapping(input.mapping))
  }
  @Post('import/xlsx')@UseInterceptors(FileInterceptor('file',{limits:{fileSize:10*1024*1024,files:1}})) importXlsx(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string,@Body() body:Record<string,string>,@UploadedFile() file?:{buffer:Buffer;originalname:string}){
    if(!file?.buffer)throw new BadRequestException({code:'TASK_XLSX_REQUIRED',message:'请选择 .xlsx 文件'})
    if(!file.originalname.toLowerCase().endsWith('.xlsx'))throw new BadRequestException({code:'TASK_XLSX_TYPE',message:'仅支持 .xlsx 文件'})
    const input=parse(importFieldsSchema.extend({columnId:z.string().uuid()}),body)
    return this.tasks.importXlsx(workspaceId,req.user!.id,input.projectId,input.columnId,file.buffer,parseWorkbookMapping(input.mapping))
  }
  @Patch('bulk') bulkUpdate(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string,@Body() body:unknown){return this.tasks.bulkUpdate(workspaceId,req.user!.id,parse(taskBulkSchema,body))}
  @Patch(':id') update(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string,@Param('id') id:string,@Body() body:unknown){return this.tasks.update(workspaceId,req.user!.id,id,parse(taskPatchSchema,body))}
  @Delete(':id') async remove(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string,@Param('id') id:string){await this.workspaces.role(workspaceId,req.user!.id,'task.delete');await this.db.client`UPDATE tasks SET deleted_at=now(),deleted_by=${req.user!.id} WHERE id=${id} AND workspace_id=${workspaceId}`;return{ok:true}}
  @Post(':id/archive') async archive(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string,@Param('id') id:string){await this.workspaces.role(workspaceId,req.user!.id,'task.update');await this.db.client`UPDATE tasks SET archived_at=now() WHERE id=${id} AND workspace_id=${workspaceId}`;return{ok:true}}
  @Post(':id/restore') async restore(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string,@Param('id') id:string){await this.workspaces.role(workspaceId,req.user!.id,'task.update');await this.db.client`UPDATE tasks SET archived_at=NULL,deleted_at=NULL,deleted_by=NULL WHERE id=${id} AND workspace_id=${workspaceId}`;return{ok:true}}
  @Get(':id/subtasks') async subtasks(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string,@Param('id') id:string){await this.workspaces.role(workspaceId,req.user!.id,'task.read');return this.db.client`SELECT ci.id,ci.title,ci.is_done AS "isDone",ci.position FROM checklist_items ci JOIN tasks t ON t.id=ci.task_id WHERE ci.workspace_id=${workspaceId} AND ci.task_id=${id} AND t.deleted_at IS NULL ORDER BY ci.position,ci.id`}
  @Post(':id/subtasks') async addSubtask(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string,@Param('id') id:string,@Body() body:unknown){await this.workspaces.role(workspaceId,req.user!.id,'task.update');const input=parse(subtaskCreateSchema,body);const [row]=await this.db.client`INSERT INTO checklist_items(workspace_id,task_id,title,position) SELECT ${workspaceId},${id},${input.title},coalesce((SELECT max(position)+1000 FROM checklist_items WHERE task_id=${id}),1000) WHERE EXISTS(SELECT 1 FROM tasks WHERE id=${id} AND workspace_id=${workspaceId} AND deleted_at IS NULL) RETURNING id,title,is_done AS "isDone",position`;if(!row)throw new NotFoundException({code:'TASK_NOT_FOUND',message:'任务不存在'});return row}
  @Patch(':id/subtasks/reorder') async reorderSubtasks(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string,@Param('id') id:string,@Body() body:unknown){await this.workspaces.role(workspaceId,req.user!.id,'task.update');const input=parse(subtaskReorderSchema,body);return this.db.client.begin(async sql=>{const [summary]=await sql<{count:number}[]>`SELECT count(*)::int AS count FROM checklist_items WHERE task_id=${id} AND workspace_id=${workspaceId}`;if((summary?.count??0)!==input.subtaskIds.length)throw new BadRequestException({code:'SUBTASK_ORDER_INVALID',message:'子任务排序数据不完整'});for(const [index,subtaskId] of input.subtaskIds.entries()){const [row]=await sql`UPDATE checklist_items SET position=${(index+1)*1000} WHERE id=${subtaskId} AND task_id=${id} AND workspace_id=${workspaceId} RETURNING id`;if(!row)throw new BadRequestException({code:'SUBTASK_ORDER_INVALID',message:'子任务排序包含无效项目'})}return{ok:true}})}
  @Patch(':id/subtasks/:subtaskId') async updateSubtask(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string,@Param('id') id:string,@Param('subtaskId') subtaskId:string,@Body() body:unknown){await this.workspaces.role(workspaceId,req.user!.id,'task.update');const input=parse(subtaskUpdateSchema,body);const [row]=await this.db.client`UPDATE checklist_items SET title=coalesce(${input.title??null},title),is_done=coalesce(${input.isDone??null},is_done) WHERE id=${subtaskId} AND task_id=${id} AND workspace_id=${workspaceId} RETURNING id,title,is_done AS "isDone",position`;if(!row)throw new NotFoundException({code:'SUBTASK_NOT_FOUND',message:'子任务不存在'});return row}
  @Delete(':id/subtasks/:subtaskId') async removeSubtask(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string,@Param('id') id:string,@Param('subtaskId') subtaskId:string){await this.workspaces.role(workspaceId,req.user!.id,'task.update');const [row]=await this.db.client`DELETE FROM checklist_items WHERE id=${subtaskId} AND task_id=${id} AND workspace_id=${workspaceId} RETURNING id`;if(!row)throw new NotFoundException({code:'SUBTASK_NOT_FOUND',message:'子任务不存在'});return{ok:true}}
  @Get(':id/comments') async comments(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string,@Param('id') id:string){await this.workspaces.role(workspaceId,req.user!.id,'task.read');return this.db.client`SELECT c.id,c.body,c.status,c.created_at AS "createdAt",u.name AS author,coalesce(json_agg(json_build_object('id',a.id,'name',a.original_name,'contentType',a.content_type,'sizeBytes',a.size_bytes)) FILTER(WHERE a.id IS NOT NULL),'[]') AS assets FROM comments c JOIN users u ON u.id=c.author_id LEFT JOIN comment_assets ca ON ca.comment_id=c.id LEFT JOIN assets a ON a.id=ca.asset_id WHERE c.workspace_id=${workspaceId} AND c.task_id=${id} AND c.deleted_at IS NULL GROUP BY c.id,u.name ORDER BY c.created_at`}
  @Post(':id/comments') async comment(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string,@Param('id') id:string,@Body() body:unknown){await this.workspaces.role(workspaceId,req.user!.id,'comment.create');const input=parse(commentSchema,body);return this.db.client.begin(async sql=>{const [task]=await sql`SELECT 1 FROM tasks WHERE id=${id} AND workspace_id=${workspaceId} AND deleted_at IS NULL`;if(!task)throw new NotFoundException({code:'TASK_NOT_FOUND',message:'任务不存在'});if(input.assetIds.length){const rows=await sql`SELECT id FROM assets WHERE workspace_id=${workspaceId} AND id IN ${sql(input.assetIds)}`;if(rows.length!==new Set(input.assetIds).size)throw new BadRequestException({code:'COMMENT_ASSET_INVALID',message:'评论中包含无效资源'})}const [row]=await sql<{id:string;body:string;status:string;createdAt:string}[]>`INSERT INTO comments(workspace_id,task_id,author_id,body,status) VALUES(${workspaceId},${id},${req.user!.id},${input.body},${input.status}) RETURNING id,body,status,created_at AS "createdAt"`;for(const assetId of new Set(input.assetIds))await sql`INSERT INTO comment_assets(workspace_id,comment_id,asset_id) VALUES(${workspaceId},${row!.id},${assetId})`;await sql`INSERT INTO activities(workspace_id,task_id,actor_id,action,data) VALUES(${workspaceId},${id},${req.user!.id},'comment.created',${JSON.stringify({status:input.status,assetCount:input.assetIds.length})}::jsonb)`;return{...row,author:req.user!.name,assets:[]}})}
  @Patch(':id/comments/:commentId') async updateComment(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string,@Param('id') id:string,@Param('commentId') commentId:string,@Body() body:unknown){await this.workspaces.role(workspaceId,req.user!.id,'comment.create');const input=parse(z.object({status:z.enum(['OPEN','RESOLVED'])}).strict(),body);const [row]=await this.db.client`UPDATE comments SET status=${input.status} WHERE id=${commentId} AND task_id=${id} AND workspace_id=${workspaceId} AND deleted_at IS NULL RETURNING id,status`;if(!row)throw new NotFoundException({code:'COMMENT_NOT_FOUND',message:'评论不存在'});return row}
  @Get(':id/activities') async activities(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string,@Param('id') id:string){await this.workspaces.role(workspaceId,req.user!.id,'task.read');return this.db.client`SELECT a.id,a.action,a.data,a.created_at AS "createdAt",u.name AS actor FROM activities a JOIN users u ON u.id=a.actor_id WHERE a.workspace_id=${workspaceId} AND a.task_id=${id} ORDER BY a.created_at DESC`}
}
