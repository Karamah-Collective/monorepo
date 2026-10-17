ALTER TABLE project_custom_fields ADD COLUMN required INTEGER NOT NULL DEFAULT 0;
ALTER TABLE project_custom_fields ADD COLUMN default_value TEXT;
ALTER TABLE project_custom_fields ADD COLUMN multiple INTEGER NOT NULL DEFAULT 0;
