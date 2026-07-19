ALTER TABLE github_integrations
  ADD COLUMN sync_tasks boolean NOT NULL DEFAULT true,
  ADD COLUMN sync_documents boolean NOT NULL DEFAULT true,
  ADD COLUMN pull_issues boolean NOT NULL DEFAULT true;
