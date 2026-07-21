import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Bot, Copy, KeyRound, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Toggle } from '@/components/ui/toggle'
import { copyText } from '@/lib/clipboard'

export default function McpTokensPanel({ workspaceId, en }: { workspaceId: string; en: boolean }) {
  const [tokens, setTokens] = useState<Awaited<ReturnType<typeof api.mcpTokens>>>([]),
    [creating, setCreating] = useState(false),
    [created, setCreated] = useState(''),
    [revoking, setRevoking] = useState<string | null>(null)
  const load = useCallback(() => api.mcpTokens(workspaceId).then(setTokens), [workspaceId])
  useEffect(() => {
    void load()
  }, [load])
  return (
    <Card className="settings-panel">
      <CardHeader>
        <CardTitle>
          <Bot />
          MCP
        </CardTitle>
        <CardDescription>
          {en
            ? 'Connect GPT, Claude, Codex, or other MCP clients to this workspace.'
            : '让 GPT、Claude、Codex 等 MCP 客户端安全访问当前工作区。'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="endpoint">
          <span>
            <strong>{en ? 'Streamable HTTP endpoint' : 'Streamable HTTP 地址'}</strong>
            <code>{location.origin}/mcp</code>
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void copyText(`${location.origin}/mcp`)
                .then(() => toast.success(en ? 'Copied' : '已复制'))
                .catch(() => toast.error(en ? 'Copy failed' : '复制失败，请手动复制'))
            }
          >
            <Copy data-icon="inline-start" />
            {en ? 'Copy' : '复制'}
          </Button>
        </div>
        <div className="token-list">
          {tokens.map((token) => (
            <div key={token.id}>
              <KeyRound />
              <span>
                <strong>{token.name}</strong>
                <small>
                  {token.lastUsedAt
                    ? `${en ? 'Last used' : '上次使用'} ${new Date(token.lastUsedAt).toLocaleString()}`
                    : en
                      ? 'Never used'
                      : '尚未使用'}
                </small>
              </span>
              {token.scopes.map((scope) => (
                <Badge variant="secondary" key={scope}>
                  {scope}
                </Badge>
              ))}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={en ? 'Revoke token' : '撤销令牌'}
                onClick={() => setRevoking(token.id)}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
        <Button variant="outline" onClick={() => setCreating(true)}>
          <Plus data-icon="inline-start" />
          {en ? 'Create token' : '创建令牌'}
        </Button>
      </CardContent>
      <CreateTokenDialog
        open={creating}
        onOpenChange={setCreating}
        workspaceId={workspaceId}
        en={en}
        onCreated={async (token) => {
          setCreated(token)
          await load()
        }}
      />
      <Dialog open={Boolean(created)} onOpenChange={(open) => !open && setCreated('')}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{en ? 'Copy your token now' : '请立即复制令牌'}</DialogTitle>
            <DialogDescription>
              {en
                ? 'For security, 闲序 will not display it again.'
                : '出于安全考虑，闲序不会再次显示这个令牌。'}
            </DialogDescription>
          </DialogHeader>
          <div className="token-reveal">
            <Input readOnly value={created} />
            <Button
              onClick={() =>
                void copyText(created)
                  .then(() => toast.success(en ? 'Token copied' : '令牌已复制'))
                  .catch(() => toast.error(en ? 'Copy failed' : '复制失败，请手动复制'))
              }
            >
              <Copy data-icon="inline-start" />
              {en ? 'Copy' : '复制'}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setCreated('')}>{en ? 'Done' : '完成'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={Boolean(revoking)} onOpenChange={(open) => !open && setRevoking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{en ? 'Revoke this token?' : '撤销这个令牌？'}</AlertDialogTitle>
            <AlertDialogDescription>
              {en
                ? 'Connected MCP clients will immediately lose access.'
                : '已连接的 MCP 客户端将立即失去访问权限。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{en ? 'Cancel' : '取消'}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (revoking) await api.revokeMcpToken(workspaceId, revoking)
                setRevoking(null)
                await load()
                toast.success(en ? 'Token revoked' : '令牌已撤销')
              }}
            >
              {en ? 'Revoke' : '撤销'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

function CreateTokenDialog({
  open,
  onOpenChange,
  workspaceId,
  en,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  en: boolean
  onCreated: (token: string) => Promise<void>
}) {
  const [write, setWrite] = useState(true),
    [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    try {
      const result = await api.createMcpToken(workspaceId, {
        name: String(new FormData(event.currentTarget).get('name')),
        write,
      })
      onOpenChange(false)
      await onCreated(result.token)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{en ? 'Create MCP token' : '创建 MCP 令牌'}</DialogTitle>
            <DialogDescription>
              {en
                ? 'Use a separate token for each client so it can be revoked independently.'
                : '建议每个客户端使用独立令牌，便于单独撤销。'}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="create-form">
            <Field>
              <FieldLabel htmlFor="mcp-token-name">{en ? 'Client name' : '客户端名称'}</FieldLabel>
              <Input id="mcp-token-name" name="name" required placeholder="Codex Desktop" />
            </Field>
            <Field orientation="horizontal">
              <span>
                <FieldLabel>{en ? 'Allow writes' : '允许写入'}</FieldLabel>
                <FieldDescription>
                  {en
                    ? 'Create documents and plans; applying still requires an explicit tool call.'
                    : '可创建文档与计划；应用计划仍需显式调用。'}
                </FieldDescription>
              </span>
              <Toggle pressed={write} onPressedChange={setWrite}>
                {write ? 'WRITE' : 'READ'}
              </Toggle>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {en ? 'Cancel' : '取消'}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? (en ? 'Creating…' : '创建中…') : en ? 'Create' : '创建'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
