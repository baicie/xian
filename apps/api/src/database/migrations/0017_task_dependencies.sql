CREATE TABLE task_dependencies (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  blocker_task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  blocked_task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_task_id, blocked_task_id),
  CHECK (blocker_task_id <> blocked_task_id)
);

CREATE INDEX task_dependencies_blocked_idx
  ON task_dependencies(workspace_id, blocked_task_id, created_at);
CREATE INDEX task_dependencies_blocker_idx
  ON task_dependencies(workspace_id, blocker_task_id, created_at);
