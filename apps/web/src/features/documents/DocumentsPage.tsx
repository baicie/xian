import { FormEvent, useEffect, useState } from 'react'
import { BookOpen, Clock3, FilePlus2, History, Save } from 'lucide-react'
import { toast } from 'sonner'
import { api, DocumentKind, DocumentSummary, WorkspaceDocument } from '@/api'
import ChoiceSelect from '@/components/ChoiceSelect'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import MarkdownEditor from './MarkdownEditor'

const kinds:DocumentKind[]=['DESIGN','ARCHITECTURE','REQUIREMENT','MEETING','RETROSPECTIVE']
const kindName:Record<DocumentKind,string>={DESIGN:'设计',ARCHITECTURE:'架构',REQUIREMENT:'需求',MEETING:'会议',RETROSPECTIVE:'复盘'}
type Project={id:string;name:string}

export default function DocumentsPage({workspaceId,projects,en}:{workspaceId:string;projects:Project[];en:boolean}) {
  const [items,setItems]=useState<DocumentSummary[]>([]),[document,setDocument]=useState<WorkspaceDocument|null>(null),[draft,setDraft]=useState<WorkspaceDocument|null>(null)
  const [creating,setCreating]=useState(false),[history,setHistory]=useState<Awaited<ReturnType<typeof api.documentVersions>>|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const load=async(selectFirst=false)=>{const next=await api.documents(workspaceId);setItems(next);if(selectFirst&&next[0])await open(next[0].id)}
  const open=async(id:string)=>{setError('');try{const next=await api.document(workspaceId,id);setDocument(next);setDraft(next)}catch(reason){setError(reason instanceof Error?reason.message:'加载失败')}}
  useEffect(()=>{setDocument(null);setDraft(null);void load(true).catch(reason=>setError(reason.message))},[workspaceId])
  const save=async()=>{if(!document||!draft)return;setBusy(true);try{const next=await api.updateDocument(workspaceId,document.id,{title:draft.title,kind:draft.kind,projectId:draft.projectId,content:draft.content,status:draft.status,version:document.version});setDocument(next);setDraft(next);await load();toast.success(en?'Document saved':'文档已保存')}catch(reason){setError(reason instanceof Error?reason.message:'保存失败')}finally{setBusy(false)}}
  const create=async(input:{title:string;kind:DocumentKind;projectId:string|null})=>{const next=await api.createDocument(workspaceId,input);setCreating(false);await load();await open(next.id);toast.success(en?'Document created':'文档已创建')}
  return <section className="documents-page">
    <header><div><h1>{en?'Design documents':'设计文档'}</h1><p>{en?'Versioned project decisions in Markdown':'用可版本化的 Markdown 沉淀关键设计与决策'}</p></div><Button onClick={()=>setCreating(true)}><FilePlus2 data-icon="inline-start" />{en?'New document':'新建文档'}</Button></header>
    {error?<p className="page-error" role="alert">{error}</p>:null}
    <div className="documents-layout">
      <aside className="document-list" aria-label={en?'Documents':'文档列表'}>
        {items.map(item=><Button key={item.id} variant="ghost" className={item.id===document?.id?'active':''} onClick={()=>void open(item.id)}>
          <span><strong>{item.title}</strong><small>{item.projectName||kindName[item.kind]}</small></span><Badge variant="secondary">v{item.version}</Badge>
        </Button>)}
        {!items.length?<Empty><EmptyHeader><EmptyMedia variant="icon"><BookOpen /></EmptyMedia><EmptyTitle>{en?'No documents yet':'还没有设计文档'}</EmptyTitle><EmptyDescription>{en?'Create one to record the first decision.':'创建一篇文档，记录第一个关键决策。'}</EmptyDescription></EmptyHeader></Empty>:null}
      </aside>
      {draft?<main className="document-workspace">
        <div className="document-meta">
          <Input aria-label={en?'Document title':'文档标题'} value={draft.title} onChange={event=>setDraft({...draft,title:event.target.value})} />
          <ChoiceSelect label={en?'Document type':'文档类型'} value={draft.kind} options={kinds.map(value=>({value,label:kindName[value]}))} onChange={kind=>setDraft({...draft,kind})} />
          <ChoiceSelect label={en?'Project':'关联项目'} value={draft.projectId||'NONE'} options={[{value:'NONE',label:en?'Workspace-wide':'工作区级'},...projects.map(project=>({value:project.id,label:project.name}))]} onChange={projectId=>setDraft({...draft,projectId:projectId==='NONE'?null:projectId})} />
          <Button variant="outline" onClick={async()=>setHistory(await api.documentVersions(workspaceId,draft.id))}><History data-icon="inline-start" />v{draft.version}</Button>
          <Button disabled={busy||!draft.title.trim()} onClick={()=>void save()}><Save data-icon="inline-start" />{busy?(en?'Saving…':'保存中…'):(en?'Save':'保存')}</Button>
        </div>
        <MarkdownEditor key={`${draft.id}-${document?.version}`} value={draft.content} onChange={content=>setDraft(current=>current?{...current,content}:current)} />
      </main>:<Card className="document-placeholder"><CardContent><BookOpen/><span>{en?'Choose or create a document':'选择或新建一篇文档'}</span></CardContent></Card>}
    </div>
    <CreateDocumentDialog open={creating} onOpenChange={setCreating} projects={projects} en={en} onCreate={create}/>
    <Dialog open={Boolean(history)} onOpenChange={open=>!open&&setHistory(null)}><DialogContent><DialogHeader><DialogTitle>{en?'Version history':'版本历史'}</DialogTitle><DialogDescription>{en?'Every save creates an immutable snapshot.':'每次保存都会创建不可变更的历史快照。'}</DialogDescription></DialogHeader><div className="version-list">{history?.map(item=><Card size="sm" key={item.id}><CardContent><Clock3/><span><strong>v{item.version} · {item.title}</strong><small>{item.createdByName} · {new Date(item.createdAt).toLocaleString()}</small></span>{item.changeNote?<Badge variant="outline">{item.changeNote}</Badge>:null}</CardContent></Card>)}</div></DialogContent></Dialog>
  </section>
}

