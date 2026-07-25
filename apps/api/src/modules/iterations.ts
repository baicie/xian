import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common'
import type { Sql, TransactionSql } from 'postgres'
import { DatabaseService } from '../database/database.service.js'
import {
  iterationCloseSchema,
  iterationCreateSchema,
  iterationTaskCandidateQuerySchema,
  iterationTaskMoveSchema,
  iterationUpdateSchema,
} from '../common/contracts.js'
import { AppRequest, parse } from '../common/http.js'
import { WorkspaceService } from './workspaces.js'

export type HealthTask = {
  kind: 'TASK' | 'STORY' | 'BUG'
  dueDate: string | null
  done: boolean
  assigned: boolean
  iterationId: string | null
}

export type ActiveIterationHealth = { id: string; title: string } | null

const localDate = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: process.env.APP_TIMEZONE ?? 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

export function calculateProjectHealth(
  tasks: HealthTask[],
  activeIteration: ActiveIterationHealth,
  today: string,
) {
  const completedTasks = tasks.filter((task) => task.done).length,
    totalTasks = tasks.length,
    activeTasks = activeIteration
      ? tasks.filter((task) => task.iterationId === activeIteration.id)
      : [],
    activeCompleted = activeTasks.filter((task) => task.done).length
  return {
    totalTasks,
    completedTasks,
    completionRate: totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0,
    overdueTasks: tasks.filter((task) => !task.done && task.dueDate && task.dueDate < today).length,
    openBugs: tasks.filter((task) => task.kind === 'BUG' && !task.done).length,
    unassignedTasks: tasks.filter((task) => !task.done && !task.assigned).length,
    activeIteration: activeIteration
      ? {
          ...activeIteration,
          totalTasks: activeTasks.length,
          completedTasks: activeCompleted,
          completionRate: activeTasks.length
            ? Math.round((activeCompleted / activeTasks.length) * 100)
            : 0,
        }
      : null,
  }
}

type IterationStatus = 'PLANNED' | 'ACTIVE' | 'CLOSED'
type IterationRow = {
  id: string
  projectId: string
  title: string
  goal: string
  startDate: string
  endDate: string
  status: IterationStatus
  version: number
  closedAt: string | null
  createdAt: string
  updatedAt: string
  taskCount: number
  completedCount: number
}

