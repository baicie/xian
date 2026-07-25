import { describe, expect, it } from 'vitest'
import { unzipSync, zipSync } from 'fflate'
import { createHash } from 'node:crypto'
import { createArchive, readArchive, snapshotSchema, type WorkspaceSnapshot } from './archive.js'
import { taskTypeFieldsSchema } from '../common/contracts.js'

const snapshot: WorkspaceSnapshot = {
  schemaVersion: 4,
  workspace: { name: '测试空间' },
  members: [],
  projects: [],
  iterations: [],
  dependencies: [],
  documents: [],
  plans: [],
  assets: [],
}
const dependencySnapshot = (dependencies: WorkspaceSnapshot['dependencies']): WorkspaceSnapshot => {
  const projectSourceId = '00000000-0000-4000-8000-000000000030',
    columnSourceId = '00000000-0000-4000-8000-000000000033',
    makeTask = (sourceId: string, number: number, title: string) => ({
      sourceId,
      columnSourceId,
      iterationSourceId: null,
      number,
      title,
      description: '',
      kind: 'TASK' as const,
      typeFields: taskTypeFieldsSchema.parse({}),
      priority: 'MEDIUM' as const,
      dueDate: null,
      position: number * 1000,
      version: 1,
      archived: false,
      assigneeEmails: [],
      labels: [],
      checklist: [],
      comments: [],
    })
  const taskSourceIds = [
    ...new Set(
      dependencies.flatMap((dependency) => [
        dependency.blockerTaskSourceId,
        dependency.blockedTaskSourceId,
      ]),
    ),
  ]
  return {
    ...snapshot,
    schemaVersion: 6,
    projects: [
      {
        sourceId: projectSourceId,
        name: '依赖项目',
        code: 'DEPS',
        description: '',
        color: '#2367d1',
        archived: false,
        workflowTemplate: 'SIMPLE',
        columns: [
          {
            sourceId: columnSourceId,
            key: 'BACKLOG',
            name: '待处理',
            color: '#84908b',
            stateType: 'BACKLOG',
            position: 1000,
          },
        ],
        transitions: [],
        tasks: taskSourceIds.map((sourceId, index) =>
          makeTask(sourceId, index + 1, `依赖任务 ${index + 1}`),
        ),
      },
    ],
    dependencies,
  }
}

