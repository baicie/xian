import type { TaskKind } from './board'

export type BugSeverity='BLOCKER'|'CRITICAL'|'MAJOR'|'MINOR'

export type TaskTypeFields={
  workContent:string
  completionCriteria:string
  userStory:string
  background:string
  acceptanceCriteria:string
  businessValue:string
  reproductionSteps:string
  expectedResult:string
  actualResult:string
  environment:string
  severity:BugSeverity
  affectedVersion:string
}

export function createTaskTypeFields():TaskTypeFields{
  return{
    workContent:'',completionCriteria:'',userStory:'',background:'',acceptanceCriteria:'',businessValue:'',
    reproductionSteps:'',expectedResult:'',actualResult:'',environment:'',severity:'MAJOR',affectedVersion:'',
  }
}

const fieldKeys={
  TASK:['workContent','completionCriteria'],
  STORY:['userStory','background','acceptanceCriteria','businessValue'],
  BUG:['reproductionSteps','expectedResult','actualResult','environment','severity','affectedVersion'],
} as const satisfies Record<TaskKind,readonly (keyof TaskTypeFields)[]>

export function taskTypeFieldKeys(kind:TaskKind):readonly (keyof TaskTypeFields)[]{
  return fieldKeys[kind]
}
