import { FormEvent, lazy, MouseEvent as ReactMouseEvent, Suspense, useEffect, useRef, useState } from 'react'
import { BookOpen, ChevronDown, ChevronRight, Clock3, Copy, File, FilePlus2, Folder, FolderOpen, FolderPlus, History, MoreHorizontal, Move, Pencil, RefreshCw, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, DocumentFolder, DocumentKind, DocumentSummary, WorkspaceDocument } from '@/api'
import ChoiceSelect from '@/components/ChoiceSelect'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { useIsMobile } from '@/hooks/use-mobile'
import { loadDocumentOnce, readDocumentCache, removeCachedDocument, writeDocumentCache } from './documentCache'

const MarkdownEditor = lazy(() => import('./MarkdownEditor'))
const kinds:DocumentKind[]=['DESIGN','ARCHITECTURE','REQUIREMENT','MEETING','RETROSPECTIVE']
const zhKind:Record<DocumentKind,string>={DESIGN:'设计',ARCHITECTURE:'架构',REQUIREMENT:'需求',MEETING:'会议',RETROSPECTIVE:'复盘'}
type Project={id:string;name:string}
type MenuTarget={type:'root'}|{type:'folder';folder:DocumentFolder}|{type:'document';document:DocumentSummary}
type ContextState={x:number;y:number;target:MenuTarget}|null
type EditAction={type:'folder';folder?:DocumentFolder;parentId?:string|null}|{type:'rename-document';document:DocumentSummary}|{type:'move-document';document:DocumentSummary}|null