@Injectable()
export class IterationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly workspaces: WorkspaceService,
  ) {}

  async list(workspaceId: string, userId: string, projectId: string) {
    await this.workspaces.role(workspaceId, userId, 'iteration.read')
    await this.assertProject(this.db.client, workspaceId, projectId)
    return this.rows(this.db.client, workspaceId, projectId)
  }

  async create(
    workspaceId: string,
    userId: string,
    projectId: string,
    input: ReturnType<typeof iterationCreateSchema.parse>,
    requestId: string,
  ) {
    await this.workspaces.role(workspaceId, userId, 'iteration.manage')
    return this.db.client.begin(async (sql) => {
      await this.assertProject(sql, workspaceId, projectId, true)
      const [iteration] = await sql<
        { id: string }[]
      >`INSERT INTO iterations(workspace_id,project_id,title,goal,start_date,end_date,created_by) VALUES(${workspaceId},${projectId},${input.title},${input.goal},${input.startDate},${input.endDate},${userId}) RETURNING id`
      await this.audit(
        sql,
        workspaceId,
        userId,
        'iteration.created',
        iteration!.id,
        requestId,
        input,
      )
      return this.row(sql, workspaceId, projectId, iteration!.id)
    })
  }

  async update(
    workspaceId: string,
    userId: string,
    projectId: string,
    iterationId: string,
    input: ReturnType<typeof iterationUpdateSchema.parse>,
    requestId: string,
  ) {
    await this.workspaces.role(workspaceId, userId, 'iteration.manage')
    return this.db.client.begin(async (sql) => {
      await this.assertProject(sql, workspaceId, projectId, true)
      const [current] = await sql<
        { status: IterationStatus; version: number; startDate: string; endDate: string }[]
      >`SELECT status,version,start_date AS "startDate",end_date AS "endDate" FROM iterations WHERE id=${iterationId} AND workspace_id=${workspaceId} AND project_id=${projectId} FOR UPDATE`
      if (!current)
        throw new NotFoundException({ code: 'ITERATION_NOT_FOUND', message: '迭代不存在' })
      if (current.status === 'CLOSED')
        throw new BadRequestException({ code: 'ITERATION_CLOSED', message: '已关闭的迭代不能修改' })
      if (current.version !== input.version)
        throw new ConflictException({
          code: 'ITERATION_VERSION_CONFLICT',
          message: '迭代已被其他成员修改，请刷新后重试',
          details: { currentVersion: current.version },
        })
      const startDate = input.startDate ?? current.startDate,
        endDate = input.endDate ?? current.endDate
      if (startDate > endDate)
        throw new BadRequestException({
          code: 'ITERATION_DATE_RANGE_INVALID',
          message: '结束日期不能早于开始日期',
        })
      await sql`UPDATE iterations SET title=coalesce(${input.title ?? null},title),goal=coalesce(${input.goal ?? null},goal),start_date=coalesce(${input.startDate ?? null}::date,start_date),end_date=coalesce(${input.endDate ?? null}::date,end_date),version=version+1,updated_at=now() WHERE id=${iterationId}`
      await this.audit(sql, workspaceId, userId, 'iteration.updated', iterationId, requestId, input)
      return this.row(sql, workspaceId, projectId, iterationId)
    })
  }

  async start(
    workspaceId: string,
    userId: string,
    projectId: string,
    iterationId: string,
    requestId: string,
  ) {
    await this.workspaces.role(workspaceId, userId, 'iteration.manage')
    return this.db.client.begin(async (sql) => {
      await this.assertProject(sql, workspaceId, projectId, true)
      const [iteration] = await sql<
        { status: IterationStatus }[]
      >`SELECT status FROM iterations WHERE id=${iterationId} AND workspace_id=${workspaceId} AND project_id=${projectId} FOR UPDATE`
      if (!iteration)
        throw new NotFoundException({ code: 'ITERATION_NOT_FOUND', message: '迭代不存在' })
      if (iteration.status === 'CLOSED')
        throw new BadRequestException({ code: 'ITERATION_CLOSED', message: '已关闭的迭代不能启动' })
      if (iteration.status === 'ACTIVE') return this.row(sql, workspaceId, projectId, iterationId)
      const [active] = await sql<
        { id: string; title: string }[]
      >`SELECT id,title FROM iterations WHERE project_id=${projectId} AND status='ACTIVE' FOR UPDATE`
      if (active)
        throw new ConflictException({
          code: 'ITERATION_ACTIVE_EXISTS',
          message: `项目已有进行中的迭代：${active.title}`,
        })
      try {
        await sql`UPDATE iterations SET status='ACTIVE',version=version+1,updated_at=now() WHERE id=${iterationId}`
      } catch (error) {
        if ((error as { code?: string }).code === '23505')
          throw new ConflictException({
            code: 'ITERATION_ACTIVE_EXISTS',
            message: '项目已有进行中的迭代',
          })
        throw error
      }
      await this.audit(sql, workspaceId, userId, 'iteration.started', iterationId, requestId)
      return this.row(sql, workspaceId, projectId, iterationId)
    })
  }

  async moveTasks(
    workspaceId: string,
    userId: string,
    projectId: string,
    iterationId: string,
    input: ReturnType<typeof iterationTaskMoveSchema.parse>,
    requestId: string,
  ) {
    await this.workspaces.role(workspaceId, userId, 'iteration.manage')
    return this.db.client.begin(async (sql) => {
      await this.assertProject(sql, workspaceId, projectId, true)
      const [iteration] = await sql<
        { status: IterationStatus }[]
      >`SELECT status FROM iterations WHERE id=${iterationId} AND workspace_id=${workspaceId} AND project_id=${projectId} FOR UPDATE`
      if (!iteration)
        throw new NotFoundException({ code: 'ITERATION_NOT_FOUND', message: '迭代不存在' })
      if (iteration.status === 'CLOSED')
        throw new BadRequestException({
          code: 'ITERATION_CLOSED',
          message: '已关闭的迭代不能调整任务',
        })
      const tasks = await sql<
        { id: string; iterationId: string | null }[]
      >`SELECT id,iteration_id AS "iterationId" FROM tasks WHERE id IN ${sql(input.taskIds)} AND workspace_id=${workspaceId} AND project_id=${projectId} AND deleted_at IS NULL AND archived_at IS NULL FOR UPDATE`
      if (tasks.length !== input.taskIds.length)
        throw new BadRequestException({
          code: 'ITERATION_TASKS_INVALID',
          message: '部分任务不存在、已归档或不属于当前项目',
        })
      if (input.action === 'REMOVE') {
        if (tasks.some((task) => task.iterationId !== iterationId))
          throw new BadRequestException({
            code: 'ITERATION_TASKS_INVALID',
            message: '只能移除当前迭代中的任务',
          })
        await sql`UPDATE tasks SET iteration_id=NULL,version=version+1,updated_at=now() WHERE id IN ${sql(input.taskIds)}`
      } else {
        if (tasks.some((task) => task.iterationId !== null))
          throw new BadRequestException({
            code: 'ITERATION_TASKS_ALREADY_PLANNED',
            message: '只能纳入尚未进入其他迭代的任务',
          })
        await sql`UPDATE tasks SET iteration_id=${iterationId},version=version+1,updated_at=now() WHERE id IN ${sql(input.taskIds)}`
      }
      await this.audit(
        sql,
        workspaceId,
        userId,
        'iteration.tasks_changed',
        iterationId,
        requestId,
        {
          action: input.action,
          taskIds: input.taskIds,
        },
      )
      return { updated: tasks.length }
    })
  }

  async tasks(workspaceId: string, userId: string, projectId: string, iterationId: string) {
    await this.workspaces.role(workspaceId, userId, 'iteration.read')
    const [iteration] = await this.db
      .client`SELECT id FROM iterations WHERE id=${iterationId} AND workspace_id=${workspaceId} AND project_id=${projectId}`
    if (!iteration)
      throw new NotFoundException({ code: 'ITERATION_NOT_FOUND', message: '迭代不存在' })
    return this.db.client`
      SELECT t.id,t.number,t.title,t.kind,t.priority,t.due_date AS "dueDate",t.version,
        t.column_id AS "columnId",c.name AS "columnName",c.state_type AS "stateType",
        t.archived_at AS "archivedAt",
        coalesce(json_agg(json_build_object('id',u.id,'name',u.name)) FILTER(WHERE u.id IS NOT NULL),'[]') AS assignees
      FROM tasks t
      JOIN board_columns c ON c.id=t.column_id
      LEFT JOIN task_assignees ta ON ta.task_id=t.id
      LEFT JOIN users u ON u.id=ta.user_id
      WHERE t.workspace_id=${workspaceId} AND t.project_id=${projectId}
        AND t.iteration_id=${iterationId} AND t.deleted_at IS NULL
      GROUP BY t.id,c.name,c.state_type,c.position
      ORDER BY c.position,t.position`
  }

  async candidateTasks(
    workspaceId: string,
    userId: string,
    projectId: string,
    iterationId: string,
    input: ReturnType<typeof iterationTaskCandidateQuerySchema.parse>,
  ) {
    await this.workspaces.role(workspaceId, userId, 'iteration.read')
    const [iteration] = await this.db.client<
      { status: IterationStatus }[]
    >`SELECT status FROM iterations WHERE id=${iterationId} AND workspace_id=${workspaceId} AND project_id=${projectId}`
    if (!iteration)
      throw new NotFoundException({ code: 'ITERATION_NOT_FOUND', message: '迭代不存在' })
    if (iteration.status === 'CLOSED')
      throw new BadRequestException({
        code: 'ITERATION_CLOSED',
        message: '已关闭的迭代不能纳入任务',
      })

    const needle = input.query ? `%${input.query}%` : null,
      offset = (input.page - 1) * input.pageSize
    const [data, countRows] = await Promise.all([
      this.db.client`
        SELECT t.id,t.number,t.title,
          coalesce(json_agg(json_build_object('id',u.id,'name',u.name)) FILTER(WHERE u.id IS NOT NULL),'[]') AS assignees
        FROM tasks t
        JOIN board_columns c ON c.id=t.column_id
        LEFT JOIN task_assignees ta ON ta.task_id=t.id
        LEFT JOIN users u ON u.id=ta.user_id
        WHERE t.workspace_id=${workspaceId} AND t.project_id=${projectId}
          AND t.iteration_id IS NULL AND t.deleted_at IS NULL AND t.archived_at IS NULL
          AND (${needle}::text IS NULL OR t.title ILIKE ${needle})
        GROUP BY t.id,c.position
        ORDER BY c.position,t.position
        LIMIT ${input.pageSize} OFFSET ${offset}`,
      this.db.client<
        { count: number }[]
      >`SELECT count(*)::int AS count FROM tasks WHERE workspace_id=${workspaceId} AND project_id=${projectId} AND iteration_id IS NULL AND deleted_at IS NULL AND archived_at IS NULL AND (${needle}::text IS NULL OR title ILIKE ${needle})`,
    ])
    const totalItems = countRows[0]?.count ?? 0
    return {
      data,
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / input.pageSize),
      },
    }
  }

  async close(
    workspaceId: string,
    userId: string,
    projectId: string,
    iterationId: string,
    input: ReturnType<typeof iterationCloseSchema.parse>,
    requestId: string,
  ) {
    await this.workspaces.role(workspaceId, userId, 'iteration.manage')
    return this.db.client.begin(async (sql) => {
      await this.assertProject(sql, workspaceId, projectId, true)
      const [iteration] = await sql<
        { status: IterationStatus }[]
      >`SELECT status FROM iterations WHERE id=${iterationId} AND workspace_id=${workspaceId} AND project_id=${projectId} FOR UPDATE`
      if (!iteration)
        throw new NotFoundException({ code: 'ITERATION_NOT_FOUND', message: '迭代不存在' })
      if (iteration.status !== 'ACTIVE')
        throw new BadRequestException({
          code: 'ITERATION_NOT_ACTIVE',
          message: '只有进行中的迭代可以关闭',
        })
      let targetIterationId: string | null = null
      if (input.unfinishedAction === 'CARRY_OVER') {
        if (input.targetIterationId === iterationId)
          throw new BadRequestException({
            code: 'ITERATION_CARRY_TARGET_INVALID',
            message: '不能结转到当前迭代',
          })
        const [target] = await sql<
          { id: string }[]
        >`SELECT id FROM iterations WHERE id=${input.targetIterationId} AND workspace_id=${workspaceId} AND project_id=${projectId} AND status IN ('PLANNED','ACTIVE') FOR UPDATE`
        if (!target)
          throw new BadRequestException({
            code: 'ITERATION_CARRY_TARGET_INVALID',
            message: '结转目标不存在、已关闭或不属于当前项目',
          })
        targetIterationId = target.id
      }
      const unfinished = await sql<
        { id: string }[]
      >`SELECT t.id FROM tasks t JOIN board_columns c ON c.id=t.column_id WHERE t.iteration_id=${iterationId} AND t.deleted_at IS NULL AND c.state_type<>'DONE' FOR UPDATE OF t`
      if (unfinished.length)
        await sql`UPDATE tasks SET iteration_id=${targetIterationId},version=version+1,updated_at=now() WHERE id IN ${sql(unfinished.map((task) => task.id))}`
      await sql`UPDATE iterations SET status='CLOSED',closed_at=now(),version=version+1,updated_at=now() WHERE id=${iterationId}`
      await this.audit(sql, workspaceId, userId, 'iteration.closed', iterationId, requestId, {
        unfinishedAction: input.unfinishedAction,
        targetIterationId,
        movedTasks: unfinished.length,
      })
      return {
        iteration: await this.row(sql, workspaceId, projectId, iterationId),
        movedTasks: unfinished.length,
        targetIterationId,
      }
    })
  }

  async health(workspaceId: string, userId: string, projectId: string) {
    await this.workspaces.role(workspaceId, userId, 'iteration.read')
    await this.assertProject(this.db.client, workspaceId, projectId)
    const [tasks, active] = await Promise.all([
      this.db.client<
        HealthTask[]
      >`SELECT t.kind,t.due_date::text AS "dueDate",c.state_type='DONE' AS done,EXISTS(SELECT 1 FROM task_assignees ta WHERE ta.task_id=t.id) AS assigned,t.iteration_id AS "iterationId" FROM tasks t JOIN board_columns c ON c.id=t.column_id WHERE t.workspace_id=${workspaceId} AND t.project_id=${projectId} AND t.deleted_at IS NULL AND t.archived_at IS NULL`,
      this.db.client<
        { id: string; title: string }[]
      >`SELECT id,title FROM iterations WHERE workspace_id=${workspaceId} AND project_id=${projectId} AND status='ACTIVE'`,
    ])
    return calculateProjectHealth(tasks, active[0] ?? null, localDate())
  }

  private async assertProject(
    sql: Sql | TransactionSql,
    workspaceId: string,
    projectId: string,
    lock = false,
  ) {
    const rows = lock
      ? await sql`SELECT id FROM projects WHERE id=${projectId} AND workspace_id=${workspaceId} AND deleted_at IS NULL FOR UPDATE`
      : await sql`SELECT id FROM projects WHERE id=${projectId} AND workspace_id=${workspaceId} AND deleted_at IS NULL`
    if (!rows[0]) throw new NotFoundException({ code: 'PROJECT_NOT_FOUND', message: '项目不存在' })
  }

  private rows(sql: Sql | TransactionSql, workspaceId: string, projectId: string) {
    return sql<IterationRow[]>`
      SELECT i.id,i.project_id AS "projectId",i.title,i.goal,i.start_date::text AS "startDate",
        i.end_date::text AS "endDate",i.status,i.version,i.closed_at AS "closedAt",
        i.created_at AS "createdAt",i.updated_at AS "updatedAt",
        count(t.id)::int AS "taskCount",
        count(t.id) FILTER(WHERE c.state_type='DONE')::int AS "completedCount"
      FROM iterations i
      LEFT JOIN tasks t ON t.iteration_id=i.id AND t.deleted_at IS NULL
      LEFT JOIN board_columns c ON c.id=t.column_id
      WHERE i.workspace_id=${workspaceId} AND i.project_id=${projectId}
      GROUP BY i.id
      ORDER BY CASE i.status WHEN 'ACTIVE' THEN 0 WHEN 'PLANNED' THEN 1 ELSE 2 END,
        i.start_date DESC,i.created_at DESC`
  }

  private async row(
    sql: Sql | TransactionSql,
    workspaceId: string,
    projectId: string,
    iterationId: string,
  ) {
    const rows = await this.rows(sql, workspaceId, projectId)
    const row = rows.find((item) => item.id === iterationId)
    if (!row) throw new NotFoundException({ code: 'ITERATION_NOT_FOUND', message: '迭代不存在' })
    return row
  }

  private audit(
    sql: Sql | TransactionSql,
    workspaceId: string,
    userId: string,
    action: string,
    iterationId: string,
    requestId: string,
    data?: unknown,
  ) {
    return sql`INSERT INTO audit_logs(workspace_id,actor_id,action,entity_type,entity_id,request_id,after_data) VALUES(${workspaceId},${userId},${action},'iteration',${iterationId},${requestId},${data ? JSON.stringify(data) : null}::jsonb)`
  }
}

