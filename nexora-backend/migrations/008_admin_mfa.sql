ALTER TABLE users
    ADD COLUMN mfa_secret_version UUID NOT NULL DEFAULT gen_random_uuid(),
    ADD COLUMN mfa_enrolled_at TIMESTAMPTZ NULL,
    ADD COLUMN mfa_pending_secret_enc TEXT NULL,
    ADD COLUMN mfa_pending_expires_at TIMESTAMPTZ NULL,
    ADD COLUMN mfa_failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (mfa_failed_attempts >= 0),
    ADD COLUMN mfa_window_started_at TIMESTAMPTZ NULL;

ALTER TABLE audit_events ADD COLUMN operator_identity TEXT NULL;

-- Legacy plaintext/seed secrets do not establish verified enrollment.
INSERT INTO audit_events (school_id, action, resource_id, reason)
SELECT school_id, 'admin_mfa_legacy_disabled', id::text,
       'Unverified legacy MFA retired; protected operator enrollment required'
FROM users WHERE role = 'school_admin';

UPDATE auth_sessions SET revoked_at = NOW()
WHERE user_id IN (SELECT id FROM users WHERE role = 'school_admin') AND revoked_at IS NULL;

UPDATE users SET status = 'inactive', mfa_secret_enc = NULL WHERE role = 'school_admin';

CREATE TABLE mfa_consumed_steps (
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    secret_version UUID NOT NULL,
    step BIGINT NOT NULL CHECK (step >= 0),
    consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, secret_version, step),
    FOREIGN KEY (school_id, user_id) REFERENCES users(school_id, id) ON DELETE CASCADE
);
ALTER TABLE mfa_consumed_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfa_consumed_steps FORCE ROW LEVEL SECURITY;
REVOKE ALL ON mfa_consumed_steps FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON mfa_consumed_steps TO nexora_runtime;
CREATE POLICY tenant_isolation ON mfa_consumed_steps TO nexora_runtime
    USING (school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
    WITH CHECK (school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);
