-- Migration 014: Align signals status machine with cron processing.
-- Allows transient PROCESSING state used by /api/cron/process-signals.

ALTER TABLE signals
  DROP CONSTRAINT IF EXISTS signals_status_check;

ALTER TABLE signals
  ADD CONSTRAINT signals_status_check
  CHECK (status IN ('DRAFT', 'PROCESSING', 'ANALYZED', 'APPROVED', 'REJECTED'));
