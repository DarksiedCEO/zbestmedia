ALTER TABLE "event_outbox"
  ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lease_owner" TEXT,
  ADD COLUMN "lease_expires_at" TIMESTAMP(3),
  ADD COLUMN "terminal_at" TIMESTAMP(3),
  ADD COLUMN "last_retry_class" TEXT,
  ADD COLUMN "last_error" TEXT;

DROP INDEX IF EXISTS "event_outbox_publishedAt_idx";
CREATE INDEX "idx_event_outbox_due" ON "event_outbox"("published_at", "terminal_at", "next_attempt_at");
CREATE INDEX "idx_event_outbox_lease" ON "event_outbox"("lease_expires_at");
