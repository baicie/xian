import { DocumentFolder, DocumentSummary, WorkspaceDocument } from '@/api'

type CachedWorkspace={items:DocumentSummary[];folders:DocumentFolder[];documents:Record<string,WorkspaceDocument>;selectedId:string|null;updatedAt:number}
const memory=new Map<string,CachedWorkspace>()
const pending=new Map<string,Promise<WorkspaceDocument>>()
const key=(workspaceId:string)=>`xian:documents:${workspaceId}`

export function readDocumentCache(workspaceId:string):CachedWorkspace|null {
  const current=memory.get(workspaceId)
  if(current)return current
  try {
    const value=JSON.parse(sessionStorage.getItem(key(workspaceId))||'null') as CachedWorkspace|null
    if(value){memory.set(workspaceId,value);return value}
  } catch { sessionStorage.removeItem(key(workspaceId)) }
  return null
}

export function writeDocumentCache(workspaceId:string,patch:Partial<CachedWorkspace>) {
  const current=readDocumentCache(workspaceId)??{items:[],folders:[],documents:{},selectedId:null,updatedAt:0}
  const documents={...current.documents,...patch.documents}
  const recent=Object.values(documents).sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt)).slice(0,12)
  const next:CachedWorkspace={...current,...patch,documents:Object.fromEntries(recent.map(item=>[item.id,item])),updatedAt:Date.now()}
  memory.set(workspaceId,next)
  try { sessionStorage.setItem(key(workspaceId),JSON.stringify(next)) } catch { /* Storage may be unavailable or full. */ }
  return next
}

export function removeCachedDocument(workspaceId:string,documentId:string) {
  const current=readDocumentCache(workspaceId)
  if(!current)return
  const documents={...current.documents};delete documents[documentId]
  const next={...current,documents,selectedId:current.selectedId===documentId?null:current.selectedId,updatedAt:Date.now()}
  memory.set(workspaceId,next)
  try { sessionStorage.setItem(key(workspaceId),JSON.stringify(next)) } catch { /* Storage may be unavailable or full. */ }
}

export function loadDocumentOnce(workspaceId:string,documentId:string,loader:()=>Promise<WorkspaceDocument>) {
  const cacheKey=`${workspaceId}:${documentId}`,existing=pending.get(cacheKey)
  if(existing)return existing
  const request=loader().finally(()=>pending.delete(cacheKey))
  pending.set(cacheKey,request)
  return request
}
