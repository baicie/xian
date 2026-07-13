CREATE TABLE github_integrations (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id),
  owner text NOT NULL,
  repo text NOT NULL,
  token_ciphertext text NOT NULL,
  token_iv text NOT NULL,
  token_tag text NOT NULL,
  token_last4 char(4) NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE github_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES github_integrations(workspace_id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK(entity_type IN ('TASK','DOCUMENT')),
  entity_id uuid NOT NULL,
  github_number integer,
  github_path text,
  github_sha text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,entity_type,entity_id),
  UNIQUE(workspace_id,entity_type,github_number)
);

CREATE TABLE github_sync_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES github_integrations(workspace_id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK(entity_type='TASK'),
  entity_id uuid NOT NULL,
  remote_ref text NOT NULL,
  remote_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolution text
);
CREATE UNIQUE INDEX github_conflicts_open_idx ON github_sync_conflicts(workspace_id,entity_type,entity_id,remote_ref) WHERE resolved_at IS NULL;
