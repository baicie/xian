import { type Dispatch, type SetStateAction, useMemo } from 'react'
import { FileText, Trash2 } from 'lucide-react'
import { api, type Asset } from '@/api'
import AssetPreview from '@/components/AssetPreview'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  assetExtension,
  formatAssetSize,
  getDeletableAssetIds,
  isPreviewableAsset,
} from '@/lib/assets'

type Props = {
  assets: Asset[]
  selected: string[]
  setSelected: Dispatch<SetStateAction<string[]>>
  busy: boolean
  workspaceId: string
  en: boolean
  onDelete: (ids: string[]) => void
}

export default function AssetTable({
  assets,
  selected,
  setSelected,
  busy,
  workspaceId,
  en,
  onDelete,
}: Props) {
  const deletableIds = useMemo(() => getDeletableAssetIds(assets), [assets]),
    allSelected = deletableIds.length > 0 && deletableIds.every((id) => selected.includes(id)),
    date = new Intl.DateTimeFormat(en ? 'en' : 'zh-CN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })

  return (
    <>
      <div className="asset-toolbar">
        <span>
          {en ? `${assets.length} files` : `共 ${assets.length} 个文件`}
          {selected.length
            ? en
              ? ` · ${selected.length} selected`
              : ` · 已选 ${selected.length} 个`
            : ''}
        </span>
        <Button
          size="sm"
          variant="destructive"
          disabled={busy || selected.length === 0}
          onClick={() => onDelete(selected)}
        >
          <Trash2 data-icon="inline-start" />
          {en ? 'Delete selected' : '删除所选'}
        </Button>
      </div>
      <Table className="asset-table">
        <TableHeader>
          <TableRow>
            <TableHead>
              <Checkbox
                aria-label={en ? 'Select all unused files' : '选择全部未使用文件'}
                checked={allSelected}
                indeterminate={selected.length > 0 && !allSelected}
                disabled={deletableIds.length === 0}
                onCheckedChange={(checked) => setSelected(checked ? deletableIds : [])}
              />
            </TableHead>
            <TableHead>{en ? 'File' : '文件'}</TableHead>
            <TableHead>{en ? 'Size' : '大小'}</TableHead>
            <TableHead>{en ? 'Uploaded' : '上传时间'}</TableHead>
            <TableHead>{en ? 'Used in' : '使用情况'}</TableHead>
            <TableHead>
              <span className="sr-only">{en ? 'Actions' : '操作'}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assets.map((asset) => (
            <TableRow
              key={asset.id}
              data-state={selected.includes(asset.id) ? 'selected' : undefined}
            >
              <TableCell>
                <Checkbox
                  aria-label={`${en ? 'Select' : '选择'} ${asset.originalName}`}
                  checked={selected.includes(asset.id)}
                  disabled={asset.referenceCount > 0}
                  onCheckedChange={(checked) =>
                    setSelected((current) =>
                      checked ? [...current, asset.id] : current.filter((id) => id !== asset.id),
                    )
                  }
                />
              </TableCell>
              <TableCell>
                <AssetPreview
                  className="asset-name"
                  workspaceId={workspaceId}
                  asset={{
                    id: asset.id,
                    name: asset.originalName,
                    contentType: asset.contentType,
                  }}
                  en={en}
                >
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
                    <small>{asset.contentType}</small>
                  </span>
                </AssetPreview>
              </TableCell>
              <TableCell>{formatAssetSize(asset.sizeBytes)}</TableCell>
              <TableCell>{date.format(new Date(asset.createdAt))}</TableCell>
              <TableCell>
                <Badge variant={asset.referenceCount ? 'secondary' : 'outline'}>
                  {asset.referenceCount
                    ? en
                      ? `${asset.referenceCount} comments`
                      : `${asset.referenceCount} 处评论`
                    : en
                      ? 'Unused'
                      : '未使用'}
                </Badge>
              </TableCell>
              <TableCell>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={busy || asset.referenceCount > 0}
                  aria-label={`${en ? 'Delete' : '删除'} ${asset.originalName}`}
                  title={
                    asset.referenceCount
                      ? en
                        ? 'Still referenced'
                        : '仍被评论引用'
                      : en
                        ? 'Delete'
                        : '删除'
                  }
                  onClick={() => onDelete([asset.id])}
                >
                  <Trash2 />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  )
}
