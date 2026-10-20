-- One encrypted refresh token for the Manarah Workspace mailbox.
CREATE TABLE IF NOT EXISTS gmail_connections (
  mailbox TEXT PRIMARY KEY,
  account_email TEXT NOT NULL,
  refresh_token_ciphertext TEXT NOT NULL,
  scope_json TEXT NOT NULL DEFAULT '[]',
  connected_by TEXT NOT NULL DEFAULT '',
  connected_at TEXT NOT NULL,
  last_sync_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gmail_oauth_states (
  state TEXT PRIMARY KEY,
  actor_email TEXT NOT NULL,
  return_to TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gmail_oauth_states_expiry ON gmail_oauth_states(expires_at);
