-- One encrypted Gmail refresh token per authenticated workspace member.
-- Personal mailbox rows are intentionally keyed by Firebase uid, not role or
-- email address, so another admin cannot query the connection by guessing an
-- address.
CREATE TABLE IF NOT EXISTS personal_gmail_connections (
  owner_uid TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  account_email TEXT NOT NULL UNIQUE,
  refresh_token_ciphertext TEXT NOT NULL,
  scope_json TEXT NOT NULL DEFAULT '[]',
  connected_at TEXT NOT NULL,
  last_sync_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS personal_gmail_oauth_states (
  state TEXT PRIMARY KEY,
  owner_uid TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  return_to TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_personal_gmail_oauth_states_expiry
  ON personal_gmail_oauth_states(expires_at);
