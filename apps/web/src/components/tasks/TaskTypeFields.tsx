import type { TaskKind } from '@/models/board'
import type { BugSeverity, TaskTypeFields } from '@/models/taskFields'
import ChoiceSelect from '@/components/ChoiceSelect'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

type Props = {
  kind: TaskKind
  value: TaskTypeFields
  en: boolean
  onChange: (value: TaskTypeFields) => void
}

const labels = {
  zh: {
    heading: { TASK: '任务信息', STORY: '需求信息', BUG: '缺陷信息' },
    workContent: '工作内容',
    completionCriteria: '完成标准',
    userStory: '用户故事',
    background: '需求背景',
    acceptanceCriteria: '验收标准',
    businessValue: '业务价值',
    reproductionSteps: '复现步骤',
    expectedResult: '预期结果',
    actualResult: '实际结果',
    environment: '运行环境',
    severity: '严重程度',
    affectedVersion: '影响版本',
    severityOptions: { BLOCKER: '阻断', CRITICAL: '严重', MAJOR: '主要', MINOR: '次要' },
  },
  en: {
    heading: { TASK: 'Task information', STORY: 'Story information', BUG: 'Bug information' },
    workContent: 'Work content',
    completionCriteria: 'Completion criteria',
    userStory: 'User story',
    background: 'Background',
    acceptanceCriteria: 'Acceptance criteria',
    businessValue: 'Business value',
    reproductionSteps: 'Reproduction steps',
    expectedResult: 'Expected result',
    actualResult: 'Actual result',
    environment: 'Environment',
    severity: 'Severity',
    affectedVersion: 'Affected version',
    severityOptions: { BLOCKER: 'Blocker', CRITICAL: 'Critical', MAJOR: 'Major', MINOR: 'Minor' },
  },
} as const

export default function TaskTypeFieldsEditor({ kind, value, en, onChange }: Props) {
  const text = en ? labels.en : labels.zh
  const set = (key: keyof TaskTypeFields, next: string) => onChange({ ...value, [key]: next })
  const textarea = (key: keyof TaskTypeFields, rows: number, required = false) => (
    <Field key={key}>
      <FieldLabel htmlFor={`task-type-${key}`}>
        {text[key]}
        {required ? ' *' : ''}
      </FieldLabel>
      <Textarea
        id={`task-type-${key}`}
        rows={rows}
        required={required}
        value={String(value[key])}
        onChange={(event) => set(key, event.target.value)}
      />
    </Field>
  )

  return (
    <section className="task-type-fields" aria-labelledby="task-type-fields-heading">
      <h3 id="task-type-fields-heading">{text.heading[kind]}</h3>
      <FieldGroup>
        {kind === 'TASK' ? (
          <>
            {textarea('workContent', 3)}
            {textarea('completionCriteria', 3)}
          </>
        ) : null}
        {kind === 'STORY' ? (
          <>
            {textarea('userStory', 3)}
            {textarea('background', 3)}
            {textarea('acceptanceCriteria', 4)}
            {textarea('businessValue', 3)}
          </>
        ) : null}
        {kind === 'BUG' ? (
          <>
            {textarea('reproductionSteps', 4, true)}
            {textarea('expectedResult', 3, true)}
            {textarea('actualResult', 3, true)}
            <div className="task-type-fields-grid">
              <Field>
                <FieldLabel htmlFor="task-type-environment">{text.environment}</FieldLabel>
                <Input
                  id="task-type-environment"
                  value={value.environment}
                  onChange={(event) => set('environment', event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel>{text.severity}</FieldLabel>
                <ChoiceSelect
                  label={text.severity}
                  value={value.severity}
                  options={(Object.keys(text.severityOptions) as BugSeverity[]).map((severity) => ({
                    value: severity,
                    label: text.severityOptions[severity],
                  }))}
                  onChange={(severity) => onChange({ ...value, severity })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="task-type-affectedVersion">{text.affectedVersion}</FieldLabel>
                <Input
                  id="task-type-affectedVersion"
                  value={value.affectedVersion}
                  onChange={(event) => set('affectedVersion', event.target.value)}
                />
              </Field>
            </div>
          </>
        ) : null}
      </FieldGroup>
    </section>
  )
}
