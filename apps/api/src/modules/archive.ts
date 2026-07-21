import { createHash } from 'node:crypto'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { z } from 'zod'
import { ASSET_MAX_FILE_BYTES, ASSET_WORKSPACE_QUOTA_BYTES, detectAssetType, SUPPORTED_ASSET_CONTENT_TYPES } from './asset-types.js'
import { taskTypeFieldsSchema } from '../common/contracts.js'

const date=z.string()
const member=z.object({email:z.string().email(),name:z.string(),role:z.enum(['OWNER','ADMIN','MEMBER','VIEWER'])})
const comment=z.object({body:z.string(),authorEmail:z.string().email(),createdAt:date,status:z.enum(['OPEN','RESOLVED']).default('OPEN'),assetSourceIds:z.array(z.string().uuid()).default([])})
const checklist=z.object({title:z.string(),isDone:z.boolean(),position:z.number()})
const stateType=z.enum(['BACKLOG','ACTIVE','REVIEW','DONE'])
const task=z.object({sourceId:z.string().uuid(),columnSourceId:z.string().uuid(),number:z.number().int(),title:z.string(),description:z.string(),kind:z.enum(['TASK','STORY','BUG']),typeFields:taskTypeFieldsSchema.default(taskTypeFieldsSchema.parse({})),priority:z.enum(['HIGH','MEDIUM','LOW']),dueDate:z.string().nullable(),position:z.number(),version:z.number().int(),archived:z.boolean(),assigneeEmails:z.array(z.string().email()),labels:z.array(z.string()),checklist:z.array(checklist),comments:z.array(comment)})
const column=z.object({sourceId:z.string().uuid(),key:z.string().optional(),name:z.string(),color:z.string(),stateType:stateType.optional(),position:z.number()})
const transition=z.object({fromColumnSourceId:z.string().uuid(),toColumnSourceId:z.string().uuid(),name:z.string(),bugName:z.string(),requiresComment:z.boolean(),position:z.number()})
const project=z.object({sourceId:z.string().uuid(),name:z.string(),code:z.string(),description:z.string(),color:z.string(),archived:z.boolean(),workflowTemplate:z.enum(['SIMPLE','DELIVERY','RELEASE','CUSTOM']).optional(),columns:z.array(column),transitions:z.array(transition).optional(),tasks:z.array(task)})
const documentVersion=z.object({version:z.number().int(),title:z.string(),kind:z.enum(['ARCHITECTURE','REQUIREMENT','DESIGN','MEETING','RETROSPECTIVE']),status:z.enum(['DRAFT','PUBLISHED','ARCHIVED']),content:z.string(),changeNote:z.string(),createdAt:date})
const document=z.object({sourceId:z.string().uuid(),projectSourceId:z.string().uuid().nullable(),title:z.string(),kind:z.enum(['ARCHITECTURE','REQUIREMENT','DESIGN','MEETING','RETROSPECTIVE']),status:z.enum(['DRAFT','PUBLISHED','ARCHIVED']),content:z.string(),version:z.number().int(),versions:z.array(documentVersion)})
const planItem=z.object({position:z.number().int(),title:z.string(),description:z.string(),kind:z.enum(['TASK','STORY','BUG']),priority:z.enum(['HIGH','MEDIUM','LOW']),taskSourceId:z.string().uuid().nullable()})
const plan=z.object({sourceId:z.string().uuid(),projectSourceId:z.string().uuid(),title:z.string(),goal:z.string(),status:z.enum(['DRAFT','APPLIED']),source:z.string(),version:z.number().int(),items:z.array(planItem)})
const asset=z.object({sourceId:z.string().uuid(),originalName:z.string(),contentType:z.enum(SUPPORTED_ASSET_CONTENT_TYPES),sizeBytes:z.number().int().positive(),sha256:z.string().length(64)})
export const snapshotSchema=z.object({schemaVersion:z.union([z.literal(1),z.literal(2),z.literal(3),z.literal(4)]),workspace:z.object({name:z.string()}),members:z.array(member),projects:z.array(project),documents:z.array(document),plans:z.array(plan),assets:z.array(asset).default([])})
export type WorkspaceSnapshot=z.infer<typeof snapshotSchema>

