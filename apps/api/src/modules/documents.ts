import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Injectable, NotFoundException, Param, Patch, Post, Req } from '@nestjs/common'
import { DatabaseService } from '../database/database.service.js'
import { documentCreateSchema, documentFolderCreateSchema, documentFolderUpdateSchema, documentUpdateSchema } from '../common/contracts.js'
import { AppRequest, parse } from '../common/http.js'
import { WorkspaceService } from './workspaces.js'

type CreateDocument = ReturnType<typeof documentCreateSchema.parse>
type UpdateDocument = ReturnType<typeof documentUpdateSchema.parse>
type CreateFolder = ReturnType<typeof documentFolderCreateSchema.parse>
type UpdateFolder = ReturnType<typeof documentFolderUpdateSchema.parse>

@Injectable()
export class DocumentService {
  constructor(private readonly db: DatabaseService, private readonly workspaces: WorkspaceService) {}

  async list(workspaceId: string, userId: string) {
    await this.workspaces.role(workspaceId, userId, 'document.read')
    return this.db.client`SELECT d.id,d.project_id AS "projectId",d.folder_id AS "folderId",p.name AS "projectName",d.title,d.kind,d.status,d.version,d.updated_at AS "updatedAt",u.name AS "updatedByName" FROM documents d LEFT JOIN projects p ON p.id=d.project_id JOIN users u ON u.id=d.updated_by WHERE d.workspace_id=${workspaceId} ORDER BY d.updated_at DESC`
  }

  async get(workspaceId: string, userId: string, documentId: string) {
    await this.workspaces.role(workspaceId, userId, 'document.read')
    const [document] = await this.db.client`SELECT id,project_id AS "projectId",folder_id AS "folderId",title,kind,status,content,version,created_at AS "createdAt",updated_at AS "updatedAt" FROM documents WHERE id=${documentId} AND workspace_id=${workspaceId}`
    if (!document) throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND', message: '文档不存在' })
    return document
  }

  async create(workspaceId: string, userId: string, input: CreateDocument) {
    await this.workspaces.role(workspaceId, userId, 'document.create')
    if (input.projectId) await this.assertProject(workspaceId, input.projectId)
    if (input.folderId) await this.assertFolder(workspaceId, input.folderId)
    return this.db.client.begin(async sql => {
      const [document] = await sql<{ id: string }[]>`INSERT INTO documents(workspace_id,project_id,folder_id,title,kind,content,created_by,updated_by) VALUES(${workspaceId},${input.projectId},${input.folderId},${input.title},${input.kind},${input.content},${userId},${userId}) RETURNING id,project_id AS "projectId",folder_id AS "folderId",title,kind,status,content,version,created_at AS "createdAt",updated_at AS "updatedAt"`
      await sql`INSERT INTO document_versions(workspace_id,document_id,project_id,title,kind,status,content,version,created_by) VALUES(${workspaceId},${document!.id},${input.projectId},${input.title},${input.kind},'DRAFT',${input.content},1,${userId})`
      return document
    })
  }

  async update(workspaceId: string, userId: string, documentId: string, input: UpdateDocument) {
    await this.workspaces.role(workspaceId, userId, 'document.update')
    if (input.projectId) await this.assertProject(workspaceId, input.projectId)
    if (input.folderId) await this.assertFolder(workspaceId, input.folderId)
    return this.db.client.begin(async sql => {
      const [current] = await sql<{ version: number }[]>`SELECT version FROM documents WHERE id=${documentId} AND workspace_id=${workspaceId} FOR UPDATE`
      if (!current) throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND', message: '文档不存在' })
      if (current.version !== input.version) throw new ConflictException({ code: 'DOCUMENT_VERSION_CONFLICT', message: '文档已被其他人更新，请刷新后重试' })
      const [document] = await sql`UPDATE documents SET project_id=CASE WHEN ${input.projectId !== undefined} THEN ${input.projectId ?? null} ELSE project_id END,folder_id=CASE WHEN ${input.folderId !== undefined} THEN ${input.folderId ?? null} ELSE folder_id END,title=coalesce(${input.title ?? null},title),kind=coalesce(${input.kind ?? null}::document_kind,kind),status=coalesce(${input.status ?? null}::document_status,status),content=coalesce(${input.content ?? null},content),version=version+1,updated_by=${userId},updated_at=now() WHERE id=${documentId} AND workspace_id=${workspaceId} RETURNING id,project_id AS "projectId",folder_id AS "folderId",title,kind,status,content,version,created_at AS "createdAt",updated_at AS "updatedAt"`
      await sql`INSERT INTO document_versions(workspace_id,document_id,project_id,title,kind,status,content,version,change_note,created_by) VALUES(${workspaceId},${documentId},${document!.projectId},${document!.title},${document!.kind},${document!.status},${document!.content},${document!.version},${input.changeNote},${userId})`
      return document
    })
  }

