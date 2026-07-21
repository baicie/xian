import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, Files, HardDrive, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { api, type Asset } from '@/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { assetAccept, assetExtension, isPreviewableAsset } from '@/lib/assets'

const size = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`

export default function AssetsPanel({ workspaceId, en }: { workspaceId: string; en: boolean }) {
  const input = useRef<HTMLInputElement>(null),
    [assets, setAssets] = useState<Asset[]>([]),
    [usage, setUsage] = useState({ usedBytes: 0, quotaBytes: 1 }),
    [quotaMb, setQuotaMb] = useState(1024),
    [busy, setBusy] = useState(false)
  const load = useCallback(
    () =>
      api
        .assets(workspaceId)
        .then((result) => {
          setAssets(result.assets)
          setUsage(result.usage)
          setQuotaMb(Math.round(result.usage.quotaBytes / 1024 / 1024))
        })
        .catch((reason) => toast.error(reason instanceof Error ? reason.message : '资源加载失败')),
    [workspaceId],
  )
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
  const remove = async (asset: Asset) => {
    setBusy(true)
    try {
      await api.deleteAsset(workspaceId, asset.id)
      await load()
      toast.success(en ? 'Resource deleted' : '资源已删除')
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : '删除失败')
    } finally {
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
    <Card className="settings-panel">
      <CardHeader>
        <CardTitle>
          <HardDrive />
          {en ? 'Static resources' : '静态资源'}
        </CardTitle>
        <CardDescription>
          {en
            ? 'Images and design deliverables are deduplicated. Referenced files cannot be deleted.'
            : '图片与设计交付物按内容去重；评论仍在引用的文件不可删除。'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="asset-usage">
          <span>
            <strong>
              {size(usage.usedBytes)} / {size(usage.quotaBytes)}
            </strong>
            <small>{en ? 'Workspace storage' : '工作区资源用量'}</small>
          </span>
          <div>
            <i style={{ width: `${percent}%` }} />
          </div>
          <input
            ref={input}
            hidden
            type="file"
            accept={assetAccept}
            onChange={(event) => void upload(event.target.files?.[0])}
          />
          <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}>
            <Upload data-icon="inline-start" />
            {en ? 'Upload file' : '上传文件'}
          </Button>
        </div>
        <div className="asset-quota">
          <span>
            <strong>{en ? 'Storage limit' : '容量上限'}</strong>
            <small>
              {en ? 'Administrators can set 1 MB to 100 TB' : '管理员可设置 1 MB 至 100 TB'}
            </small>
          </span>
          <Input
            type="number"
            min={1}
            max={104857600}
            step={1}
            value={quotaMb}
            onChange={(event) => setQuotaMb(Number(event.target.value))}
          />
          <b>MB</b>
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
            {en ? 'Save limit' : '保存上限'}
          </Button>
        </div>
        {assets.length ? (
          <div className="asset-list">
            {assets.map((asset) => (
              <div key={asset.id}>
                <a href={api.assetUrl(workspaceId, asset.id)} target="_blank" rel="noreferrer">
                  {isPreviewableAsset(asset.contentType) ? (
                    <img src={api.assetUrl(workspaceId, asset.id)} alt="" />
                  ) : (
                    <span className="asset-file-icon">
                      <FileText />
                      <b>{assetExtension(asset.originalName)}</b>
                    </span>
                  )}
                  <span>
                    <strong>{asset.originalName}</strong>
                    <small>
                      {size(asset.sizeBytes)} · {asset.referenceCount}{' '}
                      {en ? 'references' : '处引用'}
                    </small>
                  </span>
                </a>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={busy || asset.referenceCount > 0}
                  title={
                    asset.referenceCount
                      ? en
                        ? 'Still referenced'
                        : '仍被评论引用'
                      : en
                        ? 'Delete'
                        : '删除'
                  }
                  onClick={() => void remove(asset)}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="asset-empty">
            <Files />
            <span>{en ? 'No uploaded files' : '暂无静态资源'}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