describe('闲序 archive', () => {
  it('round-trips the authoritative snapshot', () =>
    expect(readArchive(createArchive(snapshot))).toEqual(snapshot))
  it('rejects a damaged archive', () => {
    const files = unzipSync(createArchive(snapshot))
    files['data/workspace.json']![0] ^= 1
    expect(() => readArchive(zipSync(files))).toThrow('Checksum failed')
  })
  it('round-trips image assets with checksum validation', () => {
    const data = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      sourceId = '00000000-0000-4000-8000-000000000001',
      sha256 = createHash('sha256').update(data).digest('hex'),
      withAsset: WorkspaceSnapshot = {
        ...snapshot,
        assets: [
          {
            sourceId,
            originalName: 'proof.png',
            contentType: 'image/png',
            sizeBytes: data.length,
            sha256,
          },
        ],
      }
    expect(readArchive(createArchive(withAsset, new Map([[sourceId, data]]))).assets).toEqual(
      withAsset.assets,
    )
  })
  it('round-trips document assets and rejects spoofed metadata', () => {
    const data = Buffer.from('%PDF-1.7\n%%EOF'),
      sourceId = '00000000-0000-4000-8000-000000000002',
      sha256 = createHash('sha256').update(data).digest('hex'),
      withDocument: WorkspaceSnapshot = {
        ...snapshot,
        schemaVersion: 3,
        assets: [
          {
            sourceId,
            originalName: 'architecture.pdf',
            contentType: 'application/pdf',
            sizeBytes: data.length,
            sha256,
          },
        ],
      }
    expect(readArchive(createArchive(withDocument, new Map([[sourceId, data]]))).assets).toEqual(
      withDocument.assets,
    )
    expect(() =>
      readArchive(
        createArchive(
          {
            ...withDocument,
            assets: [{ ...withDocument.assets[0]!, originalName: 'architecture.docx' }],
          },
          new Map([[sourceId, data]]),
        ),
      ),
    ).toThrow('type does not match')
  })
  it('round-trips workflow state semantics and transitions', () => {
    const backlog = '00000000-0000-4000-8000-000000000011',
      active = '00000000-0000-4000-8000-000000000012'
    const withWorkflow: WorkspaceSnapshot = {
      ...snapshot,
      projects: [
        {
          sourceId: '00000000-0000-4000-8000-000000000010',
          name: '研发',
          code: 'DEV',
          description: '',
          color: '#2367d1',
          archived: false,
          workflowTemplate: 'SIMPLE',
          columns: [
            {
              sourceId: backlog,
              key: 'BACKLOG',
              name: '待处理',
              color: '#84908b',
              stateType: 'BACKLOG',
              position: 1000,
            },
            {
              sourceId: active,
              key: 'ACTIVE',
              name: '进行中',
              color: '#2367d1',
              stateType: 'ACTIVE',
              position: 2000,
            },
          ],
          transitions: [
            {
              fromColumnSourceId: backlog,
              toColumnSourceId: active,
              name: '开始处理',
              bugName: '开始修复',
              requiresComment: false,
              position: 1000,
            },
          ],
          tasks: [],
        },
      ],
    }
    expect(readArchive(createArchive(withWorkflow)).projects[0]).toEqual(withWorkflow.projects[0])
  })
  it('round-trips iterations and task assignments', () => {
    const projectSourceId = '00000000-0000-4000-8000-000000000020',
      iterationSourceId = '00000000-0000-4000-8000-000000000021'
    const withIteration: WorkspaceSnapshot = {
      ...snapshot,
      schemaVersion: 5,
      iterations: [
        {
          sourceId: iterationSourceId,
          projectSourceId,
          title: '七月迭代',
          goal: '交付登录体验',
          startDate: '2026-07-20',
          endDate: '2026-07-31',
          status: 'ACTIVE',
          version: 2,
          closedAt: null,
        },
      ],
      projects: [
        {
          sourceId: projectSourceId,
          name: '研发',
          code: 'DEV',
          description: '',
          color: '#2367d1',
          archived: false,
          workflowTemplate: 'SIMPLE',
          columns: [],
          transitions: [],
          tasks: [],
        },
      ],
    }
    expect(readArchive(createArchive(withIteration)).iterations).toEqual(withIteration.iterations)
  })
  it('round-trips task dependency references', () => {
    const withDependency = dependencySnapshot([
      {
        blockerTaskSourceId: '00000000-0000-4000-8000-000000000031',
        blockedTaskSourceId: '00000000-0000-4000-8000-000000000032',
      },
    ])
    expect(readArchive(createArchive(withDependency)).dependencies).toEqual(
      withDependency.dependencies,
    )
  })
  it('rejects self, duplicate, and cyclic task dependencies', () => {
    const first = '00000000-0000-4000-8000-000000000031',
      second = '00000000-0000-4000-8000-000000000032'
    expect(() =>
      createArchive(
        dependencySnapshot([{ blockerTaskSourceId: first, blockedTaskSourceId: first }]),
      ),
    ).toThrow('cannot block itself')
    expect(() =>
      createArchive(
        dependencySnapshot([
          { blockerTaskSourceId: first, blockedTaskSourceId: second },
          { blockerTaskSourceId: first, blockedTaskSourceId: second },
        ]),
      ),
    ).toThrow('must be unique')
    expect(() =>
      createArchive(
        dependencySnapshot([
          { blockerTaskSourceId: first, blockedTaskSourceId: second },
          { blockerTaskSourceId: second, blockedTaskSourceId: first },
        ]),
      ),
    ).toThrow('cannot contain a cycle')
  })
  it('validates long dependency chains without recursive graph traversal', () => {
    const taskIds = Array.from(
        { length: 6000 },
        (_, index) => `00000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`,
      ),
      dependencies = taskIds.slice(1).map((blockedTaskSourceId, index) => ({
        blockerTaskSourceId: taskIds[index]!,
        blockedTaskSourceId,
      }))

    expect(() => snapshotSchema.parse(dependencySnapshot(dependencies))).not.toThrow()
  })
})
