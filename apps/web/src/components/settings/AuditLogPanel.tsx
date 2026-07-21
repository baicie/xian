import { useEffect, useState } from 'react'
import { History, ShieldCheck } from 'lucide-react'
import { api, type AuditLog } from '@/api'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const actionLabels: Record<string, { en: string; zh: string }> = {
  'invitation.created': { en: 'Invitation created', zh: '创建邀请' },
  'invitation.revoked': { en: 'Invitation revoked', zh: '撤销邀请' },
  'invitation.accepted': { en: 'Invitation accepted', zh: '接受邀请' },
  'user.provisioned': { en: 'Account provisioned', zh: '开通账号' },
  'member.added': { en: 'Member added', zh: '添加成员' },
  'project.created': { en: 'Project created', zh: '创建项目' },
  'project.deleted': { en: 'Project deleted', zh: '删除项目' },
  'plan.applied': { en: 'Plan applied', zh: '应用计划' },
  'workspace.imported': { en: 'Workspace imported', zh: '导入工作区' },
}

function auditDetail(log: AuditLog) {
  const data = log.afterData
  if (!data) return log.entityType
  const parts = [data.email, data.name, data.role].filter(
    (value): value is string => typeof value === 'string',
  )
  return parts.length ? parts.join(' · ') : log.entityType
}

export default function AuditLogPanel({ workspaceId, en }: { workspaceId: string; en: boolean }) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    setState('loading')
    void api
      .auditLogs(workspaceId)
      .then((items) => {
        setLogs(items)
        setState('ready')
      })
      .catch(() => setState('error'))
  }, [workspaceId])

  return (
    <Card className="settings-panel">
      <CardHeader>
        <CardTitle>
          <ShieldCheck />
          {en ? 'Audit log' : '审计日志'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {state === 'loading' ? (
          <p className="audit-state" role="status">
            {en ? 'Loading…' : '加载中…'}
          </p>
        ) : null}
        {state === 'error' ? (
          <p className="audit-state is-error" role="alert">
            {en ? 'Unable to load audit log' : '无法加载审计日志'}
          </p>
        ) : null}
        {state === 'ready' && !logs.length ? (
          <p className="audit-state">
            <History />
            {en ? 'No audit events' : '暂无审计记录'}
          </p>
        ) : null}
        {state === 'ready' && logs.length ? (
          <div className="audit-list">
            {logs.map((log) => {
              const label = actionLabels[log.action]
              return (
                <article key={log.id}>
                  <History />
                  <span>
                    <strong>{label ? (en ? label.en : label.zh) : log.action}</strong>
                    <small>{auditDetail(log)}</small>
                  </span>
                  <span className="audit-actor">
                    <strong>{log.actorName ?? (en ? 'System' : '系统')}</strong>
                    <time dateTime={log.createdAt}>{new Date(log.createdAt).toLocaleString()}</time>
                  </span>
                  <Badge variant="secondary">{log.entityType}</Badge>
                </article>
              )
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
