import type { ReactNode } from 'react'
import { ExternalLink } from 'lucide-react'
import { api } from '@/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { isPreviewableAsset } from '@/lib/assets'

type Props = {
  workspaceId: string
  asset: { id: string; name: string; contentType: string }
  className?: string
  children: ReactNode
  en?: boolean
}

export default function AssetPreview({ workspaceId, asset, className, children, en }: Props) {
  const url = api.assetUrl(workspaceId, asset.id)
  if (!isPreviewableAsset(asset.contentType))
    return (
      <a className={className} href={url} target="_blank" rel="noreferrer">
        {children}
      </a>
    )

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" className={className} />}>
        {children}
      </DialogTrigger>
      <DialogContent className="asset-preview-dialog">
        <DialogHeader>
          <DialogTitle>{asset.name}</DialogTitle>
          <DialogDescription>{asset.contentType}</DialogDescription>
        </DialogHeader>
        <img src={url} alt={asset.name} />
        <DialogFooter>
          <Button
            variant="outline"
            nativeButton={false}
            render={<a href={url} target="_blank" rel="noreferrer" />}
          >
            <ExternalLink data-icon="inline-start" />
            {en ? 'Open original' : '打开原图'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