export default function DocumentsPage({workspaceId,projects,en}:{workspaceId:string;projects:Project[];en:boolean}) {
  const initial=readDocumentCache(workspaceId)
  const isMobile=useIsMobile()
  const [items,setItems]=useState<DocumentSummary[]>(initial?.items??[]),[folders,setFolders]=useState<DocumentFolder[]>(initial?.folders??[])
  const [document,setDocument]=useState<WorkspaceDocument|null>(()=>initial?.selectedId?initial.documents[initial.selectedId]??null:null),[draft,setDraft]=useState<WorkspaceDocument|null>(()=>initial?.selectedId?initial.documents[initial.selectedId]??null:null)
  const [creating,setCreating]=useState<{folderId:string|null}|null>(null),[editing,setEditing]=useState<EditAction>(null),[menu,setMenu]=useState<ContextState>(null)
  const [expanded,setExpanded]=useState<Set<string>>(()=>new Set(initial?.folders.map(folder=>folder.id)??[])),[history,setHistory]=useState<Awaited<ReturnType<typeof api.documentVersions>>|null>(null)
  const [busy,setBusy]=useState(false),[refreshing,setRefreshing]=useState(!initial),[error,setError]=useState('')
  const activeId=useRef(initial?.selectedId??null)
  const labels=en?{title:'Design documents',subtitle:'Versioned project decisions and working notes',newDocument:'New document',newFolder:'New folder',root:'All documents',empty:'No documents yet',emptyHint:'Create a document to record the first decision.',choose:'Choose or create a document',save:'Save',saving:'Saving...',history:'Version history',historyHint:'Every save creates an immutable snapshot.',rename:'Rename',duplicate:'Duplicate',move:'Move to...',remove:'Delete',refresh:'Refresh',folderName:'Folder name',documentName:'Document name',cancel:'Cancel',create:'Create',apply:'Apply',rootFolder:'No folder',folder:'Folder'}:{title:'设计文档',subtitle:'集中整理方案、决策与工作笔记',newDocument:'新建文档',newFolder:'新建文件夹',root:'全部文档',empty:'还没有文档',emptyHint:'创建一篇文档，记录第一个关键决策。',choose:'选择或新建一篇文档',save:'保存',saving:'保存中...',history:'版本历史',historyHint:'每次保存都会创建不可变更的历史快照。',rename:'重命名',duplicate:'创建副本',move:'移动到...',remove:'删除',refresh:'刷新',folderName:'文件夹名称',documentName:'文档名称',cancel:'取消',create:'创建',apply:'应用',rootFolder:'根目录',folder:'文件夹'}

  const cacheDocument=(next:WorkspaceDocument,select=true)=>writeDocumentCache(workspaceId,{documents:{[next.id]:next},...(select?{selectedId:next.id}:{})})
  const open=async(id:string,{background=false}:{background?:boolean}={})=>{
    if(!background)activeId.current=id
    const cached=readDocumentCache(workspaceId)?.documents[id]
    if(cached&&!background){setDocument(cached);setDraft(cached);writeDocumentCache(workspaceId,{selectedId:id})}
    try{
      const next=await loadDocumentOnce(workspaceId,id,()=>api.document(workspaceId,id))
      cacheDocument(next,!background)
      if(activeId.current===id&&!background){setDocument(next);setDraft(current=>current?.id===id&&current.version===next.version?current:next)}
    }catch(reason){if(!background&&activeId.current===id)setError(reason instanceof Error?reason.message:(en?'Failed to load':'加载失败'))}
  }
  const refresh=async(selectFirst=false)=>{
    setRefreshing(true);setError('')
    try{
      const [nextItems,nextFolders]=await Promise.all([api.documents(workspaceId),api.documentFolders(workspaceId)])
      setItems(nextItems);setFolders(nextFolders);writeDocumentCache(workspaceId,{items:nextItems,folders:nextFolders})
      const selected=activeId.current&&nextItems.some(item=>item.id===activeId.current)?activeId.current:nextItems[0]?.id
      if(selectFirst&&selected)await open(selected)
      if(!nextItems.length){activeId.current=null;setDocument(null);setDraft(null)}
    }catch(reason){setError(reason instanceof Error?reason.message:(en?'Failed to load':'加载失败'))}finally{setRefreshing(false)}
  }
  useEffect(()=>{const cached=readDocumentCache(workspaceId);activeId.current=cached?.selectedId??null;setItems(cached?.items??[]);setFolders(cached?.folders??[]);const selected=cached?.selectedId?cached.documents[cached.selectedId]??null:null;setDocument(selected);setDraft(selected);void refresh(true)},[workspaceId])
  useEffect(()=>{if(!menu)return;const close=()=>setMenu(null);window.addEventListener('click',close);window.addEventListener('blur',close);return()=>{window.removeEventListener('click',close);window.removeEventListener('blur',close)}},[menu])

  const save=async()=>{if(!document||!draft)return;setBusy(true);try{const next=await api.updateDocument(workspaceId,document.id,{title:draft.title,kind:draft.kind,projectId:draft.projectId,folderId:draft.folderId,content:draft.content,status:draft.status,version:document.version});setDocument(next);setDraft(next);cacheDocument(next);await refresh();toast.success(en?'Document saved':'文档已保存')}catch(reason){setError(reason instanceof Error?reason.message:(en?'Failed to save':'保存失败'))}finally{setBusy(false)}}
  const create=async(input:{title:string;kind:DocumentKind;projectId:string|null;folderId:string|null})=>{const next=await api.createDocument(workspaceId,input);setCreating(null);if(input.folderId)setExpanded(current=>new Set(current).add(input.folderId!));cacheDocument(next);await refresh();await open(next.id);toast.success(en?'Document created':'文档已创建')}
  const createFolder=async(name:string,parentId:string|null)=>{await api.createDocumentFolder(workspaceId,{name,parentId});setEditing(null);await refresh();toast.success(en?'Folder created':'文件夹已创建')}
  const rename=async(target:DocumentFolder|DocumentSummary,name:string)=>{if('parentId'in target)await api.updateDocumentFolder(workspaceId,target.id,{name});else await api.updateDocument(workspaceId,target.id,{title:name,version:target.version});setEditing(null);await refresh();if(target.id===document?.id)await open(target.id);toast.success(en?'Renamed':'已重命名')}
  const moveDocument=async(target:DocumentSummary,folderId:string|null)=>{const next=await api.updateDocument(workspaceId,target.id,{folderId,version:target.version});if(folderId)setExpanded(current=>new Set(current).add(folderId));cacheDocument(next);setEditing(null);await refresh();if(target.id===document?.id){setDocument(next);setDraft(next)}toast.success(en?'Document moved':'文档已移动')}
  const duplicate=async(target:DocumentSummary)=>{const next=await api.duplicateDocument(workspaceId,target.id);cacheDocument(next);await refresh();await open(next.id);toast.success(en?'Copy created':'副本已创建')}
  const remove=async(target:DocumentFolder|DocumentSummary)=>{const folder='parentId'in target;if(!confirm(folder?(en?'Delete this folder? Its contents will move to the root.':'删除此文件夹？其中内容会移到根目录。'):(en?'Delete this document permanently?':'确定永久删除此文档？')))return;if(folder)await api.deleteDocumentFolder(workspaceId,target.id);else{await api.deleteDocument(workspaceId,target.id);removeCachedDocument(workspaceId,target.id);if(document?.id===target.id){setDocument(null);setDraft(null);activeId.current=null}}await refresh(true);toast.success(en?'Deleted':'已删除')}
  const showMenu=(event:ReactMouseEvent,target:MenuTarget)=>{event.preventDefault();event.stopPropagation();setMenu({x:Math.min(event.clientX,window.innerWidth-210),y:Math.min(event.clientY,window.innerHeight-230),target})}
  const rootItems=items.filter(item=>!item.folderId)
  const roots=folders.filter(folder=>!folder.parentId)
  const hasChanges=Boolean(document&&draft&&(document.title!==draft.title||document.kind!==draft.kind||document.projectId!==draft.projectId||document.folderId!==draft.folderId||document.content!==draft.content||document.status!==draft.status))

  return <section className="documents-page">
    <header><div><h1>{labels.title}</h1><p>{labels.subtitle}</p></div><Button onClick={()=>setCreating({folderId:null})}><FilePlus2 data-icon="inline-start" />{labels.newDocument}</Button></header>
    {error?<p className="page-error" role="alert">{error}</p>:null}
    <ResizablePanelGroup className="documents-layout" orientation={isMobile?'vertical':'horizontal'}>
      <ResizablePanel defaultSize={isMobile?'180px':'270px'} minSize={isMobile?'140px':'220px'} maxSize={isMobile?'240px':'420px'}>
        <aside className="document-list" aria-label={labels.title} onContextMenu={event=>showMenu(event,{type:'root'})}>
          <div className="document-list-toolbar"><strong>{labels.root}</strong><span><Button size="icon-sm" variant="ghost" title={labels.newFolder} onClick={()=>setEditing({type:'folder',parentId:null})}><FolderPlus/></Button><Button size="icon-sm" variant="ghost" title={labels.refresh} onClick={()=>void refresh()} disabled={refreshing}><RefreshCw className={refreshing?'spin':''}/></Button></span></div>
          <ScrollArea className="document-tree-scroll">
            <div className="document-tree">
              {roots.map(folder=><FolderNode key={folder.id} folder={folder} folders={folders} items={items} expanded={expanded} selectedId={document?.id??null} en={en} onToggle={id=>setExpanded(current=>{const next=new Set(current);next.has(id)?next.delete(id):next.add(id);return next})} onOpen={id=>void open(id)} onPrefetch={id=>void open(id,{background:true})} onMenu={showMenu}/>) }
              {rootItems.map(item=><DocumentNode key={item.id} item={item} selected={item.id===document?.id} onOpen={id=>void open(id)} onPrefetch={id=>void open(id,{background:true})} onMenu={showMenu}/>) }
            </div>
            {!items.length&&!refreshing?<Empty><EmptyHeader><EmptyMedia variant="icon"><BookOpen /></EmptyMedia><EmptyTitle>{labels.empty}</EmptyTitle><EmptyDescription>{labels.emptyHint}</EmptyDescription></EmptyHeader></Empty>:null}
          </ScrollArea>
        </aside>
      </ResizablePanel>
      <ResizableHandle withHandle={!isMobile} />
      <ResizablePanel defaultSize={isMobile?'640px':'75%'} minSize={isMobile?'480px':'420px'}>
        {draft?<main className="document-workspace">
          <div className="document-meta">
            <Input aria-label={en?'Document title':'文档标题'} value={draft.title} onChange={event=>setDraft({...draft,title:event.target.value})} />
            <ChoiceSelect label={en?'Document type':'文档类型'} value={draft.kind} options={kinds.map(value=>({value,label:en?value:zhKind[value]}))} onChange={kind=>setDraft({...draft,kind})} />
            <ChoiceSelect label={en?'Project':'关联项目'} value={draft.projectId||'NONE'} options={[{value:'NONE',label:en?'Workspace-wide':'工作区级'},...projects.map(project=>({value:project.id,label:project.name}))]} onChange={projectId=>setDraft({...draft,projectId:projectId==='NONE'?null:projectId})} />
            <Button variant="outline" onClick={async()=>setHistory(await api.documentVersions(workspaceId,draft.id))}><History data-icon="inline-start" />v{draft.version}</Button>
            <Button disabled={busy||!draft.title.trim()||!hasChanges} onClick={()=>void save()}><Save data-icon="inline-start" />{busy?labels.saving:labels.save}</Button>
          </div>
          <Suspense fallback={<EditorSkeleton label={en?'Loading editor':'正在加载编辑器'} />}>
            <MarkdownEditor key={`${draft.id}-${document?.version}`} value={draft.content} onChange={content=>setDraft(current=>current?{...current,content}:current)} />
          </Suspense>
        </main>:<Card className="document-placeholder"><CardContent><BookOpen/><span>{labels.choose}</span></CardContent></Card>}
      </ResizablePanel>
    </ResizablePanelGroup>
    <CreateDocumentDialog open={Boolean(creating)} folderId={creating?.folderId??null} onOpenChange={open=>!open&&setCreating(null)} projects={projects} folders={folders} en={en} onCreate={create}/>
    <EditDialog action={editing} folders={folders} labels={labels} onClose={()=>setEditing(null)} onCreateFolder={createFolder} onRename={rename} onMove={moveDocument}/>
    <Dialog open={Boolean(history)} onOpenChange={open=>!open&&setHistory(null)}><DialogContent><DialogHeader><DialogTitle>{labels.history}</DialogTitle><DialogDescription>{labels.historyHint}</DialogDescription></DialogHeader><ScrollArea className="version-list">{history?.map(item=><Card size="sm" key={item.id}><CardContent><Clock3/><span><strong>v{item.version} · {item.title}</strong><small>{item.createdByName} · {new Date(item.createdAt).toLocaleString()}</small></span>{item.changeNote?<Badge variant="outline">{item.changeNote}</Badge>:null}</CardContent></Card>)}</ScrollArea></DialogContent></Dialog>
    {menu?<ContextMenu state={menu} labels={labels} onNewDocument={folderId=>{setMenu(null);setCreating({folderId})}} onNewFolder={parentId=>{setMenu(null);setEditing({type:'folder',parentId})}} onRename={target=>{setMenu(null);setEditing('parentId'in target?{type:'folder',folder:target}:{type:'rename-document',document:target})}} onDuplicate={target=>{setMenu(null);void duplicate(target)}} onMove={target=>{setMenu(null);setEditing({type:'move-document',document:target})}} onRemove={target=>{setMenu(null);void remove(target)}}/>:null}
  </section>
}

