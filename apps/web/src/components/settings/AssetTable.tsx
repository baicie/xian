import { FileText, Trash2 } from 'lucide-react'
import { api, type Asset } from '@/api'
import AssetPreview from '@/components/AssetPreview'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { assetExtension, formatAssetSize, isPreviewableAsset } from '@/lib/assets'

type Props = {
  assets: Asset[]
  busy: boolean
  workspaceId: string
  en: boolean
  onDelete: (id: string) => void
}

export default function AssetTable({ assets, busy, workspaceId, en, onDelete }: Props) {
  const date = new Intl.DateTimeFormat(en ? 'en' : 'zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  return (
    <>
      <div className="asset-toolbar">
        <span>{en ? `${assets.length} files` : `共 ${assets.length} 个文件`}</span>
      </div>
      <Table className="asset-table">
        <TableHeader>
          <TableRow>
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
            <TableRow key={asset.id}>
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
                  onClick={() => onDelete(asset.id)}
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
