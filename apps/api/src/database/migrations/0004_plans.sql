CREATE TYPE plan_status AS ENUM ('DRAFT','APPLIED');

CREATE TABLE plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id),
  title text NOT NULL,
  goal text NOT NULL,
  status plan_status NOT NULL DEFAULT 'DRAFT',
  source text NOT NULL DEFAULT 'WEB',
  version integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plans_workspace_updated_idx ON plans(workspace_id, updated_at DESC);

CREATE TABLE plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  position integer NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  kind task_kind NOT NULL DEFAULT 'TASK',
  priority task_priority NOT NULL DEFAULT 'MEDIUM',
  task_id uuid REFERENCES tasks(id),
  UNIQUE(plan_id, position),
  UNIQUE(task_id)
);