function EditorSkeleton({label}:{label:string}) {return <div className="document-editor-skeleton" aria-busy="true" aria-label={label}><div className="document-editor-skeleton-toolbar"><Skeleton/><Skeleton/><Skeleton/></div><div className="document-editor-skeleton-body"><Skeleton/><Skeleton/><Skeleton/><Skeleton/><Skeleton/></div></div>}

function DocumentNode({item,selected,onOpen,onPrefetch,onMenu}:{item:DocumentSummary;selected:boolean;onOpen:(id:string)=>void;onPrefetch:(id:string)=>void;onMenu:(event:ReactMouseEvent,target:MenuTarget)=>void}) {return <button className={`document-tree-row document-file ${selected?'active':''}`} onClick={()=>onOpen(item.id)} onMouseEnter={()=>onPrefetch(item.id)} onContextMenu={event=>onMenu(event,{type:'document',document:item})}><File/><span><strong>{item.title}</strong><small>{item.projectName||zhKind[item.kind]}</small></span><Badge variant="secondary">v{item.version}</Badge></button>}

function FolderNode({folder,folders,items,expanded,selectedId,en,onToggle,onOpen,onPrefetch,onMenu}:{folder:DocumentFolder;folders:DocumentFolder[];items:DocumentSummary[];expanded:Set<string>;selectedId:string|null;en:boolean;onToggle:(id:string)=>void;onOpen:(id:string)=>void;onPrefetch:(id:string)=>void;onMenu:(event:ReactMouseEvent,target:MenuTarget)=>void}) {const open=expanded.has(folder.id),children=folders.filter(item=>item.parentId===folder.id),documents=items.filter(item=>item.folderId===folder.id);return <div className="document-folder"><button className="document-tree-row folder-row" onClick={()=>onToggle(folder.id)} onContextMenu={event=>onMenu(event,{type:'folder',folder})}>{open?<ChevronDown/>:<ChevronRight/>}{open?<FolderOpen/>:<Folder/>}<strong>{folder.name}</strong><small>{children.length+documents.length}</small><MoreHorizontal aria-label={en?'Folder menu':'文件夹菜单'}/></button>{open?<div className="document-folder-children">{children.map(child=><FolderNode key={child.id} folder={child} folders={folders} items={items} expanded={expanded} selectedId={selectedId} en={en} onToggle={onToggle} onOpen={onOpen} onPrefetch={onPrefetch} onMenu={onMenu}/>)}{documents.map(item=><DocumentNode key={item.id} item={item} selected={item.id===selectedId} onOpen={onOpen} onPrefetch={onPrefetch} onMenu={onMenu}/>)}</div>:null}</div>}

