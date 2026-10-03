ALTER TABLE weekly_report_settings
ADD COLUMN report_mode TEXT NOT NULL DEFAULT 'enabled'
CHECK (report_mode IN ('enabled','disabled','test'));

UPDATE weekly_report_settings
SET report_mode = CASE WHEN enabled = 1 THEN 'enabled' ELSE 'disabled' END
WHERE report_mode IS NULL OR report_mode = '';
