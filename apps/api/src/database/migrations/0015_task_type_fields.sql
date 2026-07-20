ALTER TABLE tasks
  ADD COLUMN type_fields jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_type_fields_object CHECK (jsonb_typeof(type_fields) = 'object');