function ContextMenu({state,labels,onNewDocument,onNewFolder,onRename,onDuplicate,onMove,onRemove}:{state:NonNullable<ContextState>;labels:Record<string,string>;onNewDocument:(folderId:string|null)=>void;onNewFolder:(parentId:string|null)=>void;onRename:(target:DocumentFolder|DocumentSummary)=>void;onDuplicate:(target:DocumentSummary)=>void;onMove:(target:DocumentSummary)=>void;onRemove:(target:DocumentFolder|DocumentSummary)=>void}) {const target=state.target,folderId=target.type==='folder'?target.folder.id:null;return <div className="document-context-menu" style={{left:state.x,top:state.y}} role="menu" onClick={event=>event.stopPropagation()}>{target.type!=='document'?<><button onClick={()=>onNewDocument(folderId)}><FilePlus2/>{labels.newDocument}</button><button onClick={()=>onNewFolder(folderId)}><FolderPlus/>{labels.newFolder}</button></>:null}{target.type!=='root'?<><hr/><button onClick={()=>onRename(target.type==='folder'?target.folder:target.document)}><Pencil/>{labels.rename}</button>{target.type==='document'?<><button onClick={()=>onDuplicate(target.document)}><Copy/>{labels.duplicate}</button><button onClick={()=>onMove(target.document)}><Move/>{labels.move}</button></>:null}<hr/><button className="destructive" onClick={()=>onRemove(target.type==='folder'?target.folder:target.document)}><Trash2/>{labels.remove}</button></>:null}</div>}