  async versions(workspaceId: string, userId: string, documentId: string) {
    await this.get(workspaceId, userId, documentId)
    return this.db.client`SELECT v.id,v.version,v.title,v.status,v.change_note AS "changeNote",v.created_at AS "createdAt",u.name AS "createdByName" FROM document_versions v JOIN users u ON u.id=v.created_by WHERE v.workspace_id=${workspaceId} AND v.document_id=${documentId} ORDER BY v.version DESC`
  }

  async folders(workspaceId: string, userId: string) {
    await this.workspaces.role(workspaceId, userId, 'document.read')
    return this.db.client`SELECT id,parent_id AS "parentId",name,created_at AS "createdAt",updated_at AS "updatedAt" FROM document_folders WHERE workspace_id=${workspaceId} ORDER BY name`
  }

  async createFolder(workspaceId: string, userId: string, input: CreateFolder) {
    await this.workspaces.role(workspaceId, userId, 'document.create')
    if (input.parentId) await this.assertFolder(workspaceId, input.parentId)
    const [folder] = await this.db.client`INSERT INTO document_folders(workspace_id,parent_id,name,created_by) VALUES(${workspaceId},${input.parentId},${input.name},${userId}) RETURNING id,parent_id AS "parentId",name,created_at AS "createdAt",updated_at AS "updatedAt"`
    return folder
  }

  async updateFolder(workspaceId: string, userId: string, folderId: string, input: UpdateFolder) {
    await this.workspaces.role(workspaceId, userId, 'document.update')
    await this.assertFolder(workspaceId, folderId)
    if (input.parentId === folderId) throw new BadRequestException({ code: 'INVALID_FOLDER_PARENT', message: '文件夹不能移动到自身' })
    if (input.parentId) {
      await this.assertFolder(workspaceId, input.parentId)
      const descendants = await this.descendantFolderIds(workspaceId, folderId)
      if (descendants.includes(input.parentId)) throw new BadRequestException({ code: 'INVALID_FOLDER_PARENT', message: '文件夹不能移动到子文件夹中' })
    }
    const [folder] = await this.db.client`UPDATE document_folders SET name=coalesce(${input.name ?? null},name),parent_id=CASE WHEN ${input.parentId !== undefined} THEN ${input.parentId ?? null} ELSE parent_id END,updated_at=now() WHERE id=${folderId} AND workspace_id=${workspaceId} RETURNING id,parent_id AS "parentId",name,created_at AS "createdAt",updated_at AS "updatedAt"`
    return folder
  }

  async deleteFolder(workspaceId: string, userId: string, folderId: string) {
    await this.workspaces.role(workspaceId, userId, 'document.update')
    await this.assertFolder(workspaceId, folderId)
    await this.db.client`DELETE FROM document_folders WHERE id=${folderId} AND workspace_id=${workspaceId}`
    return { ok: true }
  }

  async duplicate(workspaceId: string, userId: string, documentId: string) {
    await this.workspaces.role(workspaceId, userId, 'document.create')
    const source = await this.get(workspaceId, userId, documentId) as Record<string, unknown>
    return this.create(workspaceId, userId, { title: `${source.title} 副本`, kind: source.kind, content: source.content, projectId: source.projectId, folderId: source.folderId } as CreateDocument)
  }