function CreateDocumentDialog({open,onOpenChange,projects,en,onCreate}:{open:boolean;onOpenChange:(open:boolean)=>void;projects:Project[];en:boolean;onCreate:(input:{title:string;kind:DocumentKind;projectId:string|null})=>Promise<void>}) {
  const [kind,setKind]=useState<DocumentKind>('DESIGN'),[projectId,setProjectId]=useState('NONE'),[busy,setBusy]=useState(false)
  const submit=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();setBusy(true);try{await onCreate({title:String(new FormData(event.currentTarget).get('title')),kind,projectId:projectId==='NONE'?null:projectId})}finally{setBusy(false)}}
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><form onSubmit={submit}><DialogHeader><DialogTitle>{en?'New document':'新建设计文档'}</DialogTitle><DialogDescription>{en?'Start with a title and refine the content in the editor.':'先确定标题与归属，再进入编辑器完善内容。'}</DialogDescription></DialogHeader><FieldGroup className="create-form"><Field><FieldLabel htmlFor="document-title">{en?'Title':'标题'}</FieldLabel><Input id="document-title" name="title" required autoFocus /></Field><Field><FieldLabel>{en?'Type':'类型'}</FieldLabel><ChoiceSelect label={en?'Type':'类型'} value={kind} options={kinds.map(value=>({value,label:kindName[value]}))} onChange={setKind}/></Field><Field><FieldLabel>{en?'Project':'关联项目'}</FieldLabel><ChoiceSelect label={en?'Project':'关联项目'} value={projectId} options={[{value:'NONE',label:en?'Workspace-wide':'工作区级'},...projects.map(project=>({value:project.id,label:project.name}))]} onChange={setProjectId}/></Field></FieldGroup><DialogFooter><Button type="button" variant="outline" onClick={()=>onOpenChange(false)}>{en?'Cancel':'取消'}</Button><Button type="submit" disabled={busy}>{busy?(en?'Creating…':'创建中…'):(en?'Create':'创建')}</Button></DialogFooter></form></DialogContent></Dialog>
}
