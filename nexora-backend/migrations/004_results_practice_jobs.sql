-- Migration 004: Official Results, Publications, Practice Engine, and Jobs

-- Official Results (Versioned student results)
CREATE TABLE IF NOT EXISTS official_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    attempt_id UUID NOT NULL,
    revision INT NOT NULL DEFAULT 1,
    score INT NOT NULL,
    max_score INT NOT NULL,
    percent NUMERIC(5, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'invalidated', 'absent')),
    source_submission_id UUID NULL REFERENCES submissions(id) ON DELETE SET NULL,
    recovery_id UUID NULL REFERENCES recovery_uploads(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_official_results_attempt FOREIGN KEY (school_id, attempt_id) REFERENCES attempts(school_id, id) ON DELETE CASCADE,
    CONSTRAINT uq_official_results_revision UNIQUE (school_id, attempt_id, revision)
);

-- Result Publications (Session-level release gate)
CREATE TABLE IF NOT EXISTS result_publications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    session_id UUID NOT NULL,
    revision INT NOT NULL DEFAULT 1,
    results_approved_at TIMESTAMPTZ NOT NULL,
    results_release_at TIMESTAMPTZ NOT NULL,
    excluded_attempt_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    approved_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_result_pub_session FOREIGN KEY (school_id, session_id) REFERENCES exam_sessions(school_id, id) ON DELETE CASCADE,
    CONSTRAINT uq_result_pub_session_rev UNIQUE (school_id, session_id, revision)
);

-- Practice Access
CREATE TABLE IF NOT EXISTS practice_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    exam_version_id UUID NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    release_at TIMESTAMPTZ NOT NULL,
    eligible_cohort TEXT NOT NULL DEFAULT 'all',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_practice_access_version FOREIGN KEY (school_id, exam_version_id) REFERENCES exam_versions(school_id, id) ON DELETE CASCADE,
    CONSTRAINT uq_practice_access_version UNIQUE (school_id, exam_version_id)
);

-- Practice Attempts
CREATE TABLE IF NOT EXISTS practice_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL,
    exam_version_id UUID NOT NULL,
    state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'completed', 'abandoned')),
    score INT NOT NULL DEFAULT 0,
    max_score INT NOT NULL DEFAULT 0,
    completed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_practice_attempts_school_id UNIQUE (school_id, id),
    CONSTRAINT fk_practice_attempts_student FOREIGN KEY (school_id, student_id) REFERENCES users(school_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_practice_attempts_version FOREIGN KEY (school_id, exam_version_id) REFERENCES exam_versions(school_id, id) ON DELETE CASCADE
);

-- Practice Answers
CREATE TABLE IF NOT EXISTS practice_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    practice_attempt_id UUID NOT NULL,
    item_id TEXT NOT NULL,
    value TEXT NULL,
    is_correct BOOLEAN NOT NULL,
    explanation TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_practice_answers_attempt FOREIGN KEY (school_id, practice_attempt_id) REFERENCES practice_attempts(school_id, id) ON DELETE CASCADE,
    CONSTRAINT uq_practice_answers_item UNIQUE (school_id, practice_attempt_id, item_id)
);

-- Practice Summaries (Atomic best_percent per student & exam version)
CREATE TABLE IF NOT EXISTS practice_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL,
    exam_version_id UUID NOT NULL,
    best_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
    best_attempt_id UUID NULL,
    completed_count INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_practice_summaries_student FOREIGN KEY (school_id, student_id) REFERENCES users(school_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_practice_summaries_version FOREIGN KEY (school_id, exam_version_id) REFERENCES exam_versions(school_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_practice_summaries_best_attempt FOREIGN KEY (school_id, best_attempt_id) REFERENCES practice_attempts(school_id, id) ON DELETE SET NULL,
    CONSTRAINT uq_practice_summaries_student_version UNIQUE (school_id, student_id, exam_version_id)
);

-- Import Jobs and AI Jobs (Leased Postgres table workers)
CREATE TABLE IF NOT EXISTS import_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    source_filename TEXT NOT NULL,
    source_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    progress INT NOT NULL DEFAULT 0,
    diagnostics JSONB NOT NULL DEFAULT '[]'::jsonb,
    error_message TEXT NULL,
    lease_until TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    import_job_id UUID NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
    item_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    input_data JSONB NOT NULL,
    output_data JSONB NULL,
    attempts INT NOT NULL DEFAULT 0,
    lease_until TIMESTAMPTZ NULL,
    retry_at TIMESTAMPTZ NULL,
    error_message TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Row-Level Security
ALTER TABLE official_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE official_results FORCE ROW LEVEL SECURITY;
ALTER TABLE result_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE result_publications FORCE ROW LEVEL SECURITY;
ALTER TABLE practice_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_access FORCE ROW LEVEL SECURITY;
ALTER TABLE practice_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE practice_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_answers FORCE ROW LEVEL SECURITY;
ALTER TABLE practice_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_summaries FORCE ROW LEVEL SECURITY;
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_jobs FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_official_results ON official_results
    USING (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
    WITH CHECK (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);

CREATE POLICY tenant_isolation_result_publications ON result_publications
    USING (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
    WITH CHECK (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);

CREATE POLICY tenant_isolation_practice_access ON practice_access
    USING (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
    WITH CHECK (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);

CREATE POLICY tenant_isolation_practice_attempts ON practice_attempts
    USING (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
    WITH CHECK (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);

CREATE POLICY tenant_isolation_practice_answers ON practice_answers
    USING (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
    WITH CHECK (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);

CREATE POLICY tenant_isolation_practice_summaries ON practice_summaries
    USING (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
    WITH CHECK (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);

CREATE POLICY tenant_isolation_import_jobs ON import_jobs
    USING (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
    WITH CHECK (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);

CREATE POLICY tenant_isolation_ai_jobs ON ai_jobs
    USING (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
    WITH CHECK (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);