  async delete(workspaceId: string, userId: string, documentId: string) {
    await this.workspaces.role(workspaceId, userId, 'document.update')
    const result = await this.db.client`DELETE FROM documents WHERE id=${documentId} AND workspace_id=${workspaceId} RETURNING id`
    if (!result.length) throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND', message: '文档不存在' })
    return { ok: true }
  }

  private async assertProject(workspaceId: string, projectId: string) {
    const [project] = await this.db.client`SELECT id FROM projects WHERE id=${projectId} AND workspace_id=${workspaceId} AND deleted_at IS NULL`
    if (!project) throw new NotFoundException({ code: 'PROJECT_NOT_FOUND', message: '项目不存在' })
  }

  private async assertFolder(workspaceId: string, folderId: string) {
    const [folder] = await this.db.client`SELECT id FROM document_folders WHERE id=${folderId} AND workspace_id=${workspaceId}`
    if (!folder) throw new NotFoundException({ code: 'DOCUMENT_FOLDER_NOT_FOUND', message: '文件夹不存在' })
  }

  private async descendantFolderIds(workspaceId: string, folderId: string) {
    const rows = await this.db.client<{ id: string }[]>`WITH RECURSIVE descendants AS (SELECT id FROM document_folders WHERE id=${folderId} AND workspace_id=${workspaceId} UNION ALL SELECT f.id FROM document_folders f JOIN descendants d ON f.parent_id=d.id WHERE f.workspace_id=${workspaceId}) SELECT id FROM descendants`
    return rows.map(row => row.id)
  }
}

@Controller('workspaces/:workspaceId/documents')
export class DocumentController {
  constructor(private readonly documents: DocumentService) {}
  @Get() list(@Req() req: AppRequest, @Param('workspaceId') workspaceId: string) { return this.documents.list(workspaceId, req.user!.id) }
  @Post() create(@Req() req: AppRequest, @Param('workspaceId') workspaceId: string, @Body() body: unknown) { return this.documents.create(workspaceId, req.user!.id, parse(documentCreateSchema, body)) }
  @Get('folders') folders(@Req() req: AppRequest, @Param('workspaceId') workspaceId: string) { return this.documents.folders(workspaceId, req.user!.id) }
  @Post('folders') createFolder(@Req() req: AppRequest, @Param('workspaceId') workspaceId: string, @Body() body: unknown) { return this.documents.createFolder(workspaceId, req.user!.id, parse(documentFolderCreateSchema, body)) }
  @Patch('folders/:folderId') updateFolder(@Req() req: AppRequest, @Param('workspaceId') workspaceId: string, @Param('folderId') folderId: string, @Body() body: unknown) { return this.documents.updateFolder(workspaceId, req.user!.id, folderId, parse(documentFolderUpdateSchema, body)) }
  @Delete('folders/:folderId') deleteFolder(@Req() req: AppRequest, @Param('workspaceId') workspaceId: string, @Param('folderId') folderId: string) { return this.documents.deleteFolder(workspaceId, req.user!.id, folderId) }
  @Get(':documentId') get(@Req() req: AppRequest, @Param('workspaceId') workspaceId: string, @Param('documentId') documentId: string) { return this.documents.get(workspaceId, req.user!.id, documentId) }
  @Patch(':documentId') update(@Req() req: AppRequest, @Param('workspaceId') workspaceId: string, @Param('documentId') documentId: string, @Body() body: unknown) { return this.documents.update(workspaceId, req.user!.id, documentId, parse(documentUpdateSchema, body)) }
  @Post(':documentId/duplicate') duplicate(@Req() req: AppRequest, @Param('workspaceId') workspaceId: string, @Param('documentId') documentId: string) { return this.documents.duplicate(workspaceId, req.user!.id, documentId) }
  @Delete(':documentId') delete(@Req() req: AppRequest, @Param('workspaceId') workspaceId: string, @Param('documentId') documentId: string) { return this.documents.delete(workspaceId, req.user!.id, documentId) }
  @Get(':documentId/versions') versions(@Req() req: AppRequest, @Param('workspaceId') workspaceId: string, @Param('documentId') documentId: string) { return this.documents.versions(workspaceId, req.user!.id, documentId) }
}
