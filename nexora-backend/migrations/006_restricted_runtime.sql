-- Authentication bootstrap is scoped to a login ID or hashed opaque cookie.
-- Only the server's runtime role can use these contexts; Data API roles have no grants.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexora_runtime') THEN
        CREATE ROLE nexora_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
            NOINHERIT NOREPLICATION NOBYPASSRLS;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexora_runtime'
        AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN
        RAISE EXCEPTION 'Existing nexora_runtime role has unsafe privileges';
    END IF;
END $$;

GRANT nexora_runtime TO CURRENT_USER;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO nexora_runtime;

DO $$
DECLARE
    table_name text;
    policy_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'schools', 'users', 'auth_sessions', 'browser_devices', 'device_bindings',
        'idempotency_keys', 'audit_events', 'classes', 'subjects', 'enrollments',
        'teacher_assignments', 'topics', 'exams', 'exam_versions', 'exam_items',
        'exam_packages', 'exam_sessions', 'session_roster', 'attempts', 'attempt_answers',
        'attempt_revision_history', 'submissions', 'recovery_uploads', 'official_results',
        'result_publications', 'practice_access', 'practice_attempts', 'practice_answers',
        'practice_summaries', 'import_jobs', 'ai_jobs', 'schema_migrations'
    ] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
        EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated, nexora_runtime', table_name);
        FOR policy_name IN SELECT policyname FROM pg_policies
            WHERE schemaname = 'public' AND tablename = table_name
        LOOP
            EXECUTE format('DROP POLICY %I ON public.%I', policy_name, table_name);
        END LOOP;
        IF table_name = 'schema_migrations' THEN
            CONTINUE;
        END IF;
        IF table_name = 'schools' THEN
            GRANT SELECT ON public.schools TO nexora_runtime;
            CONTINUE;
        END IF;
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO nexora_runtime', table_name);
        IF table_name IN ('auth_sessions', 'browser_devices') THEN
            CONTINUE;
        END IF;
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON public.%I TO nexora_runtime
             USING (school_id = NULLIF(current_setting(''app.current_school_id'', true), '''')::uuid)
             WITH CHECK (school_id = NULLIF(current_setting(''app.current_school_id'', true), '''')::uuid)',
            table_name
        );
    END LOOP;
END $$;

CREATE POLICY session_scope ON public.auth_sessions TO nexora_runtime
    USING (
        school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid
        OR token_hash = NULLIF(current_setting('app.auth_token_hash', true), '')
    )
    WITH CHECK (
        school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid
        OR token_hash = NULLIF(current_setting('app.auth_token_hash', true), '')
    );

CREATE POLICY auth_user_lookup ON public.users FOR SELECT TO nexora_runtime
    USING (
        login_id = NULLIF(current_setting('app.auth_login_id', true), '')
        OR EXISTS (
            SELECT 1 FROM public.auth_sessions s
            WHERE s.user_id = users.id AND s.school_id = users.school_id
              AND s.token_hash = NULLIF(current_setting('app.auth_token_hash', true), '')
        )
    );

CREATE POLICY school_lookup ON public.schools FOR SELECT TO nexora_runtime
    USING (
        id = NULLIF(current_setting('app.current_school_id', true), '')::uuid
        OR EXISTS (
            SELECT 1 FROM public.auth_sessions s WHERE s.school_id = schools.id
              AND s.token_hash = NULLIF(current_setting('app.auth_token_hash', true), '')
        )
        OR EXISTS (
            SELECT 1 FROM public.users u WHERE u.school_id = schools.id
              AND u.login_id = NULLIF(current_setting('app.auth_login_id', true), '')
        )
    );

-- The credential registry is global so a valid shared browser can enroll across schools.
-- Student ownership remains in tenant-scoped device_bindings and is checked by the API.
CREATE POLICY server_browser_registry ON public.browser_devices TO nexora_runtime
    USING (true) WITH CHECK (true);
