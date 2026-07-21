import { describe, expect, it } from 'vitest'
import { unzipSync, zipSync } from 'fflate'
import { createHash } from 'node:crypto'
import { createArchive, readArchive, type WorkspaceSnapshot } from './archive.js'

const snapshot:WorkspaceSnapshot={schemaVersion:4,workspace:{name:'测试空间'},members:[],projects:[],documents:[],plans:[],assets:[]}

describe('闲序 archive',()=>{
  it('round-trips the authoritative snapshot',()=>expect(readArchive(createArchive(snapshot))).toEqual(snapshot))
  it('rejects a damaged archive',()=>{const files=unzipSync(createArchive(snapshot));files['data/workspace.json']![0]^=1;expect(()=>readArchive(zipSync(files))).toThrow('Checksum failed')})
  it('round-trips image assets with checksum validation',()=>{const data=new Uint8Array([137,80,78,71,13,10,26,10]),sourceId='00000000-0000-4000-8000-000000000001',sha256=createHash('sha256').update(data).digest('hex'),withAsset:WorkspaceSnapshot={...snapshot,assets:[{sourceId,originalName:'proof.png',contentType:'image/png',sizeBytes:data.length,sha256}]};expect(readArchive(createArchive(withAsset,new Map([[sourceId,data]]))).assets).toEqual(withAsset.assets)})
  it('round-trips document assets and rejects spoofed metadata',()=>{const data=Buffer.from('%PDF-1.7\n%%EOF'),sourceId='00000000-0000-4000-8000-000000000002',sha256=createHash('sha256').update(data).digest('hex'),withDocument:WorkspaceSnapshot={...snapshot,schemaVersion:3,assets:[{sourceId,originalName:'architecture.pdf',contentType:'application/pdf',sizeBytes:data.length,sha256}]};expect(readArchive(createArchive(withDocument,new Map([[sourceId,data]]))).assets).toEqual(withDocument.assets);expect(()=>readArchive(createArchive({...withDocument,assets:[{...withDocument.assets[0]!,originalName:'architecture.docx'}]},new Map([[sourceId,data]])))).toThrow('type does not match')})
  it('round-trips workflow state semantics and transitions',()=>{
    const backlog='00000000-0000-4000-8000-000000000011',active='00000000-0000-4000-8000-000000000012'
    const withWorkflow:WorkspaceSnapshot={...snapshot,projects:[{sourceId:'00000000-0000-4000-8000-000000000010',name:'研发',code:'DEV',description:'',color:'#2367d1',archived:false,workflowTemplate:'SIMPLE',columns:[{sourceId:backlog,key:'BACKLOG',name:'待处理',color:'#84908b',stateType:'BACKLOG',position:1000},{sourceId:active,key:'ACTIVE',name:'进行中',color:'#2367d1',stateType:'ACTIVE',position:2000}],transitions:[{fromColumnSourceId:backlog,toColumnSourceId:active,name:'开始处理',bugName:'开始修复',requiresComment:false,position:1000}],tasks:[]}]}
    expect(readArchive(createArchive(withWorkflow)).projects[0]).toEqual(withWorkflow.projects[0])
  })
})
