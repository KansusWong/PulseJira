-- #17: Add missing indexes for common query patterns
--
-- signals.status   — frequently filtered in dashboards and cron jobs
-- decisions.signal_id — FK lookup when loading decisions for a signal
-- tasks.status     — frequently queried in kanban / task list views
-- tasks.decision_id — FK lookup when loading tasks for a decision

CREATE INDEX IF NOT EXISTS idx_signals_status ON signals (status);

CREATE INDEX IF NOT EXISTS idx_decisions_signal_id ON decisions (signal_id);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);

CREATE INDEX IF NOT EXISTS idx_tasks_decision_id ON tasks (decision_id);
