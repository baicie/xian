ALTER TABLE projects ADD COLUMN workflow_template text NOT NULL DEFAULT 'DELIVERY'
  CHECK (workflow_template IN ('SIMPLE','DELIVERY','RELEASE','CUSTOM'));

ALTER TABLE board_columns ADD COLUMN key text;
ALTER TABLE board_columns ADD COLUMN state_type text CHECK (state_type IN ('BACKLOG','ACTIVE','REVIEW','DONE'));

WITH ranked AS (
  SELECT id,row_number() OVER(PARTITION BY project_id ORDER BY position,id) AS rank,
    count(*) OVER(PARTITION BY project_id) AS total FROM board_columns
)
UPDATE board_columns c SET
  state_type=CASE WHEN r.rank=1 THEN 'BACKLOG' WHEN r.rank=r.total THEN 'DONE' WHEN r.rank=r.total-1 THEN 'REVIEW' ELSE 'ACTIVE' END,
  key=CASE WHEN r.rank=1 THEN 'BACKLOG' WHEN r.rank=r.total THEN 'DONE' WHEN r.rank=r.total-1 THEN 'REVIEW' WHEN r.rank=2 THEN 'ACTIVE' ELSE 'ACTIVE_'||r.rank END
FROM ranked r WHERE r.id=c.id;

ALTER TABLE board_columns ALTER COLUMN key SET NOT NULL;
ALTER TABLE board_columns ALTER COLUMN state_type SET NOT NULL;
ALTER TABLE board_columns ADD CONSTRAINT board_columns_project_key_unique UNIQUE(project_id,key);

CREATE TABLE workflow_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_column_id uuid NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
  to_column_id uuid NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
  name text NOT NULL, bug_name text NOT NULL, requires_comment boolean NOT NULL DEFAULT false,
  position numeric NOT NULL DEFAULT 1000, UNIQUE(project_id,from_column_id,to_column_id),
  CHECK(from_column_id<>to_column_id)
);

WITH ordered AS (
  SELECT id,workspace_id,project_id,state_type,
    lead(id) OVER(PARTITION BY project_id ORDER BY position,id) AS next_id,
    row_number() OVER(PARTITION BY project_id ORDER BY position,id) AS rank
  FROM board_columns
)
INSERT INTO workflow_transitions(workspace_id,project_id,from_column_id,to_column_id,name,bug_name,requires_comment,position)
SELECT workspace_id,project_id,id,next_id,
  CASE state_type WHEN 'BACKLOG' THEN '开始开发' WHEN 'ACTIVE' THEN '提交测试' WHEN 'REVIEW' THEN '验收通过' ELSE '流转' END,
  CASE state_type WHEN 'BACKLOG' THEN '开始修复' WHEN 'ACTIVE' THEN '修复完成并提测' WHEN 'REVIEW' THEN '验证通过' ELSE '流转' END,
  false,rank*1000 FROM ordered WHERE next_id IS NOT NULL;

WITH ordered AS (
  SELECT id,workspace_id,project_id,position,
    lag(id) OVER(PARTITION BY project_id ORDER BY position,id) AS previous_id FROM board_columns
)
INSERT INTO workflow_transitions(workspace_id,project_id,from_column_id,to_column_id,name,bug_name,requires_comment,position)
SELECT o.workspace_id,o.project_id,o.id,o.previous_id,'驳回修改','验证失败',true,o.position+500
FROM ordered o JOIN board_columns c ON c.id=o.id WHERE c.state_type='REVIEW' AND o.previous_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE TABLE task_transition_events (
  id bigserial PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, actor_id uuid NOT NULL REFERENCES users(id),
  from_column_id uuid NOT NULL REFERENCES board_columns(id), to_column_id uuid NOT NULL REFERENCES board_columns(id),
  action_name text NOT NULL, comment text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_transition_events_task_idx ON task_transition_events(task_id,created_at DESC);
