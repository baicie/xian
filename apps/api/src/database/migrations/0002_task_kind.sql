CREATE TYPE task_kind AS ENUM ('TASK','STORY','BUG');
ALTER TABLE tasks ADD COLUMN kind task_kind NOT NULL DEFAULT 'TASK';
CREATE INDEX tasks_workspace_kind_idx ON tasks(workspace_id,kind) WHERE deleted_at IS NULL;
