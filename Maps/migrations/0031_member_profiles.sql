-- Member-owned profiles. The private payload is only returned to the Firebase
-- user whose stable uid matches user_id. Public directory reads are projected
-- through the publication allow-list in public_fields.
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

CREATE INDEX IF NOT EXISTS idx_member_profiles_order
  ON member_profiles(display_order, updated_at);
