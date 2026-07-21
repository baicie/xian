import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { createHash } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { Response } from 'express'
import { z } from 'zod'
import type { AppRequest } from '../common/http.js'
import { parse } from '../common/http.js'
import { DatabaseService } from '../database/database.service.js'
import { WorkspaceService } from './workspaces.js'
import {
  ASSET_MAX_FILE_BYTES,
  ASSET_WORKSPACE_QUOTA_BYTES,
  detectAssetType,
  isInlineAssetType,
  safeAssetName,
} from './asset-types.js'

const STORAGE_ROOT = resolve(
  process.env.ASSET_STORAGE_ROOT ?? join(process.cwd(), 'data', 'assets'),
)
type Upload = { buffer: Buffer; originalname: string; mimetype: string }
type AssetRow = {
  id: string
  originalName: string
  contentType: string
  sizeBytes: number
  sha256: string
  storageKey: string
  createdAt: string
  referenceCount: number
}
const quotaSchema = z
  .object({
    quotaBytes: z
      .number()
      .int()
      .min(1024 * 1024)
      .max(100 * 1024 * 1024 * 1024 * 1024),
  })
  .strict()

@Injectable()
export class AssetService {
  constructor(
    private readonly db: DatabaseService,
    private readonly workspaces: WorkspaceService,
  ) {}
  private path(storageKey: string) {
    const path = resolve(STORAGE_ROOT, storageKey)
    if (!path.startsWith(`${STORAGE_ROOT}\\`) && !path.startsWith(`${STORAGE_ROOT}/`))
      throw new Error('Invalid storage key')
    return path
  }
  async list(workspaceId: string, userId: string) {
    await this.workspaces.role(workspaceId, userId, 'workspace.read')
    const assets = await this.db.client<
      AssetRow[]
    >`SELECT a.id,a.original_name AS "originalName",a.content_type AS "contentType",a.size_bytes AS "sizeBytes",a.sha256,a.storage_key AS "storageKey",a.created_at AS "createdAt",count(ca.comment_id)::int AS "referenceCount" FROM assets a LEFT JOIN comment_assets ca ON ca.asset_id=a.id WHERE a.workspace_id=${workspaceId} GROUP BY a.id ORDER BY a.created_at DESC`
    const usedBytes = assets.reduce((total, item) => total + item.sizeBytes, 0)
    const [workspace] = await this.db.client<
      { quotaBytes: number }[]
    >`SELECT asset_quota_bytes::float8 AS "quotaBytes" FROM workspaces WHERE id=${workspaceId}`
    return {
      assets: assets.map(({ storageKey: _, ...item }) => item),
      usage: { usedBytes, quotaBytes: workspace?.quotaBytes ?? ASSET_WORKSPACE_QUOTA_BYTES },
    }
  }
  async updateQuota(workspaceId: string, userId: string, quotaBytes: number) {
    await this.workspaces.role(workspaceId, userId, 'workspace.manage')
    const [usage] = await this.db.client<
      { usedBytes: number }[]
    >`SELECT coalesce(sum(size_bytes),0)::float8 AS "usedBytes" FROM assets WHERE workspace_id=${workspaceId}`
    if ((usage?.usedBytes ?? 0) > quotaBytes)
      throw new BadRequestException({
        code: 'ASSET_QUOTA_BELOW_USAGE',
        message: '容量上限不能低于当前已用空间',
      })
    const [row] = await this.db.client<
      { quotaBytes: number }[]
    >`UPDATE workspaces SET asset_quota_bytes=${quotaBytes} WHERE id=${workspaceId} RETURNING asset_quota_bytes::float8 AS "quotaBytes"`
    return { quotaBytes: row!.quotaBytes, usedBytes: usage?.usedBytes ?? 0 }
  }
  async upload(workspaceId: string, userId: string, file?: Upload) {
    await this.workspaces.role(workspaceId, userId, 'comment.create')
    if (!file?.buffer?.length)
      throw new BadRequestException({ code: 'ASSET_FILE_REQUIRED', message: '请选择文件' })
    const originalName = safeAssetName(file.originalname),
      contentType = detectAssetType(originalName, file.buffer)
    if (!contentType)
      throw new BadRequestException({
        code: 'ASSET_TYPE_UNSUPPORTED',
        message: '不支持该文件格式或文件内容与扩展名不匹配',
      })
    if (file.buffer.length > ASSET_MAX_FILE_BYTES)
      throw new BadRequestException({
        code: 'ASSET_TOO_LARGE',
        message: `单个文件不能超过 ${Math.floor(ASSET_MAX_FILE_BYTES / 1024 / 1024)} MB`,
      })
    const sha256 = createHash('sha256').update(file.buffer).digest('hex')
    const storageKey = join(workspaceId, sha256.slice(0, 2), sha256)
    const path = this.path(storageKey)
    let createdFile = false
    try {
      return await this.db.client.begin(async (sql) => {
        await sql`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`
        const [existing] = await sql<
          AssetRow[]
        >`SELECT id,original_name AS "originalName",content_type AS "contentType",size_bytes AS "sizeBytes",sha256,created_at AS "createdAt",0::int AS "referenceCount",storage_key AS "storageKey" FROM assets WHERE workspace_id=${workspaceId} AND sha256=${sha256}`
        if (existing) {
          const { storageKey: _, ...result } = existing
          return { ...result, deduplicated: true }
        }
        const [usage] = await sql<
          { usedBytes: number; quotaBytes: number }[]
        >`SELECT coalesce(sum(a.size_bytes),0)::float8 AS "usedBytes",w.asset_quota_bytes::float8 AS "quotaBytes" FROM workspaces w LEFT JOIN assets a ON a.workspace_id=w.id WHERE w.id=${workspaceId} GROUP BY w.id`
        if (
          (usage?.usedBytes ?? 0) + file.buffer.length >
          (usage?.quotaBytes ?? ASSET_WORKSPACE_QUOTA_BYTES)
        )
          throw new BadRequestException({
            code: 'ASSET_QUOTA_EXCEEDED',
            message: '工作区静态资源空间不足，请联系管理员调整容量上限',
          })
        await mkdir(dirname(path), { recursive: true })
        try {
          await writeFile(path, file.buffer, { flag: 'wx' })
          createdFile = true
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        }
        const [created] = await sql<
          AssetRow[]
        >`INSERT INTO assets(workspace_id,uploaded_by,original_name,content_type,size_bytes,sha256,storage_key) VALUES(${workspaceId},${userId},${originalName},${contentType},${file.buffer.length},${sha256},${storageKey}) RETURNING id,original_name AS "originalName",content_type AS "contentType",size_bytes AS "sizeBytes",sha256,created_at AS "createdAt",0::int AS "referenceCount",storage_key AS "storageKey"`
        const { storageKey: _, ...result } = created!
        return { ...result, deduplicated: false }
      })
    } catch (error) {
      if (createdFile) await unlink(path).catch(() => undefined)
      throw error
    }
  }
  async get(workspaceId: string, userId: string, id: string) {
    await this.workspaces.role(workspaceId, userId, 'workspace.read')
    const [asset] = await this.db.client<
      AssetRow[]
    >`SELECT id,original_name AS "originalName",content_type AS "contentType",size_bytes AS "sizeBytes",sha256,storage_key AS "storageKey",created_at AS "createdAt",0::int AS "referenceCount" FROM assets WHERE id=${id} AND workspace_id=${workspaceId}`
    if (!asset) throw new NotFoundException({ code: 'ASSET_NOT_FOUND', message: '资源不存在' })
    try {
      return { asset, data: await readFile(this.path(asset.storageKey)) }
    } catch {
      throw new NotFoundException({
        code: 'ASSET_FILE_MISSING',
        message: '资源文件缺失，请从备份恢复',
      })
    }
  }
  async remove(workspaceId: string, userId: string, id: string) {
    const role = await this.workspaces.role(workspaceId, userId, 'workspace.read')
    const [asset] = await this.db.client<
      { storageKey: string; references: number; uploadedBy: string }[]
    >`SELECT a.storage_key AS "storageKey",a.uploaded_by AS "uploadedBy",count(ca.comment_id)::int AS references FROM assets a LEFT JOIN comment_assets ca ON ca.asset_id=a.id WHERE a.id=${id} AND a.workspace_id=${workspaceId} GROUP BY a.id`
    if (!asset) throw new NotFoundException({ code: 'ASSET_NOT_FOUND', message: '资源不存在' })
    if (!['OWNER', 'ADMIN'].includes(role) && asset.uploadedBy !== userId)
      throw new ConflictException({
        code: 'ASSET_DELETE_FORBIDDEN',
        message: '只能删除自己上传且未引用的资源',
      })
    if (asset.references)
      throw new ConflictException({ code: 'ASSET_IN_USE', message: '资源仍被评论引用，不能删除' })
    await this.db.client`DELETE FROM assets WHERE id=${id} AND workspace_id=${workspaceId}`
    try {
      await unlink(this.path(asset.storageKey))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    return { ok: true }
  }
}

@Controller('workspaces/:workspaceId/assets')
export class AssetController {
  constructor(private readonly assets: AssetService) {}
  @Get() list(@Req() req: AppRequest, @Param('workspaceId') workspaceId: string) {
    return this.assets.list(workspaceId, req.user!.id)
  }
  @Patch('quota') updateQuota(
    @Req() req: AppRequest,
    @Param('workspaceId') workspaceId: string,
    @Body() body: unknown,
  ) {
    return this.assets.updateQuota(workspaceId, req.user!.id, parse(quotaSchema, body).quotaBytes)
  }
  @Post()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: ASSET_MAX_FILE_BYTES, files: 1 } }),
  )
  upload(
    @Req() req: AppRequest,
    @Param('workspaceId') workspaceId: string,
    @UploadedFile() file?: Upload,
  ) {
    return this.assets.upload(workspaceId, req.user!.id, file)
  }
  @Get(':id') async download(
    @Req() req: AppRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { asset, data } = await this.assets.get(workspaceId, req.user!.id, id)
    res.setHeader('content-type', asset.contentType)
    res.setHeader('content-length', asset.sizeBytes)
    res.setHeader('x-content-type-options', 'nosniff')
    res.setHeader(
      'content-disposition',
      `${isInlineAssetType(asset.contentType) ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(asset.originalName)}`,
    )
    res.setHeader('cache-control', 'private, max-age=31536000, immutable')
    res.send(data)
  }
  @Delete(':id') remove(
    @Req() req: AppRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.assets.remove(workspaceId, req.user!.id, id)
  }
}
