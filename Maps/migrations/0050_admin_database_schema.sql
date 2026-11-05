-- Unified Admin database schema.
--
-- Apply this file only to karamah-admin-db (and its preview database). The
-- Manarah database remains the source of truth for map data. This migration
-- deliberately creates the final shapes used by Website, Links, Forms,
-- Inbox, access control, MCP, reporting, audit, and Operations.

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  created_at_epoch INTEGER NOT NULL,
  action TEXT NOT NULL,
  actor_uid TEXT NOT NULL DEFAULT '',
  actor_email TEXT NOT NULL DEFAULT '',
  actor_name TEXT NOT NULL DEFAULT '',
  target_id TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  success INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_uid ON audit_log(actor_uid);

CREATE TABLE IF NOT EXISTS admin_roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT NOT NULL DEFAULT '',
  permissions TEXT NOT NULL DEFAULT '[]',
  is_preset INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS admin_role_members (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  role_id TEXT NOT NULL REFERENCES admin_roles(id) ON DELETE RESTRICT,
  display_name TEXT NOT NULL DEFAULT '',
  added_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS admin_role_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  default_role_id TEXT NOT NULL REFERENCES admin_roles(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS admin_access_requests (
  id TEXT PRIMARY KEY,
  requester_email TEXT NOT NULL COLLATE NOCASE,
  requested_permission TEXT NOT NULL,
  admin_email TEXT NOT NULL COLLATE NOCASE,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_admin_access_requests_admin_status
  ON admin_access_requests(admin_email, status, created_at DESC);

INSERT OR IGNORE INTO admin_roles (id, name, description, permissions, is_preset) VALUES
  ('administrator', 'Administrator', 'Full access, including access management.', '["*"]', 1),
  ('map-editor', 'Map editor', 'Manage maps, places, events and map configuration.', '["maps.*","operations.tasks.read","operations.tasks.write","operations.tasks.assign"]', 1),
  ('content-editor', 'Content editor', 'Manage website, link hub and forms content.', '["website.*","links.*","forms.*","reports.write","operations.tasks.read","operations.tasks.write","operations.tasks.assign"]', 1),
  ('moderator', 'Moderator', 'Review community submissions, reviews, wishes and inbox.', '["moderation.*","inbox.*","operations.tasks.read","operations.tasks.write","operations.tasks.assign"]', 1),
  ('viewer', 'Viewer', 'View the workspace without making changes.', '["operations.tasks.read"]', 1),
  ('contact-agent', 'Contact mailbox agent', 'Manage shared mailboxes without access to personal Gmail.', '["inbox.contact.read","inbox.contact.write","inbox.manarah.read","inbox.manarah.write"]', 0);
INSERT OR IGNORE INTO admin_role_settings (id, default_role_id) VALUES (1, 'viewer');
INSERT OR IGNORE INTO admin_role_members (email, role_id, display_name, added_by)
VALUES ('moontasir@karamahcollective.com', 'administrator', 'Moontasir', 'initial setup');
INSERT OR IGNORE INTO admin_role_members (email, role_id, display_name, added_by)
VALUES ('hafsa@karamahcollective.com', 'contact-agent', 'Hafsa', 'initial setup');

CREATE TABLE IF NOT EXISTS member_profiles (
  user_id TEXT PRIMARY KEY,
  account_email TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  private_data TEXT NOT NULL DEFAULT '{}',
  public_fields TEXT NOT NULL DEFAULT '[]',
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_member_profiles_order ON member_profiles(display_order, updated_at);

CREATE TABLE IF NOT EXISTS website_people (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  position TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'inactive' CHECK(status IN ('active', 'inactive')),
  description TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_website_people_public ON website_people(status, display_order, name);
CREATE TABLE IF NOT EXISTS website_content (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  content TEXT NOT NULL DEFAULT '{}',
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT ''
);
INSERT OR IGNORE INTO website_content (id) VALUES (1);
CREATE TABLE IF NOT EXISTS website_subscribers (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL DEFAULT '',
  recaptcha_score TEXT NOT NULL DEFAULT '',
  subscribed_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'subscribed' CHECK(status IN ('subscribed', 'unsubscribed')),
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_website_subscribers_status ON website_subscribers(status, subscribed_at DESC);
CREATE TABLE IF NOT EXISTS website_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_email TEXT NOT NULL DEFAULT '',
  actor_name TEXT NOT NULL DEFAULT '',
  target_id TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_website_audit_created_at ON website_audit(created_at DESC);

CREATE TABLE IF NOT EXISTS link_hub_settings (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  profile_name TEXT NOT NULL DEFAULT 'Karamah Collective',
  profile_bio TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  background_color TEXT NOT NULL DEFAULT '#f4f3ee',
  surface_color TEXT NOT NULL DEFAULT '#ffffff',
  text_color TEXT NOT NULL DEFAULT '#202923',
  accent_color TEXT NOT NULL DEFAULT '#2b745c',
  theme TEXT NOT NULL DEFAULT 'light' CHECK(theme IN ('light', 'dark', 'system')),
  card_style TEXT NOT NULL DEFAULT 'soft' CHECK(card_style IN ('soft', 'outline', 'solid')),
  corner_style TEXT NOT NULL DEFAULT 'rounded' CHECK(corner_style IN ('compact', 'rounded', 'pill')),
  layout TEXT NOT NULL DEFAULT 'stack' CHECK(layout IN ('stack', 'grid')),
  max_width INTEGER NOT NULL DEFAULT 680 CHECK(max_width BETWEEN 480 AND 1100),
  show_descriptions INTEGER NOT NULL DEFAULT 1 CHECK(show_descriptions IN (0, 1)),
  show_domains INTEGER NOT NULL DEFAULT 1 CHECK(show_domains IN (0, 1)),
  show_share INTEGER NOT NULL DEFAULT 1 CHECK(show_share IN (0, 1)),
  footer_text TEXT NOT NULL DEFAULT '',
  seo_title TEXT NOT NULL DEFAULT 'Karamah Collective — Links',
  seo_description TEXT NOT NULL DEFAULT 'Karamah Collective links.',
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT '',
  page_kicker TEXT NOT NULL DEFAULT '',
  links_kicker TEXT NOT NULL DEFAULT '',
  links_heading TEXT NOT NULL DEFAULT '',
  links_description TEXT NOT NULL DEFAULT '',
  count_suffix TEXT NOT NULL DEFAULT '',
  featured_label TEXT NOT NULL DEFAULT 'Featured',
  share_page_label TEXT NOT NULL DEFAULT 'Share this page',
  share_link_label TEXT NOT NULL DEFAULT 'Share',
  copy_success_text TEXT NOT NULL DEFAULT 'Link copied',
  footer_link_label TEXT NOT NULL DEFAULT '',
  footer_link_url TEXT NOT NULL DEFAULT 'https://karamahcollective.com',
  empty_title TEXT NOT NULL DEFAULT 'Nothing published yet',
  empty_description TEXT NOT NULL DEFAULT 'The next Karamah destination will appear here soon.',
  error_title TEXT NOT NULL DEFAULT 'The directory is taking a pause',
  error_description TEXT NOT NULL DEFAULT 'We could not load these links just now.',
  retry_label TEXT NOT NULL DEFAULT 'Try again',
  background_style TEXT NOT NULL DEFAULT 'paper' CHECK(background_style IN ('paper', 'mist', 'plain')),
  image_style TEXT NOT NULL DEFAULT 'cover' CHECK(image_style IN ('cover', 'contain')),
  socials_kicker TEXT NOT NULL DEFAULT '',
  socials_heading TEXT NOT NULL DEFAULT '',
  socials_description TEXT NOT NULL DEFAULT ''
);
INSERT OR IGNORE INTO link_hub_settings (id) VALUES (1);
CREATE TABLE IF NOT EXISTS link_hub_links (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  metadata_title TEXT NOT NULL DEFAULT '',
  metadata_description TEXT NOT NULL DEFAULT '',
  metadata_image_url TEXT NOT NULL DEFAULT '',
  site_name TEXT NOT NULL DEFAULT '',
  favicon_url TEXT NOT NULL DEFAULT '',
  metadata_status TEXT NOT NULL DEFAULT 'pending' CHECK(metadata_status IN ('pending', 'ready', 'error')),
  metadata_error TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
  featured INTEGER NOT NULL DEFAULT 0 CHECK(featured IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  custom_site_name TEXT NOT NULL DEFAULT '',
  custom_favicon_url TEXT NOT NULL DEFAULT '',
  link_kind TEXT NOT NULL DEFAULT 'link' CHECK(link_kind IN ('link', 'social')),
  social_platform TEXT NOT NULL DEFAULT '',
  social_handle TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_link_hub_public ON link_hub_links(active, sort_order, created_at);
CREATE INDEX IF NOT EXISTS idx_link_hub_kind_public ON link_hub_links(link_kind, active, sort_order, created_at);

CREATE TABLE IF NOT EXISTS forms (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  share_code TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','closed','archived','deleted')),
  draft_schema_json TEXT NOT NULL,
  draft_revision INTEGER NOT NULL DEFAULT 0,
  active_version_id TEXT,
  owner_email TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  deleted_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_forms_share_code ON forms(share_code);
CREATE TABLE IF NOT EXISTS form_versions (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  schema_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  published_at TEXT NOT NULL,
  UNIQUE(form_id, version_number)
);
CREATE TABLE IF NOT EXISTS form_submissions (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  form_version_id TEXT NOT NULL REFERENCES form_versions(id),
  respondent_uid TEXT,
  respondent_email TEXT,
  submitted_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'valid',
  idempotency_key TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(form_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS form_answers (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES form_submissions(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  answer_type TEXT NOT NULL,
  value_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS form_files (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  submission_id TEXT REFERENCES form_submissions(id) ON DELETE CASCADE,
  question_id TEXT,
  upload_token TEXT NOT NULL UNIQUE,
  r2_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS form_assets (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  asset_kind TEXT NOT NULL CHECK (asset_kind IN ('cover','content','question')),
  r2_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  alt_text TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS form_share_code_aliases (
  code TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS form_collaborators (
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE,
  added_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (form_id, email)
);
CREATE INDEX IF NOT EXISTS idx_forms_status_updated ON forms(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_versions_form ON form_versions(form_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_form_submissions_form_time ON form_submissions(form_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_submissions_uid ON form_submissions(form_id, respondent_uid);
CREATE INDEX IF NOT EXISTS idx_form_answers_submission ON form_answers(submission_id);
CREATE INDEX IF NOT EXISTS idx_form_answers_question ON form_answers(question_id);
CREATE INDEX IF NOT EXISTS idx_form_files_submission ON form_files(submission_id);
CREATE INDEX IF NOT EXISTS idx_form_assets_form ON form_assets(form_id);
CREATE INDEX IF NOT EXISTS idx_form_share_code_aliases_form ON form_share_code_aliases(form_id);
CREATE INDEX IF NOT EXISTS idx_form_collaborators_email ON form_collaborators(email, form_id);

CREATE TABLE IF NOT EXISTS analytics_cache (
  cache_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS analytics_daily_snapshots (
  snapshot_date TEXT NOT NULL,
  provider TEXT NOT NULL,
  metric TEXT NOT NULL,
  value REAL NOT NULL DEFAULT 0,
  detail TEXT NOT NULL DEFAULT '{}',
  captured_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(snapshot_date, provider, metric)
);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_snapshots_range ON analytics_daily_snapshots(provider, snapshot_date DESC);

CREATE TABLE IF NOT EXISTS inbox_threads (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL DEFAULT '',
  participant_email TEXT NOT NULL DEFAULT '',
  participant_name TEXT NOT NULL DEFAULT '',
  mailbox TEXT NOT NULL DEFAULT 'contact@karamahcollective.com',
  source TEXT NOT NULL DEFAULT 'email',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
  unread_count INTEGER NOT NULL DEFAULT 0,
  last_message_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  provider_thread_id TEXT NOT NULL DEFAULT '',
  starred INTEGER NOT NULL DEFAULT 0,
  snoozed_until TEXT NOT NULL DEFAULT '',
  assigned_to TEXT NOT NULL DEFAULT '',
  assigned_name TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_updated ON inbox_threads(status,last_message_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_threads_provider_thread ON inbox_threads(provider_thread_id) WHERE provider_thread_id <> '';
CREATE INDEX IF NOT EXISTS idx_inbox_threads_snoozed ON inbox_threads(snoozed_until);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_assignment ON inbox_threads(assigned_to);
CREATE TABLE IF NOT EXISTS inbox_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES inbox_threads(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK(direction IN ('inbound','outbound')),
  sender_email TEXT NOT NULL DEFAULT '',
  sender_name TEXT NOT NULL DEFAULT '',
  recipient_email TEXT NOT NULL DEFAULT '',
  html_body TEXT NOT NULL DEFAULT '',
  text_body TEXT NOT NULL DEFAULT '',
  provider_message_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  message_kind TEXT NOT NULL DEFAULT 'email',
  attachments_json TEXT NOT NULL DEFAULT '[]',
  sender_admin_email TEXT NOT NULL DEFAULT '',
  sender_admin_name TEXT NOT NULL DEFAULT '',
  labels_json TEXT NOT NULL DEFAULT '[]'
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_messages_provider_id ON inbox_messages(provider_message_id) WHERE provider_message_id <> '';
CREATE INDEX IF NOT EXISTS idx_inbox_messages_thread ON inbox_messages(thread_id,created_at);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_kind ON inbox_messages(thread_id,message_kind,created_at);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_admin_actor ON inbox_messages(sender_admin_email, created_at);
CREATE TABLE IF NOT EXISTS inbox_typing_presence (
  thread_id TEXT NOT NULL,
  admin_email TEXT NOT NULL COLLATE NOCASE,
  admin_name TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (thread_id, admin_email)
);
CREATE INDEX IF NOT EXISTS idx_inbox_typing_presence_expiry ON inbox_typing_presence(thread_id, updated_at);

CREATE TABLE IF NOT EXISTS gmail_connections (
  mailbox TEXT PRIMARY KEY,
  account_email TEXT NOT NULL,
  refresh_token_ciphertext TEXT NOT NULL,
  scope_json TEXT NOT NULL DEFAULT '[]',
  connected_by TEXT NOT NULL DEFAULT '',
  connected_at TEXT NOT NULL,
  last_sync_at TEXT,
  updated_at TEXT NOT NULL,
  watch_history_id TEXT NOT NULL DEFAULT '',
  watch_expiration INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS gmail_oauth_states (
  state TEXT PRIMARY KEY,
  actor_email TEXT NOT NULL,
  return_to TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  mailbox TEXT NOT NULL DEFAULT 'manarah@karamahcollective.com'
);
CREATE INDEX IF NOT EXISTS idx_gmail_oauth_states_expiry ON gmail_oauth_states(expires_at);
CREATE TABLE IF NOT EXISTS personal_gmail_connections (
  owner_uid TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  account_email TEXT NOT NULL UNIQUE,
  refresh_token_ciphertext TEXT NOT NULL,
  scope_json TEXT NOT NULL DEFAULT '[]',
  connected_at TEXT NOT NULL,
  last_sync_at TEXT,
  updated_at TEXT NOT NULL,
  watch_history_id TEXT NOT NULL DEFAULT '',
  watch_expiration INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS personal_gmail_oauth_states (
  state TEXT PRIMARY KEY,
  owner_uid TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  return_to TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_personal_gmail_oauth_states_expiry ON personal_gmail_oauth_states(expires_at);
CREATE INDEX IF NOT EXISTS idx_gmail_connections_watch_expiration ON gmail_connections(watch_expiration);
CREATE INDEX IF NOT EXISTS idx_personal_gmail_watch_expiration ON personal_gmail_connections(watch_expiration);

CREATE TABLE IF NOT EXISTS weekly_report_subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'subscribed' CHECK (status IN ('subscribed','unsubscribed')),
  unsubscribe_token TEXT NOT NULL UNIQUE,
  added_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  unsubscribed_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_report_subscribers_email ON weekly_report_subscribers(lower(email));
CREATE INDEX IF NOT EXISTS idx_weekly_report_subscribers_status ON weekly_report_subscribers(status, updated_at DESC);
CREATE TABLE IF NOT EXISTS weekly_report_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 1,
  report_mode TEXT NOT NULL DEFAULT 'enabled' CHECK (report_mode IN ('enabled','disabled','test')),
  frequency TEXT NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('weekly','biweekly','monthly')),
  day_of_week INTEGER NOT NULL DEFAULT 6 CHECK (day_of_week BETWEEN 0 AND 6),
  day_of_month INTEGER NOT NULL DEFAULT 1 CHECK (day_of_month BETWEEN 1 AND 31),
  send_time TEXT NOT NULL DEFAULT '09:00',
  timezone TEXT NOT NULL DEFAULT 'Europe/Helsinki',
  subject_prefix TEXT NOT NULL DEFAULT 'Manarah weekly report',
  visual_density TEXT NOT NULL DEFAULT 'standard' CHECK (visual_density IN ('standard','compact')),
  accent_color TEXT NOT NULL DEFAULT '#08705b',
  include_analytics INTEGER NOT NULL DEFAULT 1,
  include_community INTEGER NOT NULL DEFAULT 1,
  include_queues INTEGER NOT NULL DEFAULT 1,
  include_countries INTEGER NOT NULL DEFAULT 1,
  include_contributions INTEGER NOT NULL DEFAULT 1,
  last_sent_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO weekly_report_settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS admin_mcp_clients (
  client_id TEXT PRIMARY KEY,
  client_name TEXT NOT NULL DEFAULT '',
  redirect_uris TEXT NOT NULL DEFAULT '[]',
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS admin_mcp_authorization_requests (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES admin_mcp_clients(client_id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT '',
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL DEFAULT 'S256',
  requested_scopes TEXT NOT NULL DEFAULT '[]',
  actor_uid TEXT NOT NULL DEFAULT '',
  actor_email TEXT NOT NULL DEFAULT '',
  client_name TEXT NOT NULL DEFAULT '',
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_admin_mcp_auth_requests_expiry ON admin_mcp_authorization_requests(expires_at);
CREATE TABLE IF NOT EXISTS admin_mcp_authorization_codes (
  code_hash TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES admin_mcp_authorization_requests(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  actor_uid TEXT NOT NULL,
  actor_email TEXT NOT NULL COLLATE NOCASE,
  actor_name TEXT NOT NULL DEFAULT '',
  grants TEXT NOT NULL DEFAULT '[]',
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_admin_mcp_authorization_codes_expiry ON admin_mcp_authorization_codes(expires_at);
CREATE TABLE IF NOT EXISTS admin_mcp_connections (
  id TEXT PRIMARY KEY,
  actor_uid TEXT NOT NULL,
  actor_email TEXT NOT NULL COLLATE NOCASE,
  client_id TEXT NOT NULL,
  client_name TEXT NOT NULL DEFAULT '',
  grants TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'revoked')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT NOT NULL DEFAULT '',
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_admin_mcp_connections_actor ON admin_mcp_connections(actor_email, status, created_at DESC);
CREATE TABLE IF NOT EXISTS admin_mcp_tokens (
  token_hash TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES admin_mcp_connections(id) ON DELETE CASCADE,
  token_type TEXT NOT NULL CHECK(token_type IN ('access', 'refresh')),
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  rotated_from TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_mcp_tokens_connection ON admin_mcp_tokens(connection_id, token_type, expires_at);
CREATE TABLE IF NOT EXISTS admin_mcp_confirmations (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES admin_mcp_connections(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_mcp_confirmations_expiry ON admin_mcp_confirmations(connection_id, expires_at, consumed_at);

-- Operations tables are included here so a fresh Admin database can be
-- initialized with one schema file. Existing 0048 remains the historical
-- migration for the retired admin-operations-db.
CREATE TABLE IF NOT EXISTS operations_tasks (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  task_type TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT '',
  source_id TEXT NOT NULL DEFAULT '',
  source_action TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'inbox' CHECK(status IN ('inbox','assigned','in_progress','blocked','completed','cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
  assignee_uid TEXT NOT NULL DEFAULT '',
  assignee_email TEXT NOT NULL DEFAULT '',
  due_at TEXT,
  required_permission TEXT NOT NULL DEFAULT 'dashboard.view',
  dedupe_key TEXT NOT NULL UNIQUE,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_by_uid TEXT NOT NULL DEFAULT '',
  created_by_email TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_operations_tasks_queue ON operations_tasks(status, priority, due_at, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_operations_tasks_assignee ON operations_tasks(assignee_uid, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_operations_tasks_domain ON operations_tasks(domain, task_type, status);
CREATE INDEX IF NOT EXISTS idx_operations_tasks_source ON operations_tasks(source_type, source_id);
CREATE TABLE IF NOT EXISTS operations_task_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES operations_tasks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_value TEXT NOT NULL DEFAULT '',
  to_value TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  actor_uid TEXT NOT NULL DEFAULT '',
  actor_email TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_operations_task_events_task ON operations_task_events(task_id, created_at DESC);
CREATE TABLE IF NOT EXISTS operations_task_links (
  task_id TEXT NOT NULL REFERENCES operations_tasks(id) ON DELETE CASCADE,
  linked_type TEXT NOT NULL,
  linked_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(task_id, linked_type, linked_id)
);
CREATE TABLE IF NOT EXISTS operations_approvals (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT '',
  target_id TEXT NOT NULL DEFAULT '',
  payload_hash TEXT NOT NULL,
  source_revision TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','expired','cancelled')),
  requested_by_uid TEXT NOT NULL,
  requested_by_email TEXT NOT NULL,
  resolved_by_uid TEXT NOT NULL DEFAULT '',
  resolved_by_email TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_operations_approvals_status ON operations_approvals(status, expires_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operations_approvals_target ON operations_approvals(target_type, target_id, status);
CREATE TABLE IF NOT EXISTS operations_revisions (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  revision_number INTEGER NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('draft','published')),
  snapshot_json TEXT NOT NULL,
  change_summary TEXT NOT NULL DEFAULT '',
  source_action TEXT NOT NULL DEFAULT '',
  actor_uid TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(domain, record_type, record_id, revision_number)
);
CREATE INDEX IF NOT EXISTS idx_operations_revisions_record ON operations_revisions(domain, record_type, record_id, revision_number DESC);
CREATE TABLE IF NOT EXISTS operations_workspace_settings (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  approval_policy_json TEXT NOT NULL DEFAULT '{}',
  draft_retention_days INTEGER NOT NULL DEFAULT 180,
  updated_by_uid TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO operations_workspace_settings (id, updated_at) VALUES (1, datetime('now'));
CREATE TABLE IF NOT EXISTS operations_idempotency (
  request_id TEXT PRIMARY KEY,
  actor_uid TEXT NOT NULL,
  action TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
