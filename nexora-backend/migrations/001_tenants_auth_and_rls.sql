-- Migration 001: Tenants, Auth, Device Bindings, Audit, Idempotency and RLS

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schools Table
CREATE TABLE IF NOT EXISTS schools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'Africa/Addis_Ababa',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    login_id TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('student', 'teacher', 'school_admin')),
    password_hash TEXT NOT NULL,
    mfa_secret_enc TEXT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_users_school_id UNIQUE (school_id, id)
);

CREATE INDEX IF NOT EXISTS idx_users_login_id ON users(login_id);
CREATE INDEX IF NOT EXISTS idx_users_school_id ON users(school_id);

-- Auth Sessions Table (Can be anonymous initially for CSRF bootstrap)
CREATE TABLE IF NOT EXISTS auth_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NULL REFERENCES schools(id) ON DELETE CASCADE,
    user_id UUID NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    csrf_token TEXT NOT NULL,
    is_mfa_challenge BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_verified_at TIMESTAMPTZ NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_hash ON auth_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);

-- Device Bindings Table
CREATE TABLE IF NOT EXISTS device_bindings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    credential_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_device_bindings_school_user_device UNIQUE (school_id, user_id, device_id),
    CONSTRAINT fk_device_bindings_user_school FOREIGN KEY (school_id, user_id) REFERENCES users(school_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_device_bindings_lookup ON device_bindings(school_id, user_id, device_id);

-- Idempotency Keys Table
CREATE TABLE IF NOT EXISTS idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL,
    operation TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    payload_digest TEXT NOT NULL,
    status_code INT NOT NULL,
    response_body JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_idempotency_scope UNIQUE (school_id, actor_id, operation, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_lookup ON idempotency_keys(school_id, actor_id, operation, idempotency_key);

-- Audit Events Table
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    actor_id UUID NULL,
    action TEXT NOT NULL,
    resource_id TEXT NULL,
    reason TEXT NULL,
    server_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_school_server_at ON audit_events(school_id, server_at);

-- Row-Level Security Setup
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

ALTER TABLE device_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_bindings FORCE ROW LEVEL SECURITY;

ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys FORCE ROW LEVEL SECURITY;

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;

-- Tenant Isolation Policies
DROP POLICY IF EXISTS tenant_isolation_users ON users;
CREATE POLICY tenant_isolation_users ON users
    USING (
        current_setting('app.is_migration_or_admin', true) = 'true'
        OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid
    )
    WITH CHECK (
        current_setting('app.is_migration_or_admin', true) = 'true'
        OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid
    );

DROP POLICY IF EXISTS tenant_isolation_device_bindings ON device_bindings;
CREATE POLICY tenant_isolation_device_bindings ON device_bindings
    USING (
        current_setting('app.is_migration_or_admin', true) = 'true'
        OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid
    )
    WITH CHECK (
        current_setting('app.is_migration_or_admin', true) = 'true'
        OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid
    );

DROP POLICY IF EXISTS tenant_isolation_idempotency_keys ON idempotency_keys;
CREATE POLICY tenant_isolation_idempotency_keys ON idempotency_keys
    USING (
        current_setting('app.is_migration_or_admin', true) = 'true'
        OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid
    )
    WITH CHECK (
        current_setting('app.is_migration_or_admin', true) = 'true'
        OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid
    );

DROP POLICY IF EXISTS tenant_isolation_audit_events ON audit_events;
CREATE POLICY tenant_isolation_audit_events ON audit_events
    USING (
        current_setting('app.is_migration_or_admin', true) = 'true'
        OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid
    )
    WITH CHECK (
        current_setting('app.is_migration_or_admin', true) = 'true'
        OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid
    );
