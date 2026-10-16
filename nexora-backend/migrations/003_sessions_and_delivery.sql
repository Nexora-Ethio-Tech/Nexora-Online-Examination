-- Migration 003: Sessions, Delivery, Attempts, Saves, Submissions and Recovery

-- Exam Sessions
CREATE TABLE IF NOT EXISTS exam_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    exam_id UUID NOT NULL,
    exam_version_id UUID NOT NULL,
    preparation_visible_at TIMESTAMPTZ NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    schedule_revision INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_exam_sessions_school_id UNIQUE (school_id, id),
    CONSTRAINT fk_exam_sessions_exam FOREIGN KEY (school_id, exam_id) REFERENCES exams(school_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_exam_sessions_version FOREIGN KEY (school_id, exam_version_id) REFERENCES exam_versions(school_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_exam_sessions_timing ON exam_sessions(school_id, preparation_visible_at, starts_at, ends_at);

-- Session Roster
CREATE TABLE IF NOT EXISTS session_roster (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    session_id UUID NOT NULL,
    student_id UUID NOT NULL,
    extra_time_minutes INT NOT NULL DEFAULT 0,
    admission_status TEXT NOT NULL DEFAULT 'admitted' CHECK (admission_status IN ('admitted', 'barred')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_session_roster_session FOREIGN KEY (school_id, session_id) REFERENCES exam_sessions(school_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_session_roster_student FOREIGN KEY (school_id, student_id) REFERENCES users(school_id, id) ON DELETE CASCADE,
    CONSTRAINT uq_session_roster_student UNIQUE (school_id, session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_session_roster_lookup ON session_roster(school_id, student_id, session_id);

-- Attempts
CREATE TABLE IF NOT EXISTS attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    session_id UUID NOT NULL,
    student_id UUID NOT NULL,
    exam_version INT NOT NULL DEFAULT 1,
    schedule_revision INT NOT NULL DEFAULT 1,
    device_id TEXT NOT NULL,
    device_generation INT NOT NULL DEFAULT 1,
    state TEXT NOT NULL DEFAULT 'preparing' CHECK (state IN ('preparing', 'active', 'awaiting_upload', 'recovery_pending', 'submitted', 'invalidated')),
    starts_at TIMESTAMPTZ NOT NULL,
    deadline_at TIMESTAMPTZ NOT NULL,
    final_accept_until TIMESTAMPTZ NOT NULL,
    unlocked_at TIMESTAMPTZ NULL,
    last_server_save_at TIMESTAMPTZ NULL,
    highest_accepted_seq INT NOT NULL DEFAULT 0,
    question_order JSONB NOT NULL DEFAULT '[]'::jsonb, -- string[] itemIds
    option_orders JSONB NOT NULL DEFAULT '{}'::jsonb,  -- Record<string, string[]>
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_attempts_school_id UNIQUE (school_id, id),
    CONSTRAINT fk_attempts_session FOREIGN KEY (school_id, session_id) REFERENCES exam_sessions(school_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_attempts_student FOREIGN KEY (school_id, student_id) REFERENCES users(school_id, id) ON DELETE CASCADE,
    CONSTRAINT uq_attempts_student_session UNIQUE (school_id, session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_attempts_student ON attempts(school_id, student_id);

-- Attempt Answers (Current active state per attempt/item)
CREATE TABLE IF NOT EXISTS attempt_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    attempt_id UUID NOT NULL,
    device_generation INT NOT NULL,
    item_id TEXT NOT NULL,
    value TEXT NULL,
    client_seq INT NOT NULL,
    payload_hash TEXT NOT NULL,
    saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_attempt_answers_attempt FOREIGN KEY (school_id, attempt_id) REFERENCES attempts(school_id, id) ON DELETE CASCADE,
    CONSTRAINT uq_attempt_answers_item UNIQUE (school_id, attempt_id, item_id)
);

-- Revision History Table (To detect conflicting retries for the same attempt_id, device_generation, item_id, client_seq)
CREATE TABLE IF NOT EXISTS attempt_revision_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    attempt_id UUID NOT NULL,
    device_generation INT NOT NULL,
    item_id TEXT NOT NULL,
    client_seq INT NOT NULL,
    value TEXT NULL,
    payload_hash TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_revision_attempt FOREIGN KEY (school_id, attempt_id) REFERENCES attempts(school_id, id) ON DELETE CASCADE,
    CONSTRAINT uq_revision_seq UNIQUE (school_id, attempt_id, device_generation, item_id, client_seq)
);

-- Submissions (Committed official final snapshots & receipts)
CREATE TABLE IF NOT EXISTS submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- receiptId
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    attempt_id UUID NOT NULL UNIQUE,
    exam_version INT NOT NULL,
    schedule_revision INT NOT NULL,
    device_generation INT NOT NULL,
    final_seq INT NOT NULL,
    answers_snapshot JSONB NOT NULL,
    snapshot_digest TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    received_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_submissions_attempt FOREIGN KEY (school_id, attempt_id) REFERENCES attempts(school_id, id) ON DELETE CASCADE
);

-- Recovery Uploads (Immutable evidence for late/disputed submissions)
CREATE TABLE IF NOT EXISTS recovery_uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- recoveryId
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    attempt_id UUID NOT NULL,
    exam_version INT NOT NULL,
    schedule_revision INT NOT NULL,
    device_generation INT NOT NULL,
    final_seq INT NOT NULL,
    answers_snapshot JSONB NOT NULL,
    snapshot_digest TEXT NOT NULL,
    reason TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'recovery_pending' CHECK (status IN ('recovery_pending', 'accepted', 'rejected')),
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_by UUID NULL,
    decided_at TIMESTAMPTZ NULL,
    decision_reason TEXT NULL,
    CONSTRAINT fk_recovery_attempt FOREIGN KEY (school_id, attempt_id) REFERENCES attempts(school_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_recovery_decided_by FOREIGN KEY (school_id, decided_by) REFERENCES users(school_id, id) ON DELETE SET NULL
);

-- Row-Level Security
ALTER TABLE exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE session_roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_roster FORCE ROW LEVEL SECURITY;
ALTER TABLE attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE attempt_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempt_answers FORCE ROW LEVEL SECURITY;
ALTER TABLE attempt_revision_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempt_revision_history FORCE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions FORCE ROW LEVEL SECURITY;
ALTER TABLE recovery_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_uploads FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_exam_sessions ON exam_sessions
    USING (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
    WITH CHECK (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);

CREATE POLICY tenant_isolation_session_roster ON session_roster
    USING (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
    WITH CHECK (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);

CREATE POLICY tenant_isolation_attempts ON attempts
    USING (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
    WITH CHECK (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);

CREATE POLICY tenant_isolation_attempt_answers ON attempt_answers
    USING (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
    WITH CHECK (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);

CREATE POLICY tenant_isolation_attempt_revision_history ON attempt_revision_history
    USING (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
    WITH CHECK (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);

CREATE POLICY tenant_isolation_submissions ON submissions
    USING (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
    WITH CHECK (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);

CREATE POLICY tenant_isolation_recovery_uploads ON recovery_uploads
    USING (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
    WITH CHECK (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);
