import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common'
import { DatabaseService } from '../database/database.service.js'
import { projectSchema } from '../common/contracts.js'
import { AppRequest, parse } from '../common/http.js'
import { WorkspaceService } from './workspaces.js'
import { installWorkflow } from './workflows.js'

@Injectable()
export class ProjectService {
  constructor(
    private readonly db: DatabaseService,
    private readonly workspaces: WorkspaceService,
  ) {}
  async list(workspaceId: string, userId: string) {
    await this.workspaces.role(workspaceId, userId, 'project.read')
    return this.db
      .client`SELECT p.id,p.name,p.code,p.description,p.color,p.archived_at AS "archivedAt",u.name AS "leadName" FROM projects p LEFT JOIN users u ON u.id=p.lead_id WHERE p.workspace_id=${workspaceId} AND p.deleted_at IS NULL ORDER BY p.archived_at NULLS FIRST,p.created_at`
  }
  async create(workspaceId: string, userId: string, input: ReturnType<typeof projectSchema.parse>) {
    await this.workspaces.role(workspaceId, userId, 'project.create')
    return this.db.client.begin(async (sql) => {
      const [project] = await sql<
        { id: string; name: string; code: string }[]
      >`INSERT INTO projects(workspace_id,name,code,description,color,lead_id,workflow_template) VALUES(${workspaceId},${input.name},${input.code},${input.description},${input.color},${userId},${input.workflowTemplate}) RETURNING id,name,code`
      await installWorkflow(sql, workspaceId, project!.id, input.workflowTemplate)
      await sql`INSERT INTO project_members(workspace_id,project_id,user_id) VALUES(${workspaceId},${project!.id},${userId})`
      await sql`INSERT INTO audit_logs(workspace_id,actor_id,action,entity_type,entity_id,request_id,after_data) VALUES(${workspaceId},${userId},'project.created','project',${project!.id},'system',${JSON.stringify(input)}::jsonb)`
      return project
    })
  }
}

@Controller('workspaces/:workspaceId/projects')
export class ProjectController {
  constructor(
    private readonly projects: ProjectService,
    private readonly workspaces: WorkspaceService,
    private readonly db: DatabaseService,
  ) {}
  @Get() list(@Req() req: AppRequest, @Param('workspaceId') workspaceId: string) {
    return this.projects.list(workspaceId, req.user!.id)
  }
  @Post() create(
    @Req() req: AppRequest,
    @Param('workspaceId') workspaceId: string,
    @Body() body: unknown,
  ) {
    return this.projects.create(workspaceId, req.user!.id, parse(projectSchema, body))
  }
  @Get(':projectId/columns') async columns(
    @Req() req: AppRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
  ) {
    await this.workspaces.role(workspaceId, req.user!.id, 'project.read')
    return this.db
      .client`SELECT id,key,name,color,state_type AS "stateType",position FROM board_columns WHERE workspace_id=${workspaceId} AND project_id=${projectId} ORDER BY position`
  }
  @Get(':projectId/workflow') async workflow(
    @Req() req: AppRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
  ) {
    await this.workspaces.role(workspaceId, req.user!.id, 'project.read')
    const [project] = await this.db.client<
      { workflowTemplate: string }[]
    >`SELECT workflow_template AS "workflowTemplate" FROM projects WHERE id=${projectId} AND workspace_id=${workspaceId} AND deleted_at IS NULL`
    if (!project) throw new NotFoundException({ code: 'PROJECT_NOT_FOUND', message: '项目不存在' })
    const [columns, transitions] = await Promise.all([
      this.db
        .client`SELECT id,key,name,color,state_type AS "stateType",position FROM board_columns WHERE workspace_id=${workspaceId} AND project_id=${projectId} ORDER BY position`,
      this.db
        .client`SELECT id,from_column_id AS "fromColumnId",to_column_id AS "toColumnId",name,bug_name AS "bugName",requires_comment AS "requiresComment",position FROM workflow_transitions WHERE workspace_id=${workspaceId} AND project_id=${projectId} ORDER BY position`,
    ])
    return { template: project.workflowTemplate, columns, transitions }
  }
  @Patch(':projectId') async update(
    @Req() req: AppRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Body() body: unknown,
  ) {
    await this.workspaces.role(workspaceId, req.user!.id, 'project.update')
    const input = projectSchema.omit({ workflowTemplate: true }).partial().parse(body)
    const [row] = await this.db
      .client`UPDATE projects SET name=coalesce(${input.name ?? null},name),description=coalesce(${input.description ?? null},description),color=coalesce(${input.color ?? null},color),updated_at=now() WHERE id=${projectId} AND workspace_id=${workspaceId} RETURNING id,name,code,description,color`
    return row
  }
  @Post(':projectId/archive') async archive(
    @Req() req: AppRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
  ) {
    await this.workspaces.role(workspaceId, req.user!.id, 'project.archive')
    await this.db
      .client`UPDATE projects SET archived_at=coalesce(archived_at,now()) WHERE id=${projectId} AND workspace_id=${workspaceId}`
    return { ok: true }
  }
  @Delete(':projectId') async remove(
    @Req() req: AppRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
  ) {
    await this.workspaces.role(workspaceId, req.user!.id, 'project.delete')
    await this.db.client.begin(async (sql) => {
      await sql`UPDATE projects SET deleted_at=now(),deleted_by=${req.user!.id} WHERE id=${projectId} AND workspace_id=${workspaceId} AND deleted_at IS NULL`
      await sql`UPDATE tasks SET deleted_at=now(),deleted_by=${req.user!.id} WHERE project_id=${projectId} AND workspace_id=${workspaceId} AND deleted_at IS NULL`
      await sql`INSERT INTO audit_logs(workspace_id,actor_id,action,entity_type,entity_id,request_id) VALUES(${workspaceId},${req.user!.id},'project.deleted','project',${projectId},${req.requestId})`
    })
    return { ok: true }
  }
}
