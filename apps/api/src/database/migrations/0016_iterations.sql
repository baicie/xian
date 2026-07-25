CREATE TYPE iteration_status AS ENUM ('PLANNED','ACTIVE','CLOSED');

CREATE TABLE iterations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  goal text NOT NULL DEFAULT '',
  start_date date NOT NULL,
  end_date date NOT NULL,
  status iteration_status NOT NULL DEFAULT 'PLANNED',
  version integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL REFERENCES users(id),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (start_date <= end_date)
);

CREATE UNIQUE INDEX iterations_one_active_per_project_idx
  ON iterations(project_id) WHERE status='ACTIVE';
CREATE INDEX iterations_workspace_project_status_idx
  ON iterations(workspace_id,project_id,status,created_at DESC);

ALTER TABLE tasks
  ADD COLUMN iteration_id uuid REFERENCES iterations(id) ON DELETE SET NULL;
CREATE INDEX tasks_iteration_idx
  ON tasks(iteration_id) WHERE deleted_at IS NULL;
