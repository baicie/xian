import { BadRequestException, Body, ConflictException, Controller, Get, Injectable, NotFoundException, Param, Patch, Post, Req } from '@nestjs/common'
import type { Sql, TransactionSql } from 'postgres'
import { DatabaseService } from '../database/database.service.js'
import { planCreateSchema, planUpdateSchema } from '../common/contracts.js'
import { AppRequest, parse } from '../common/http.js'
import { WorkspaceService } from './workspaces.js'

type CreatePlan=ReturnType<typeof planCreateSchema.parse>
type UpdatePlan=ReturnType<typeof planUpdateSchema.parse>

@Injectable()
export class PlanService {
  constructor(private readonly db:DatabaseService,private readonly workspaces:WorkspaceService) {}

  async list(workspaceId:string,userId:string) {
    await this.workspaces.role(workspaceId,userId,'plan.read')
    return this.db.client`SELECT p.id,p.project_id AS "projectId",pr.name AS "projectName",p.title,p.goal,p.status,p.source,p.version,p.updated_at AS "updatedAt",count(i.id)::int AS "itemCount" FROM plans p JOIN projects pr ON pr.id=p.project_id LEFT JOIN plan_items i ON i.plan_id=p.id WHERE p.workspace_id=${workspaceId} GROUP BY p.id,pr.name ORDER BY p.updated_at DESC`
  }

  async get(workspaceId:string,userId:string,planId:string) {
    await this.workspaces.role(workspaceId,userId,'plan.read')
    return this.record(this.db.client,workspaceId,planId)
  }

  async create(workspaceId:string,userId:string,input:CreatePlan,source='WEB') {
    await this.workspaces.role(workspaceId,userId,'plan.create')
    await this.assertProject(workspaceId,input.projectId)
    return this.db.client.begin(async sql=>{
      const [plan]=await sql<{id:string}[]>`INSERT INTO plans(workspace_id,project_id,title,goal,source,created_by,updated_by) VALUES(${workspaceId},${input.projectId},${input.title},${input.goal},${source},${userId},${userId}) RETURNING id,project_id AS "projectId",title,goal,status,source,version,created_at AS "createdAt",updated_at AS "updatedAt"`
      for(const [index,item] of input.items.entries())await sql`INSERT INTO plan_items(workspace_id,plan_id,position,title,description,kind,priority) VALUES(${workspaceId},${plan!.id},${index+1},${item.title},${item.description},${item.kind},${item.priority})`
      return this.record(sql,workspaceId,plan!.id)
    })
  }

  async update(workspaceId:string,userId:string,planId:string,input:UpdatePlan) {
    await this.workspaces.role(workspaceId,userId,'plan.update')
    return this.db.client.begin(async sql=>{
      const [current]=await sql<{version:number;status:string}[]>`SELECT version,status FROM plans WHERE id=${planId} AND workspace_id=${workspaceId} FOR UPDATE`
      if(!current)throw new NotFoundException({code:'PLAN_NOT_FOUND',message:'计划不存在'})
      if(current.status!=='DRAFT')throw new BadRequestException({code:'PLAN_ALREADY_APPLIED',message:'已应用的计划不能修改'})
      if(current.version!==input.version)throw new ConflictException({code:'PLAN_VERSION_CONFLICT',message:'计划已被其他人更新，请刷新后重试'})
      await sql`UPDATE plans SET title=coalesce(${input.title??null},title),goal=coalesce(${input.goal??null},goal),version=version+1,updated_by=${userId},updated_at=now() WHERE id=${planId} AND workspace_id=${workspaceId}`
      if(input.items){await sql`DELETE FROM plan_items WHERE plan_id=${planId} AND workspace_id=${workspaceId}`;for(const [index,item] of input.items.entries())await sql`INSERT INTO plan_items(workspace_id,plan_id,position,title,description,kind,priority) VALUES(${workspaceId},${planId},${index+1},${item.title},${item.description},${item.kind},${item.priority})`}
      return this.record(sql,workspaceId,planId)
    })
  }