type Manifest={format:'taskharbor';version:1;exportedAt:string;workspaceName:string;files:{path:string;sha256:string}[]}
const digest=(data:Uint8Array)=>createHash('sha256').update(data).digest('hex')
const csv=(rows:(string|number|null)[][])=>rows.map(row=>row.map(value=>{const text=String(value??'');return /[",\n]/.test(text)?`"${text.replaceAll('"','""')}"`:text}).join(',')).join('\n')
const safeName=(value:string)=>value.normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu,'-').replace(/^-+|-+$/g,'').slice(0,80)||'document'

export function createArchive(snapshot:WorkspaceSnapshot,assetFiles:Map<string,Uint8Array>=new Map()){
  const value=snapshotSchema.parse(snapshot),files:Record<string,Uint8Array>={}
  files['data/workspace.json']=strToU8(JSON.stringify(value,null,2))
  files['csv/projects.csv']=strToU8(csv([['code','name','description','archived'],...value.projects.map(project=>[project.code,project.name,project.description,String(project.archived)])]))
  files['csv/tasks.csv']=strToU8(csv([['project','number','type','priority','title','due_date','archived'],...value.projects.flatMap(project=>project.tasks.map(task=>[project.code,task.number,task.kind,task.priority,task.title,task.dueDate,String(task.archived)]))]))
  for(const document of value.documents)files[`documents/${safeName(document.title)}-${document.sourceId}.md`]=strToU8(document.content)
  for(const asset of value.assets){const data=assetFiles.get(asset.sourceId);if(!data)throw new Error(`Asset file is missing: ${asset.originalName}`);if(data.length!==asset.sizeBytes||digest(data)!==asset.sha256)throw new Error(`Asset checksum failed: ${asset.originalName}`);files[`assets/${asset.sourceId}`]=data}
  const manifest:Manifest={format:'taskharbor',version:1,exportedAt:new Date().toISOString(),workspaceName:value.workspace.name,files:Object.entries(files).map(([path,data])=>({path,sha256:digest(data)}))}
  files['manifest.json']=strToU8(JSON.stringify(manifest,null,2))
  return zipSync(files,{level:6})
}

export function readArchiveBundle(data:Uint8Array){
  if(data.length>300*1024*1024)throw new Error('Archive exceeds 300 MB')
  let total=0
  const files=unzipSync(data,{filter:file=>{total+=file.originalSize;if(file.originalSize>300*1024*1024||total>600*1024*1024)throw new Error('Archive expands beyond the safe limit');return true}})
  const paths=Object.keys(files)
  if(paths.length>5000||paths.some(path=>path.startsWith('/')||path.split('/').includes('..')))throw new Error('Archive contains unsafe paths')
  const manifestFile=files['manifest.json'];if(!manifestFile)throw new Error('Archive manifest is missing')
  const manifest=z.object({format:z.literal('taskharbor'),version:z.literal(1),files:z.array(z.object({path:z.string(),sha256:z.string().length(64)})).max(4999)}).parse(JSON.parse(strFromU8(manifestFile)))
  const expected=new Set(['manifest.json',...manifest.files.map(file=>file.path)])
  if(paths.some(path=>!expected.has(path))||expected.size!==paths.length)throw new Error('Archive file list does not match its manifest')
  for(const entry of manifest.files){const file=files[entry.path];if(!file||digest(file)!==entry.sha256)throw new Error(`Checksum failed: ${entry.path}`)}
  const snapshotFile=files['data/workspace.json'];if(!snapshotFile)throw new Error('Workspace snapshot is missing')
  const snapshot=snapshotSchema.parse(JSON.parse(strFromU8(snapshotFile))),assetFiles=new Map<string,Uint8Array>();let assetBytes=0
  for(const asset of snapshot.assets){const file=files[`assets/${asset.sourceId}`];if(!file||file.length!==asset.sizeBytes||digest(file)!==asset.sha256)throw new Error(`Asset file is invalid: ${asset.originalName}`);if(file.length>ASSET_MAX_FILE_BYTES)throw new Error(`Asset exceeds the per-file quota: ${asset.originalName}`);assetBytes+=file.length;if(assetBytes>ASSET_WORKSPACE_QUOTA_BYTES)throw new Error('Assets exceed the workspace quota');if(detectAssetType(asset.originalName,Buffer.from(file))!==asset.contentType)throw new Error(`Asset type does not match its content: ${asset.originalName}`);assetFiles.set(asset.sourceId,file)}
  return{snapshot,assetFiles}
}

export function readArchive(data:Uint8Array){return readArchiveBundle(data).snapshot}
