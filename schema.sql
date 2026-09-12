-- Cloudflare D1 schema for Halal Finder / Maps_Finland.
-- Ported 1:1 from the Google Sheets structure documented at the top of
-- scripts/apps-script/Code.gs. See docs/D1_MIGRATION_PLAN.md for the full
-- migration plan and rationale for every deliberate deviation noted inline
-- below (each one fixes something Sheets could only do best-effort).
--
-- The legacy "Verifications" sheet (ephemeral OTP state) has no table here —
-- the anonymous OTP review flow is retired in favor of Firebase-only auth.

-- 1. Draft — permanent unfiltered archive of every submission, never deleted.
CREATE TABLE draft (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp     TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  type          TEXT NOT NULL DEFAULT '',
  address       TEXT NOT NULL DEFAULT '',
  tags          TEXT NOT NULL DEFAULT '',
  maps_link     TEXT NOT NULL DEFAULT '',
  notes         TEXT NOT NULL DEFAULT '',
  score         TEXT NOT NULL DEFAULT '',
  opening_hours TEXT NOT NULL DEFAULT '',
  email_hash    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_draft_email_hash ON draft(email_hash);

-- 2. New — pending place submissions + Google enrichment.
-- Deviation: the legacy "Approved column doubles as reject-reason on
-- rejection" overload becomes a real status + reject_reason pair.
CREATE TABLE new_places (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp           TEXT NOT NULL,
  name                TEXT NOT NULL DEFAULT '',
  type                TEXT NOT NULL DEFAULT '',
  address             TEXT NOT NULL DEFAULT '',
  tags                TEXT NOT NULL DEFAULT '',
  maps_link           TEXT NOT NULL DEFAULT '',
  notes               TEXT NOT NULL DEFAULT '',
  score               TEXT NOT NULL DEFAULT '',
  google_name         TEXT NOT NULL DEFAULT '',
  google_address      TEXT NOT NULL DEFAULT '',
  lat                 REAL,
  lng                 REAL,
  place_id            TEXT NOT NULL DEFAULT '',
  website             TEXT NOT NULL DEFAULT '',
  enriched_at         TEXT NOT NULL DEFAULT '',
  status              TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','yes','no')),
  reject_reason       TEXT NOT NULL DEFAULT '',
  opening_hours       TEXT NOT NULL DEFAULT '',
  google_review       TEXT NOT NULL DEFAULT '',
  google_rating       REAL,
  google_rating_count INTEGER,
  phone               TEXT NOT NULL DEFAULT '',
  google_info         TEXT NOT NULL DEFAULT '',
  email_hash          TEXT NOT NULL DEFAULT '',
  app_place_id        TEXT NOT NULL DEFAULT ''  -- back-link to places.id, written once on approval
);
CREATE INDEX idx_new_places_status ON new_places(status);
CREATE INDEX idx_new_places_email_hash ON new_places(email_hash);
CREATE INDEX idx_new_places_maps_link ON new_places(maps_link);
CREATE INDEX idx_new_places_lat_lng ON new_places(lat, lng);

-- 3. Edit — pending place edits.
CREATE TABLE edits (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp       TEXT NOT NULL,
  place_id        TEXT NOT NULL DEFAULT '',
  name            TEXT NOT NULL DEFAULT '',
  type            TEXT NOT NULL DEFAULT '',
  address         TEXT NOT NULL DEFAULT '',
  tags            TEXT NOT NULL DEFAULT '',
  maps_link       TEXT NOT NULL DEFAULT '',
  notes           TEXT NOT NULL DEFAULT '',
  score           TEXT NOT NULL DEFAULT '',
  changes_summary TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','yes','no')),
  reject_reason   TEXT NOT NULL DEFAULT '',
  opening_hours   TEXT NOT NULL DEFAULT '',
  website         TEXT NOT NULL DEFAULT '',
  phone           TEXT NOT NULL DEFAULT '',
  email_hash      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_edits_status ON edits(status);
CREATE INDEX idx_edits_email_hash ON edits(email_hash);
CREATE INDEX idx_edits_place_id ON edits(place_id);

-- 4. Contact — contact form submissions.
CREATE TABLE contacts (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  name      TEXT NOT NULL DEFAULT '',
  email     TEXT NOT NULL DEFAULT '',
  phone     TEXT NOT NULL DEFAULT '',
  message   TEXT NOT NULL DEFAULT '',
  score     TEXT NOT NULL DEFAULT '',
  replied   TEXT NOT NULL DEFAULT '' CHECK(replied IN ('','Yes','No'))
);
CREATE INDEX idx_contacts_replied ON contacts(replied);

-- 5. Places — the live, approved dataset (ground truth for the map).
CREATE TABLE places (
  id                      TEXT PRIMARY KEY,          -- 6-char random alnum, generated on approval
  name                    TEXT NOT NULL,
  type                    TEXT NOT NULL,
  address                 TEXT NOT NULL,
  lat                     REAL NOT NULL,
  lng                     REAL NOT NULL,
  tags                    TEXT NOT NULL DEFAULT '{}', -- JSON object: tagId -> bool
  notes                   TEXT NOT NULL DEFAULT '',
  boycott                 INTEGER NOT NULL DEFAULT 0, -- 0/1
  disabled                INTEGER NOT NULL DEFAULT 0, -- 0/1; kept in admin/database, hidden from public map
  sponsor_tier            TEXT NOT NULL DEFAULT '',
  sponsor_promo           TEXT NOT NULL DEFAULT '',
  sponsor_promo_text      TEXT NOT NULL DEFAULT '',
  sponsor_start_date      TEXT NOT NULL DEFAULT '',   -- YYYY-MM-DD
  sponsor_end_date        TEXT NOT NULL DEFAULT '',   -- YYYY-MM-DD
  opening_hours           TEXT NOT NULL DEFAULT '',   -- JSON
  website                 TEXT NOT NULL DEFAULT '',
  phone                   TEXT NOT NULL DEFAULT '',
  google_info             TEXT NOT NULL DEFAULT '',   -- JSON
  google_info_enriched_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_places_type ON places(type);
CREATE INDEX idx_places_lat_lng ON places(lat, lng); -- dedup bounding-box prefilter

-- 5a. Place promos -- active offer rows, independent of sponsorship.
CREATE TABLE place_promos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id    TEXT NOT NULL,
  code        TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  start_date  TEXT NOT NULL DEFAULT '', -- YYYY-MM-DD
  end_date    TEXT NOT NULL DEFAULT '', -- YYYY-MM-DD
  sort_order  INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(place_id) REFERENCES places(id) ON DELETE CASCADE
);
CREATE INDEX idx_place_promos_place_id ON place_promos(place_id);

-- 6. Tags — type/tag_id/label lookup.
CREATE TABLE tags (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  type   TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  label  TEXT NOT NULL,
  icon   TEXT NOT NULL DEFAULT '',
  color  TEXT NOT NULL DEFAULT '',
  UNIQUE(type, tag_id)
);
CREATE INDEX idx_tags_type ON tags(type);

-- 7. EidNew — pending Eid-prayer-location submissions.
CREATE TABLE eid_new (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp      TEXT NOT NULL,
  name           TEXT NOT NULL DEFAULT '',
  address        TEXT NOT NULL DEFAULT '',
  maps_link      TEXT NOT NULL DEFAULT '',
  organizer      TEXT NOT NULL DEFAULT '',
  jamaats        TEXT NOT NULL DEFAULT '',
  date           TEXT NOT NULL DEFAULT '',
  notes          TEXT NOT NULL DEFAULT '',
  score          TEXT NOT NULL DEFAULT '',
  google_name    TEXT NOT NULL DEFAULT '',
  google_address TEXT NOT NULL DEFAULT '',
  lat            REAL,
  lng            REAL,
  place_id       TEXT NOT NULL DEFAULT '',
  website        TEXT NOT NULL DEFAULT '',
  enriched_at    TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','yes','no')),
  reject_reason  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_eid_new_status ON eid_new(status);

-- 8. EidPrayers — live Eid prayer locations.
CREATE TABLE eid_prayers (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  address   TEXT NOT NULL DEFAULT '',
  lat       REAL NOT NULL,
  lng       REAL NOT NULL,
  organizer TEXT NOT NULL DEFAULT '',
  jamaats   TEXT NOT NULL DEFAULT '',   -- comma list
  notes     TEXT NOT NULL DEFAULT '',
  date      TEXT NOT NULL DEFAULT ''    -- YYYY-MM-DD
);

-- 9. Events — masjid events.
CREATE TABLE events (
  id                 TEXT PRIMARY KEY,             -- crypto.randomUUID()
  place_id           TEXT NOT NULL,
  title              TEXT NOT NULL DEFAULT '',
  description        TEXT NOT NULL DEFAULT '',
  event_date         TEXT NOT NULL DEFAULT '',
  event_time         TEXT NOT NULL DEFAULT '',
  end_time           TEXT NOT NULL DEFAULT '',
  recurring          INTEGER NOT NULL DEFAULT 0,
  recurrence_pattern TEXT NOT NULL DEFAULT '',
  url                TEXT NOT NULL DEFAULT '',
  status             TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','yes','no')),
  reject_reason      TEXT NOT NULL DEFAULT '',
  created_at         TEXT NOT NULL
);
CREATE INDEX idx_events_place_id ON events(place_id);
CREATE INDEX idx_events_status ON events(status);

-- 10. EventEdit — pending event edits.
CREATE TABLE event_edits (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp          TEXT NOT NULL,
  event_id           TEXT NOT NULL DEFAULT '',
  place_id           TEXT NOT NULL DEFAULT '',
  title              TEXT NOT NULL DEFAULT '',
  description        TEXT NOT NULL DEFAULT '',
  event_date         TEXT NOT NULL DEFAULT '',
  event_time         TEXT NOT NULL DEFAULT '',
  end_time           TEXT NOT NULL DEFAULT '',
  recurring          INTEGER NOT NULL DEFAULT 0,
  recurrence_pattern TEXT NOT NULL DEFAULT '',
  url                TEXT NOT NULL DEFAULT '',
  score              TEXT NOT NULL DEFAULT '',
  changes_summary    TEXT NOT NULL DEFAULT '',
  status             TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','yes','no')),
  reject_reason      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_event_edits_status ON event_edits(status);
CREATE INDEX idx_event_edits_event_id ON event_edits(event_id);

-- 11. Wishes — feature-request board.
CREATE TABLE wishes (
  id            TEXT PRIMARY KEY,        -- crypto.randomUUID()
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  votes         INTEGER NOT NULL DEFAULT 0,
  created       TEXT NOT NULL,
  voted_devices TEXT NOT NULL DEFAULT '', -- comma list, device-fingerprint based vote dedup
  name          TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  approved      TEXT NOT NULL DEFAULT '' CHECK(approved IN ('','Yes','No')),
  implemented   TEXT NOT NULL DEFAULT '' CHECK(implemented IN ('','Yes','Inprogress','Out of Scope'))
);
CREATE INDEX idx_wishes_approved ON wishes(approved);

-- 12. Reviews — community reviews + one embedded "Google reviews" shadow
-- row per place (email_hash = '').
-- Deviation: UNIQUE(place_id, email_hash) enables a single atomic upsert
-- instead of a scan-then-branch. Verified safe: the shadow row is only ever
-- created once, at place-approval time, on a placeId with provably zero
-- existing reviews (see upsertGoogleReviewForPlaceId's one call site).
CREATE TABLE reviews (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id            TEXT NOT NULL,
  rating              INTEGER,
  text                TEXT NOT NULL DEFAULT '',
  email               TEXT NOT NULL DEFAULT '',  -- legacy OTP-path plaintext only; never written going forward
  timestamp           TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'yes' CHECK(status IN ('yes','no','pending')),
  email_hash          TEXT NOT NULL DEFAULT '',
  google_review       TEXT NOT NULL DEFAULT '',
  google_rating       REAL,
  google_rating_count  INTEGER,
  UNIQUE(place_id, email_hash)
);
CREATE INDEX idx_reviews_place_id ON reviews(place_id);
CREATE INDEX idx_reviews_email_hash ON reviews(email_hash);

-- 13. SavedPlaces — cross-device favorites/pins/home/visited.
-- Deviation: partial unique indexes enforce "at most one home row per user"
-- and idempotent favorite/visited inserts at the DB level, on top of the
-- existing app-level checks.
CREATE TABLE saved_places (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email_hash TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK(kind IN ('favorite','pin','home','visited')),
  place_id   TEXT NOT NULL DEFAULT '',
  pin_lat    REAL,
  pin_lng    REAL,
  pin_name   TEXT NOT NULL DEFAULT '',
  saved_at   TEXT NOT NULL
);
CREATE INDEX idx_saved_places_email_hash ON saved_places(email_hash);
CREATE UNIQUE INDEX idx_saved_places_placeid_kinds ON saved_places(email_hash, kind, place_id)
  WHERE kind IN ('favorite','visited');
CREATE UNIQUE INDEX idx_saved_places_one_home ON saved_places(email_hash)
  WHERE kind = 'home';

-- 14. AccountMeta — one row per account; badge lifetime counters.
CREATE TABLE account_meta (
  email_hash                 TEXT PRIMARY KEY,
  local_import_resolved      INTEGER NOT NULL DEFAULT 0,
  resolved_at                TEXT NOT NULL DEFAULT '',
  first_seen_at               TEXT NOT NULL DEFAULT '',
  lifetime_review_count      INTEGER NOT NULL DEFAULT 0,
  lifetime_visited_place_ids TEXT NOT NULL DEFAULT '[]'  -- JSON array (a set, not a counter)
);

-- 15. AuditLog — internal admin-action trail (who did what, when), for the
-- /admin dashboard's activity log.
--
-- INTENTIONAL EXCEPTION to the emailHash-only privacy rule used everywhere
-- else in this schema. That rule protects *public map visitors'* privacy
-- from being linkable in backend data. This table instead identifies
-- internal @karamahcollective.com team members performing admin actions —
-- its entire purpose is showing colleagues "who approved/rejected this,"
-- the same way any admin console shows real user identities to its own
-- operators. Storing actor_email/actor_name in plaintext here is required,
-- correct behavior, not a violation of the hash-only rule.
CREATE TABLE audit_log (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at        TEXT NOT NULL,              -- helsinkiTimestamp(), display only — NOT sortable as a string (day-first, non-ISO); use id/created_at_epoch for ordering
  created_at_epoch  INTEGER NOT NULL,            -- Date.now() ms — ordering + login/signup dedup window
  action            TEXT NOT NULL,               -- e.g. 'approve-new', 'update-sponsor', 'login', 'signup'
  actor_uid         TEXT NOT NULL DEFAULT '',     -- Firebase uid — stable even if email/name later change
  actor_email       TEXT NOT NULL DEFAULT '',     -- plaintext by design (internal audit trail — see note above)
  actor_name        TEXT NOT NULL DEFAULT '',     -- plaintext, from the Firebase ID token's `name` claim
  target_id         TEXT NOT NULL DEFAULT '',     -- generic rowId/placeId/eventId/wishId/rowIndex, stringified
  detail            TEXT NOT NULL DEFAULT '',     -- JSON blob: request body minus the `action` field
  success           INTEGER NOT NULL DEFAULT 1    -- 0/1 — did the handler report {success:true}?
);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_actor_uid ON audit_log(actor_uid);