function EditDialog({action,folders,labels,onClose,onCreateFolder,onRename,onMove}:{action:EditAction;folders:DocumentFolder[];labels:Record<string,string>;onClose:()=>void;onCreateFolder:(name:string,parentId:string|null)=>Promise<void>;onRename:(target:DocumentFolder|DocumentSummary,name:string)=>Promise<void>;onMove:(target:DocumentSummary,folderId:string|null)=>Promise<void>}) {const [value,setValue]=useState(''),[busy,setBusy]=useState(false);useEffect(()=>{if(!action)return;setValue(action.type==='folder'&&action.folder?action.folder.name:action.type==='rename-document'?action.document.title:action.type==='move-document'?(action.document.folderId??'NONE'):'')},[action]);if(!action)return null;const title=action.type==='move-document'?labels.move:action.type==='folder'&&!action.folder?labels.newFolder:labels.rename;const submit=async(event:FormEvent)=>{event.preventDefault();setBusy(true);try{if(action.type==='move-document')await onMove(action.document,value==='NONE'?null:value);else if(action.type==='folder'&&!action.folder)await onCreateFolder(value,action.parentId??null);else await onRename(action.type==='folder'?action.folder!:action.document,value)}finally{setBusy(false)}};return <Dialog open onOpenChange={open=>!open&&onClose()}><DialogContent><form onSubmit={submit}><DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader><FieldGroup className="create-form">{action.type==='move-document'?<Field><FieldLabel>{labels.folder}</FieldLabel><ChoiceSelect label={labels.folder} value={value||'NONE'} options={[{value:'NONE',label:labels.rootFolder},...folders.map(folder=>({value:folder.id,label:folder.name}))]} onChange={setValue}/></Field>:<Field><FieldLabel>{action.type==='folder'?labels.folderName:labels.documentName}</FieldLabel><Input value={value} onChange={event=>setValue(event.target.value)} required autoFocus /></Field>}</FieldGroup><DialogFooter><Button type="button" variant="outline" onClick={onClose}>{labels.cancel}</Button><Button type="submit" disabled={busy||!value.trim()}>{action.type==='folder'&&!action.folder?labels.create:labels.apply}</Button></DialogFooter></form></DialogContent></Dialog>}

