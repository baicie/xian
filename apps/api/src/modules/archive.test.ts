import { describe, expect, it } from 'vitest'
import { unzipSync, zipSync } from 'fflate'
import { createArchive, readArchive, type WorkspaceSnapshot } from './archive.js'

const snapshot:WorkspaceSnapshot={schemaVersion:1,workspace:{name:'测试空间'},members:[],projects:[],documents:[],plans:[]}

describe('闲序 archive',()=>{
  it('round-trips the authoritative snapshot',()=>expect(readArchive(createArchive(snapshot))).toEqual(snapshot))
  it('rejects a damaged archive',()=>{const files=unzipSync(createArchive(snapshot));files['data/workspace.json']![0]^=1;expect(()=>readArchive(zipSync(files))).toThrow('Checksum failed')})
})
