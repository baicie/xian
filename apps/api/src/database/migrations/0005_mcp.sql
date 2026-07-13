CREATE TABLE mcp_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  token_hash char(64) NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT ARRAY['READ'],
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (scopes <@ ARRAY['READ','WRITE']::text[])
);
CREATE INDEX mcp_tokens_workspace_idx ON mcp_tokens(workspace_id, created_at DESC);