@Controller('workspaces/:workspaceId/projects/:projectId')
export class IterationController {
  constructor(private readonly iterations: IterationService) {}

  @Get('iterations') list(
    @Req() req: AppRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
  ) {
    return this.iterations.list(workspaceId, req.user!.id, projectId)
  }

  @Post('iterations') create(
    @Req() req: AppRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Body() body: unknown,
  ) {
    return this.iterations.create(
      workspaceId,
      req.user!.id,
      projectId,
      parse(iterationCreateSchema, body),
      req.requestId,
    )
  }

  @Patch('iterations/:iterationId') update(
    @Req() req: AppRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Param('iterationId') iterationId: string,
    @Body() body: unknown,
  ) {
    return this.iterations.update(
      workspaceId,
      req.user!.id,
      projectId,
      iterationId,
      parse(iterationUpdateSchema, body),
      req.requestId,
    )
  }

  @Post('iterations/:iterationId/start') start(
    @Req() req: AppRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Param('iterationId') iterationId: string,
  ) {
    return this.iterations.start(workspaceId, req.user!.id, projectId, iterationId, req.requestId)
  }

  @Post('iterations/:iterationId/close') close(
    @Req() req: AppRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Param('iterationId') iterationId: string,
    @Body() body: unknown,
  ) {
    return this.iterations.close(
      workspaceId,
      req.user!.id,
      projectId,
      iterationId,
      parse(iterationCloseSchema, body),
      req.requestId,
    )
  }

  @Patch('iterations/:iterationId/tasks') moveTasks(
    @Req() req: AppRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Param('iterationId') iterationId: string,
    @Body() body: unknown,
  ) {
    return this.iterations.moveTasks(
      workspaceId,
      req.user!.id,
      projectId,
      iterationId,
      parse(iterationTaskMoveSchema, body),
      req.requestId,
    )
  }

  @Get('iterations/:iterationId/tasks') tasks(
    @Req() req: AppRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Param('iterationId') iterationId: string,
  ) {
    return this.iterations.tasks(workspaceId, req.user!.id, projectId, iterationId)
  }

  @Get('iterations/:iterationId/candidates') candidateTasks(
    @Req() req: AppRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Param('iterationId') iterationId: string,
    @Query() query: unknown,
  ) {
    return this.iterations.candidateTasks(
      workspaceId,
      req.user!.id,
      projectId,
      iterationId,
      parse(iterationTaskCandidateQuerySchema, query),
    )
  }

  @Get('health') health(
    @Req() req: AppRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
  ) {
    return this.iterations.health(workspaceId, req.user!.id, projectId)
  }
}
