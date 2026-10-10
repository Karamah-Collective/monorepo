-- Keep local inbox threads linked to the provider thread that Gmail uses for replies.
ALTER TABLE inbox_threads ADD COLUMN provider_thread_id TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_threads_provider_thread
  ON inbox_threads(provider_thread_id)
  WHERE provider_thread_id <> '';
