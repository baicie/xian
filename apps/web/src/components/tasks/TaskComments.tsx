import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, FileText, MessageSquare, Paperclip, RotateCcw, Send } from 'lucide-react'
import { toast } from 'sonner'
import { api, type TaskComment } from '@/api'
import AssetPreview from '@/components/AssetPreview'
import ChoiceSelect from '@/components/ChoiceSelect'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { assetAccept, assetExtension, isPreviewableAsset } from '@/lib/assets'
import { attachFilesToTask } from '@/lib/taskAssets'

export default function TaskComments({
  workspaceId,
  taskId,
  en,
}: {
  workspaceId: string
  taskId: string
  en: boolean
}) {
  const input = useRef<HTMLInputElement>(null),
    [comments, setComments] = useState<TaskComment[]>([]),
    [body, setBody] = useState(''),
    [status, setStatus] = useState<'OPEN' | 'RESOLVED'>('OPEN'),
    [busy, setBusy] = useState(false)
  const load = useCallback(
    () =>
      api
        .taskComments(workspaceId, taskId)
        .then(setComments)
        .catch((reason) => toast.error(reason instanceof Error ? reason.message : '评论加载失败')),
    [workspaceId, taskId],
  )
  useEffect(() => {
    void load()
  }, [load])
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).slice(0, 12)
    if (!files.length) return
    setBusy(true)
    try {
      await attachFilesToTask(workspaceId, taskId, files, status, en)
      await load()
      toast.success(en ? 'Attachments uploaded' : '附件已上传')
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : '附件上传失败')
    } finally {
      setBusy(false)
      event.target.value = ''
    }
  }
  const submit = async () => {
    if (!body.trim()) return
    setBusy(true)
    try {
      await api.createTaskComment(workspaceId, taskId, {
        body: body.trim(),
        status,
        assetIds: [],
      })
      setBody('')
      setStatus('OPEN')
      await load()
      toast.success(en ? 'Comment added' : '评论已添加')
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : '评论失败')
    } finally {
      setBusy(false)
    }
  }
  const updateStatus = async (comment: TaskComment) => {
    const next = comment.status === 'OPEN' ? 'RESOLVED' : 'OPEN'
    try {
      await api.updateTaskComment(workspaceId, taskId, comment.id, next)
      setComments((current) =>
        current.map((item) => (item.id === comment.id ? { ...item, status: next } : item)),
      )
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : '状态更新失败')
    }
  }
  return (
    <section className="task-comments">
      <div className="task-comments-heading">
        <span>
          <MessageSquare />
          <strong>{en ? 'Repair feedback' : '修复反馈'}</strong>
        </span>
        <small>{comments.length}</small>
      </div>
      <div className="comment-list">
        {comments.length ? (
          comments.map((comment) => (
            <article key={comment.id}>
              <header>
                <span>
                  <strong>{comment.author}</strong>
                  <time>{new Date(comment.createdAt).toLocaleString(en ? 'en-US' : 'zh-CN')}</time>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void updateStatus(comment)}
                >
                  {comment.status === 'RESOLVED' ? (
                    <>
                      <CheckCircle2 />
                      {en ? 'Fixed' : '已修复'}
                    </>
                  ) : (
                    <>
                      <RotateCcw />
                      {en ? 'Needs fix' : '待修复'}
                    </>
                  )}
                </Button>
              </header>
              <p>{comment.body}</p>
              {comment.assets.length ? (
                <div className="comment-attachments">
                  {comment.assets.map((asset) => (
                    <AssetPreview
                      className={isPreviewableAsset(asset.contentType) ? 'is-image' : 'is-file'}
                      key={asset.id}
                      workspaceId={workspaceId}
                      asset={{ id: asset.id, name: asset.name, contentType: asset.contentType }}
                      en={en}
                    >
                      {isPreviewableAsset(asset.contentType) ? (
                        <img src={api.assetUrl(workspaceId, asset.id)} alt={asset.name} />
                      ) : (
                        <span>
                          <FileText />
                          <b>{assetExtension(asset.name)}</b>
                        </span>
                      )}
                      <small>{asset.name}</small>
                    </AssetPreview>
                  ))}
                </div>
              ) : null}
            </article>
          ))
        ) : (
          <p className="comment-empty">{en ? 'No repair feedback yet' : '暂无修复反馈'}</p>
        )}
      </div>
      <div className="comment-composer">
        <Textarea
          rows={3}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={
            en ? 'Describe what remains or confirm the fix…' : '说明仍需修复的问题，或确认已修复…'
          }
        />
        <div className="comment-actions">
          <input
            ref={input}
            hidden
            multiple
            type="file"
            accept={assetAccept}
            onChange={(event) => void upload(event)}
          />
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            disabled={busy}
            title={en ? 'Add attachments' : '添加附件'}
            onClick={() => input.current?.click()}
          >
            <Paperclip />
          </Button>
          <ChoiceSelect
            label={en ? 'Repair status' : '修复状态'}
            value={status}
            options={[
              { value: 'OPEN', label: en ? 'Needs fix' : '待修复' },
              { value: 'RESOLVED', label: en ? 'Fixed' : '已修复' },
            ]}
            onChange={setStatus}
          />
          <Button type="button" disabled={busy || !body.trim()} onClick={() => void submit()}>
            <Send data-icon="inline-start" />
            {en ? 'Comment' : '评论'}
          </Button>
        </div>
      </div>
    </section>
  )
}
