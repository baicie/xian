import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common'
import { z } from 'zod'
import { DatabaseService } from '../database/database.service.js'
import { AppRequest, Public, parse } from '../common/http.js'
import { WorkspaceService } from './workspaces.js'

@Controller()
export class SystemController {
  constructor(private readonly db:DatabaseService,private readonly workspaces:WorkspaceService) {}
  @Public() @Get('health/live') live(){return{status:'ok'}}
  @Public() @Get('health/ready') async ready(){await this.db.client`SELECT 1`;return{status:'ready'}}
  @Get('notifications') async notifications(@Req() req:AppRequest,@Query() query:unknown){const input=parse(z.object({workspaceId:z.string().uuid()}).strict(),query);await this.workspaces.role(input.workspaceId,req.user!.id,'workspace.read');const items=await this.db.client`SELECT n.id,n.title,n.body,n.action,n.task_id AS "taskId",n.is_read AS "isRead",n.created_at AS "createdAt",u.name AS "actorName",p.code,t.number,t.title AS "taskTitle" FROM notifications n LEFT JOIN users u ON u.id=n.actor_id LEFT JOIN tasks t ON t.id=n.task_id LEFT JOIN projects p ON p.id=t.project_id WHERE n.user_id=${req.user!.id} AND n.workspace_id=${input.workspaceId} ORDER BY n.created_at DESC LIMIT 50`;const [summary]=await this.db.client<{count:number}[]>`SELECT count(*)::int AS count FROM notifications WHERE user_id=${req.user!.id} AND workspace_id=${input.workspaceId} AND is_read=false`;return{items,unread:summary?.count??0}}
  @Post('notifications/read') async read(@Req() req:AppRequest,@Body() body:unknown){const input=parse(z.object({ids:z.array(z.coerce.number().int().positive()).max(100).default([])}).strict(),body??{});if(input.ids.length)await this.db.client`UPDATE notifications SET is_read=true WHERE user_id=${req.user!.id} AND id IN ${this.db.client(input.ids)}`;else await this.db.client`UPDATE notifications SET is_read=true WHERE user_id=${req.user!.id}`;return{ok:true}}
  @Get('workspaces/:workspaceId/audit-logs') async audit(@Req() req:AppRequest,@Param('workspaceId') workspaceId:string){await this.workspaces.role(workspaceId,req.user!.id,'workspace.manage');return this.db.client`SELECT a.id,a.action,a.entity_type AS "entityType",a.entity_id AS "entityId",a.before_data AS "beforeData",a.after_data AS "afterData",a.request_id AS "requestId",a.created_at AS "createdAt",u.name AS "actorName",u.email AS "actorEmail" FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE a.workspace_id=${workspaceId} ORDER BY a.created_at DESC LIMIT 100`}
}
