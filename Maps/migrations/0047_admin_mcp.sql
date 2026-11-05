-- OAuth-backed, per-user MCP connections. Tokens and codes are stored only as
-- SHA-256 hashes; plaintext credentials exist only in the issuing response.
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
CREATE INDEX IF NOT EXISTS idx_admin_mcp_auth_requests_expiry
  ON admin_mcp_authorization_requests(expires_at);

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
CREATE INDEX IF NOT EXISTS idx_admin_mcp_authorization_codes_expiry
  ON admin_mcp_authorization_codes(expires_at);

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
CREATE INDEX IF NOT EXISTS idx_admin_mcp_connections_actor
  ON admin_mcp_connections(actor_email, status, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_mcp_tokens (
  token_hash TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES admin_mcp_connections(id) ON DELETE CASCADE,
  token_type TEXT NOT NULL CHECK(token_type IN ('access', 'refresh')),
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  rotated_from TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_mcp_tokens_connection
  ON admin_mcp_tokens(connection_id, token_type, expires_at);

CREATE TABLE IF NOT EXISTS admin_mcp_confirmations (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES admin_mcp_connections(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_mcp_confirmations_expiry
  ON admin_mcp_confirmations(connection_id, expires_at, consumed_at);
