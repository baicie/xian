import { Body, Controller, ForbiddenException, Get, Injectable, NotFoundException, Param, Patch, Post, Req, Delete } from '@nestjs/common'
import { z } from 'zod'
import { randomBytes } from 'node:crypto'
import { DatabaseService } from '../database/database.service.js'
import { authConfig } from '../common/auth-config.js'
import { memberSchema, provisionMemberSchema, workspaceSchema } from '../common/contracts.js'
import { AppRequest, parse } from '../common/http.js'
import { can, Permission, Role } from '../common/policy.js'
import { InvitationService } from './invitations.js'

@Injectable()
export class WorkspaceService {
  constructor(private readonly db: DatabaseService) {}
  async role(workspaceId: string, userId: string, permission: Permission) { const [row] = await this.db.client<{ role: Role }[]>`SELECT role FROM memberships WHERE workspace_id=${workspaceId} AND user_id=${userId} AND disabled_at IS NULL`; if (!row) throw new NotFoundException({ code: 'WORKSPACE_NOT_FOUND', message: '工作区不存在' }); if (!can(row.role, permission)) throw new ForbiddenException({ code: 'FORBIDDEN', message: '没有此操作权限' }); return row.role }
  async list(userId: string) { return this.db.client`SELECT w.id,w.name,w.slug,m.role FROM workspaces w JOIN memberships m ON m.workspace_id=w.id WHERE m.user_id=${userId} AND m.disabled_at IS NULL ORDER BY w.created_at` }
  async create(userId: string, name: string) {
    const { allowWorkspaceCreate, registrationMode } = authConfig()
    const [summary] = await this.db.client<{ count: number }[]>`SELECT count(*)::int AS count FROM workspaces`
    if (!allowWorkspaceCreate && Number(summary?.count) > 0) throw new ForbiddenException({ code: 'WORKSPACE_CREATE_DISABLED', message: '当前实例已关闭新建工作区' })
    if (registrationMode === 'admin_only') throw new ForbiddenException({ code: 'WORKSPACE_CREATE_DISABLED', message: '管理员模式下仅可通过邀请或管理员分配加入工作区' })
    const slug = `${name.toLowerCase().replace(/\W+/g,'-').slice(0,32)}-${randomBytes(3).toString('hex')}`
    return this.db.client.begin(async sql => { const [workspace] = await sql`INSERT INTO workspaces(name,slug,created_by) VALUES(${name},${slug},${userId}) RETURNING id,name,slug`; await sql`INSERT INTO memberships(workspace_id,user_id,role) VALUES(${workspace!.id},${userId},'OWNER')`; return workspace })
  }
  async members(workspaceId: string, userId: string) { await this.role(workspaceId,userId,'member.read'); return this.db.client`SELECT u.id,u.name,u.email,m.role,m.disabled_at AS "disabledAt" FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=${workspaceId} ORDER BY m.joined_at` }
}

@Controller('workspaces')
export class WorkspaceController {
  constructor(private readonly workspaces: WorkspaceService, private readonly invitations: InvitationService, private readonly db: DatabaseService) {}
  @Get() list(@Req() req: AppRequest) { return this.workspaces.list(req.user!.id) }
  @Post() create(@Req() req: AppRequest,@Body() body:unknown) { return this.workspaces.create(req.user!.id,parse(workspaceSchema,body).name) }
  @Get(':id/members') members(@Req() req:AppRequest,@Param('id') id:string) { return this.workspaces.members(id,req.user!.id) }
  @Post(':id/members') add(@Req() req:AppRequest,@Param('id') id:string,@Body() body:unknown) { const input=parse(memberSchema,body); return this.invitations.inviteOrAdd(id,req.user!.id,input.email,input.role,req.requestId) }
  @Post(':id/members/provision') provision(@Req() req:AppRequest,@Param('id') id:string,@Body() body:unknown) { const input=parse(provisionMemberSchema,body); return this.invitations.provision(id,req.user!.id,input.email,input.name,input.role,req.requestId) }
  @Get(':id/invitations') listInvitations(@Req() req:AppRequest,@Param('id') id:string) { return this.invitations.list(id,req.user!.id) }
  @Delete(':id/invitations/:invitationId') revoke(@Req() req:AppRequest,@Param('id') id:string,@Param('invitationId') invitationId:string) { return this.invitations.revoke(id,req.user!.id,invitationId,req.requestId) }
  @Patch(':id/members/:memberId') async update(@Req() req:AppRequest,@Param('id') id:string,@Param('memberId') memberId:string,@Body() body:unknown) { await this.workspaces.role(id,req.user!.id,'member.manage'); const input=z.object({role:z.enum(['ADMIN','MEMBER','VIEWER']).optional(),disabled:z.boolean().optional()}).strict().parse(body); await this.db.client`UPDATE memberships SET role=coalesce(${input.role ?? null}::member_role,role),disabled_at=CASE WHEN ${input.disabled ?? false} THEN now() ELSE NULL END WHERE workspace_id=${id} AND user_id=${memberId}`; return {ok:true} }
}
