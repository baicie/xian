import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Injectable, NotFoundException, Param, Patch, Post, Query, Req, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { z } from 'zod'
import { DatabaseService } from '../database/database.service.js'
import { commentSchema, taskPatchSchema, taskSchema } from '../common/contracts.js'
import { AppRequest, parse } from '../common/http.js'
import { WorkspaceService } from './workspaces.js'
import { analyzeTaskWorkbook, normalizeTaskTitle, type TaskWorkbookMapping } from './task-xlsx.js'

const listSchema=z.object({projectId:z.string().uuid().optional(),query:z.string().max(200).optional(),priority:z.enum(['HIGH','MEDIUM','LOW']).optional(),kind:z.enum(['TASK','STORY','BUG']).optional(),archived:z.preprocess(value=>value==='true',z.boolean()).default(false),page:z.coerce.number().int().min(1).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(50)})
const workbookMappingSchema=z.object({titleColumn:z.number().int().min(0).max(49),descriptionColumns:z.array(z.number().int().min(0).max(49)).max(48),kindColumn:z.number().int().min(0).max(49).nullable(),priorityColumn:z.number().int().min(0).max(49).nullable()}).strict()
const importFieldsSchema=z.object({projectId:z.string().uuid(),columnId:z.string().uuid().optional(),mapping:z.string().max(5000).optional()}).strict()

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
    const data=await this.db.client`SELECT t.id,t.number,t.kind,t.title,t.description,t.priority,t.due_date AS "dueDate",t.position,t.version,t.project_id AS "projectId",t.column_id AS "columnId",p.code,c.name AS "columnName",coalesce(json_agg(json_build_object('id',u.id,'name',u.name)) FILTER(WHERE u.id IS NOT NULL),'[]') AS assignees,coalesce((SELECT json_agg(l.name ORDER BY l.name) FROM task_labels tl JOIN labels l ON l.id=tl.label_id WHERE tl.task_id=t.id),'[]') AS labels FROM tasks t JOIN projects p ON p.id=t.project_id JOIN board_columns c ON c.id=t.column_id LEFT JOIN task_assignees ta ON ta.task_id=t.id LEFT JOIN users u ON u.id=ta.user_id WHERE t.workspace_id=${workspaceId} AND t.deleted_at IS NULL AND ((${q.archived}=true AND t.archived_at IS NOT NULL) OR (${q.archived}=false AND t.archived_at IS NULL)) AND (${project}::uuid IS NULL OR t.project_id=${project}) AND (${needle}::text IS NULL OR t.title ILIKE ${needle}) AND (${priority}::task_priority IS NULL OR t.priority=${priority}) AND (${kind}::task_kind IS NULL OR t.kind=${kind}) GROUP BY t.id,p.code,c.name,c.position ORDER BY c.position,t.position LIMIT ${q.pageSize} OFFSET ${offset}`
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
  @Patch(':id') update(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string,@Param('id') id:string,@Body() body:unknown){return this.tasks.update(workspaceId,req.user!.id,id,parse(taskPatchSchema,body))}
  @Delete(':id') async remove(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string,@Param('id') id:string){await this.workspaces.role(workspaceId,req.user!.id,'task.delete');await this.db.client`UPDATE tasks SET deleted_at=now(),deleted_by=${req.user!.id} WHERE id=${id} AND workspace_id=${workspaceId}`;return{ok:true}}
  @Post(':id/archive') async archive(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string,@Param('id') id:string){await this.workspaces.role(workspaceId,req.user!.id,'task.update');await this.db.client`UPDATE tasks SET archived_at=now() WHERE id=${id} AND workspace_id=${workspaceId}`;return{ok:true}}
  @Post(':id/restore') async restore(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string,@Param('id') id:string){await this.workspaces.role(workspaceId,req.user!.id,'task.update');await this.db.client`UPDATE tasks SET archived_at=NULL,deleted_at=NULL,deleted_by=NULL WHERE id=${id} AND workspace_id=${workspaceId}`;return{ok:true}}
  @Get(':id/comments') async comments(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string,@Param('id') id:string){await this.workspaces.role(workspaceId,req.user!.id,'task.read');return this.db.client`SELECT c.id,c.body,c.created_at AS "createdAt",u.name AS author FROM comments c JOIN users u ON u.id=c.author_id WHERE c.workspace_id=${workspaceId} AND c.task_id=${id} AND c.deleted_at IS NULL ORDER BY c.created_at`}
  @Post(':id/comments') async comment(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string,@Param('id') id:string,@Body() body:unknown){await this.workspaces.role(workspaceId,req.user!.id,'comment.create');const input=parse(commentSchema,body);const [row]=await this.db.client`INSERT INTO comments(workspace_id,task_id,author_id,body) VALUES(${workspaceId},${id},${req.user!.id},${input.body}) RETURNING id,body,created_at AS "createdAt"`;return row}
  @Get(':id/activities') async activities(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string,@Param('id') id:string){await this.workspaces.role(workspaceId,req.user!.id,'task.read');return this.db.client`SELECT a.id,a.action,a.data,a.created_at AS "createdAt",u.name AS actor FROM activities a JOIN users u ON u.id=a.actor_id WHERE a.workspace_id=${workspaceId} AND a.task_id=${id} ORDER BY a.created_at DESC`}
}
