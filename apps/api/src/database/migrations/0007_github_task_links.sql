CREATE TABLE github_task_links (
  workspace_id uuid NOT NULL REFERENCES github_integrations(workspace_id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  github_kind text NOT NULL CHECK (github_kind IN ('ISSUE','PR')),
  github_number integer NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  state text NOT NULL CHECK (state IN ('open','closed')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(task_id,github_kind,github_number)
);
CREATE INDEX github_task_links_workspace_idx ON github_task_links(workspace_id,task_id);
