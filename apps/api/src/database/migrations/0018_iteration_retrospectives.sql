CREATE TYPE iteration_retrospective_snapshot_state AS ENUM ('CAPTURED', 'PARTIAL');

CREATE TABLE iteration_retrospectives (
  iteration_id uuid PRIMARY KEY REFERENCES iterations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  snapshot_state iteration_retrospective_snapshot_state NOT NULL,
  scope_task_count integer NOT NULL CHECK (scope_task_count >= 0),
  completed_task_count integer NOT NULL CHECK (completed_task_count >= 0),
  carry_over_task_count integer NOT NULL CHECK (carry_over_task_count >= 0),
  overdue_task_count integer NOT NULL CHECK (overdue_task_count >= 0),
  open_bug_count integer NOT NULL CHECK (open_bug_count >= 0),
  blocked_task_count integer NOT NULL CHECK (blocked_task_count >= 0),
  summary text NOT NULL DEFAULT '',
  went_well text NOT NULL DEFAULT '',
  improvements text NOT NULL DEFAULT '',
  action_items text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (scope_task_count = completed_task_count + carry_over_task_count),
  CHECK (overdue_task_count <= carry_over_task_count),
  CHECK (open_bug_count <= carry_over_task_count),
  CHECK (blocked_task_count <= carry_over_task_count)
);

CREATE INDEX iteration_retrospectives_workspace_project_idx
  ON iteration_retrospectives(workspace_id, project_id, created_at DESC);
