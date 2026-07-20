CREATE TABLE document_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES document_folders(id) ON DELETE SET NULL,
  name text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, parent_id, name)
);

CREATE INDEX document_folders_workspace_parent_idx ON document_folders(workspace_id, parent_id, name);

ALTER TABLE documents
  ADD COLUMN folder_id uuid REFERENCES document_folders(id) ON DELETE SET NULL;

CREATE INDEX documents_workspace_folder_idx ON documents(workspace_id, folder_id, updated_at DESC);