  async apply(workspaceId:string,userId:string,planId:string,requestId='system') {
    await this.workspaces.role(workspaceId,userId,'plan.apply')
    return this.db.client.begin(async sql=>{
      const [plan]=await sql<{project_id:string;status:string}[]>`SELECT project_id,status FROM plans WHERE id=${planId} AND workspace_id=${workspaceId} FOR UPDATE`
      if(!plan)throw new NotFoundException({code:'PLAN_NOT_FOUND',message:'计划不存在'})
      if(plan.status==='APPLIED'){const rows=await sql<{taskId:string}[]>`SELECT task_id AS "taskId" FROM plan_items WHERE plan_id=${planId} ORDER BY position`;return{status:'APPLIED',alreadyApplied:true,taskIds:rows.map(row=>row.taskId)}}
      const [column]=await sql<{id:string}[]>`SELECT id FROM board_columns WHERE workspace_id=${workspaceId} AND project_id=${plan.project_id} ORDER BY position LIMIT 1`
      if(!column)throw new NotFoundException({code:'COLUMN_NOT_FOUND',message:'项目没有可用的看板列'})
      const items=await sql<{id:string;title:string;description:string;kind:string;priority:string}[]>`SELECT id,title,description,kind,priority FROM plan_items WHERE workspace_id=${workspaceId} AND plan_id=${planId} ORDER BY position`
      const taskIds:string[]=[]
      for(const [index,item] of items.entries()){
        const [project]=await sql<{number:number}[]>`UPDATE projects SET next_task_number=next_task_number+1 WHERE id=${plan.project_id} AND workspace_id=${workspaceId} AND deleted_at IS NULL RETURNING next_task_number-1 AS number`
        if(!project)throw new NotFoundException({code:'PROJECT_NOT_FOUND',message:'项目不存在'})
        const [task]=await sql<{id:string}[]>`INSERT INTO tasks(workspace_id,project_id,column_id,number,title,description,kind,priority,creator_id,position) VALUES(${workspaceId},${plan.project_id},${column.id},${project.number},${item.title},${item.description},${item.kind}::task_kind,${item.priority}::task_priority,${userId},${(index+1)*1000}) RETURNING id`
        taskIds.push(task!.id);await sql`UPDATE plan_items SET task_id=${task!.id} WHERE id=${item.id}`
      }
      await sql`UPDATE plans SET status='APPLIED',applied_at=now(),updated_at=now(),updated_by=${userId} WHERE id=${planId}`
      await sql`INSERT INTO audit_logs(workspace_id,actor_id,action,entity_type,entity_id,request_id,after_data) VALUES(${workspaceId},${userId},'plan.applied','plan',${planId},${requestId},${JSON.stringify({taskIds})}::jsonb)`
      return{status:'APPLIED',alreadyApplied:false,taskIds}
    })
  }

  private async assertProject(workspaceId:string,projectId:string){const [project]=await this.db.client`SELECT id FROM projects WHERE id=${projectId} AND workspace_id=${workspaceId} AND deleted_at IS NULL`;if(!project)throw new NotFoundException({code:'PROJECT_NOT_FOUND',message:'项目不存在'})}
  private async record(sql:Sql|TransactionSql,workspaceId:string,planId:string){const [plan]=await sql<Record<string,unknown>[]>`SELECT id,project_id AS "projectId",title,goal,status,source,version,applied_at AS "appliedAt",created_at AS "createdAt",updated_at AS "updatedAt" FROM plans WHERE id=${planId} AND workspace_id=${workspaceId}`;if(!plan)throw new NotFoundException({code:'PLAN_NOT_FOUND',message:'计划不存在'});plan.items=await sql`SELECT id,position,title,description,kind,priority,task_id AS "taskId" FROM plan_items WHERE workspace_id=${workspaceId} AND plan_id=${planId} ORDER BY position`;return plan}
}

@Controller('workspaces/:workspaceId/plans')
export class PlanController {
  constructor(private readonly plans:PlanService){}
  @Get() list(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string){return this.plans.list(workspaceId,req.user!.id)}
  @Post() create(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string,@Body() body:unknown){return this.plans.create(workspaceId,req.user!.id,parse(planCreateSchema,body))}
  @Get(':planId') get(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string,@Param('planId') planId:string){return this.plans.get(workspaceId,req.user!.id,planId)}
  @Patch(':planId') update(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string,@Param('planId') planId:string,@Body() body:unknown){return this.plans.update(workspaceId,req.user!.id,planId,parse(planUpdateSchema,body))}
  @Post(':planId/apply') apply(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string,@Param('planId') planId:string){return this.plans.apply(workspaceId,req.user!.id,planId,req.requestId)}
}
