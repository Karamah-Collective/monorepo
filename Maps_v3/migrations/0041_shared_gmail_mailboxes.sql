-- Record which shared mailbox an OAuth state is preparing to connect.
-- Existing states were always for Manarah and keep that default.
ALTER TABLE gmail_oauth_states ADD COLUMN mailbox TEXT NOT NULL DEFAULT 'manarah@karamahcollective.com';