function CreateDocumentDialog({open,folderId,onOpenChange,projects,folders,en,onCreate}:{open:boolean;folderId:string|null;onOpenChange:(open:boolean)=>void;projects:Project[];folders:DocumentFolder[];en:boolean;onCreate:(input:{title:string;kind:DocumentKind;projectId:string|null;folderId:string|null})=>Promise<void>}) {const [kind,setKind]=useState<DocumentKind>('DESIGN'),[projectId,setProjectId]=useState('NONE'),[selectedFolder,setSelectedFolder]=useState(folderId??'NONE'),[busy,setBusy]=useState(false);useEffect(()=>setSelectedFolder(folderId??'NONE'),[folderId,open]);const submit=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();setBusy(true);try{await onCreate({title:String(new FormData(event.currentTarget).get('title')),kind,projectId:projectId==='NONE'?null:projectId,folderId:selectedFolder==='NONE'?null:selectedFolder})}finally{setBusy(false)}};return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><form onSubmit={submit}><DialogHeader><DialogTitle>{en?'New document':'新建设计文档'}</DialogTitle><DialogDescription>{en?'Choose its location and start writing.':'选择归属位置后开始编写内容。'}</DialogDescription></DialogHeader><FieldGroup className="create-form"><Field><FieldLabel>{en?'Title':'标题'}</FieldLabel><Input name="title" required autoFocus /></Field><Field><FieldLabel>{en?'Type':'类型'}</FieldLabel><ChoiceSelect label={en?'Type':'类型'} value={kind} options={kinds.map(value=>({value,label:en?value:zhKind[value]}))} onChange={setKind}/></Field><Field><FieldLabel>{en?'Folder':'文件夹'}</FieldLabel><ChoiceSelect label={en?'Folder':'文件夹'} value={selectedFolder} options={[{value:'NONE',label:en?'No folder':'根目录'},...folders.map(folder=>({value:folder.id,label:folder.name}))]} onChange={setSelectedFolder}/></Field><Field><FieldLabel>{en?'Project':'关联项目'}</FieldLabel><ChoiceSelect label={en?'Project':'关联项目'} value={projectId} options={[{value:'NONE',label:en?'Workspace-wide':'工作区级'},...projects.map(project=>({value:project.id,label:project.name}))]} onChange={setProjectId}/></Field></FieldGroup><DialogFooter><Button type="button" variant="outline" onClick={()=>onOpenChange(false)}>{en?'Cancel':'取消'}</Button><Button type="submit" disabled={busy}>{busy?(en?'Creating...':'创建中...'):(en?'Create':'创建')}</Button></DialogFooter></form></DialogContent></Dialog>}
