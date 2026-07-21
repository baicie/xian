import { useCallback, useEffect, useRef, useState } from 'react'
import { Files, HardDrive, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { api, type Asset } from '@/api'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import AssetTable from '@/components/settings/AssetTable'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { assetAccept, formatAssetSize } from '@/lib/assets'

export default function AssetsPanel({ workspaceId, en }: { workspaceId: string; en: boolean }) {
  const input = useRef<HTMLInputElement>(null),
    [assets, setAssets] = useState<Asset[]>([]),
    [usage, setUsage] = useState({ usedBytes: 0, quotaBytes: 1 }),
    [quotaMb, setQuotaMb] = useState(1024),
    [selected, setSelected] = useState<string[]>([]),
    [pendingDelete, setPendingDelete] = useState<string[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    try {
      const result = await api.assets(workspaceId)
      setAssets(result.assets)
      setUsage(result.usage)
      setQuotaMb(Math.round(result.usage.quotaBytes / 1024 / 1024))
      setSelected((current) =>
        current.filter((id) =>
          result.assets.some((asset) => asset.id === id && asset.referenceCount === 0),
        ),
      )
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : '资源加载失败')
    } finally {
      setLoading(false)
    }
  }, [workspaceId])
  useEffect(() => {
    void load()
  }, [load])

  const upload = async (file?: File) => {
    if (!file) return
    setBusy(true)
    try {
      const result = await api.uploadAsset(workspaceId, file)
      await load()
      toast.success(
        result.deduplicated
          ? en
            ? 'Existing file reused'
            : '已复用相同文件'
          : en
            ? 'File uploaded'
            : '文件已上传',
      )
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : '上传失败')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }
  const remove = async () => {
    if (!pendingDelete.length) return
    setBusy(true)
    try {
      await Promise.all(pendingDelete.map((id) => api.deleteAsset(workspaceId, id)))
      toast.success(en ? 'Resources deleted' : '资源已删除')
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : '删除失败')
    } finally {
      setPendingDelete([])
      await load()
      setBusy(false)
    }
  }
  const saveQuota = async () => {
    setBusy(true)
    try {
      const result = await api.updateAssetQuota(workspaceId, quotaMb * 1024 * 1024)
      setUsage(result)
      toast.success(en ? 'Storage limit updated' : '容量上限已更新')
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : en ? 'Update failed' : '更新失败')
    } finally {
      setBusy(false)
    }
  }
  const percent = Math.min(100, (usage.usedBytes / usage.quotaBytes) * 100)

  return (
    <>
      <Card className="settings-panel asset-manager">
        <CardHeader>
          <CardTitle>
            <HardDrive />
            {en ? 'Static resources' : '静态资源管理'}
          </CardTitle>
          <CardDescription>
            {en
              ? 'Review uploads, usage and references. Referenced files cannot be deleted.'
              : '查看上传时间、空间占用和使用情况；仍被评论引用的文件不可删除。'}
          </CardDescription>
          <CardAction>
            <input
              ref={input}
              hidden
              type="file"
              accept={assetAccept}
              onChange={(event) => void upload(event.target.files?.[0])}
            />
            <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}>
              <Upload data-icon="inline-start" />
              {en ? 'Upload' : '上传文件'}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="asset-usage">
            <span>
              <strong>
                {formatAssetSize(usage.usedBytes)} / {formatAssetSize(usage.quotaBytes)}
              </strong>
              <small>{en ? 'Workspace storage' : '工作区资源用量'}</small>
            </span>
            <Progress value={percent} aria-label={en ? 'Storage usage' : '存储空间用量'} />
          </div>
          <Field orientation="responsive" className="asset-quota">
            <FieldContent>
              <FieldLabel htmlFor="asset-quota">{en ? 'Storage limit' : '容量上限'}</FieldLabel>
              <FieldDescription>
                {en ? 'Administrators can set 1 MB to 100 TB' : '管理员可设置 1 MB 至 100 TB'}
              </FieldDescription>
            </FieldContent>
            <div className="asset-quota-control">
              <Input
                id="asset-quota"
                type="number"
                min={1}
                max={104857600}
                step={1}
                value={quotaMb}
                onChange={(event) => setQuotaMb(Number(event.target.value))}
              />
              <span>MB</span>
              <Button
                size="sm"
                disabled={
                  busy ||
                  !Number.isInteger(quotaMb) ||
                  quotaMb < 1 ||
                  quotaMb > 104857600 ||
                  quotaMb * 1024 * 1024 < usage.usedBytes
                }
                onClick={() => void saveQuota()}
              >
                {en ? 'Save' : '保存'}
              </Button>
            </div>
          </Field>
          {assets.length ? (
            <AssetTable
              assets={assets}
              selected={selected}
              setSelected={setSelected}
              busy={busy}
              workspaceId={workspaceId}
              en={en}
              onDelete={setPendingDelete}
            />
          ) : loading ? (
            <div
              className="asset-loading"
              aria-label={en ? 'Loading resources' : '正在加载静态资源'}
            >
              <Skeleton />
              <Skeleton />
              <Skeleton />
            </div>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Files />
                </EmptyMedia>
                <EmptyTitle>{en ? 'No uploaded files' : '暂无静态资源'}</EmptyTitle>
                <EmptyDescription>
                  {en ? 'Upload a file to manage it here.' : '上传文件后，可在这里查看和管理。'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
      <AlertDialog
        open={pendingDelete.length > 0}
        onOpenChange={(open) => !open && setPendingDelete([])}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{en ? 'Delete resources?' : '删除静态资源？'}</AlertDialogTitle>
            <AlertDialogDescription>
              {en
                ? `${pendingDelete.length} selected file(s) will be permanently deleted.`
                : `将永久删除选中的 ${pendingDelete.length} 个文件，此操作无法撤销。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{en ? 'Cancel' : '取消'}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy} onClick={() => void remove()}>
              {en ? 'Delete' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
