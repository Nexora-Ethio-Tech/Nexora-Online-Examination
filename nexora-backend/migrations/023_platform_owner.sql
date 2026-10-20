-- Separate platform identity and narrowly granted cross-school operations.
CREATE ROLE nexora_platform NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE nexora_platform_ops NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
GRANT nexora_platform, nexora_platform_ops TO CURRENT_USER;
CREATE SCHEMA platform;
REVOKE ALL ON SCHEMA platform FROM PUBLIC;
GRANT USAGE ON SCHEMA platform TO nexora_platform, nexora_platform_ops;
GRANT USAGE ON SCHEMA public TO nexora_platform, nexora_platform_ops;

CREATE TABLE platform.accounts (
 id uuid PRIMARY KEY, login_id text UNIQUE NOT NULL, display_name text NOT NULL,
 password_hash text NOT NULL, active boolean NOT NULL DEFAULT false,
 mfa_secret_enc text NOT NULL, mfa_version uuid NOT NULL, enrolled_at timestamptz,
 last_step bigint NOT NULL DEFAULT -1, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE platform.sessions (
 id uuid PRIMARY KEY, token_hash text UNIQUE NOT NULL, csrf_token text NOT NULL,
 owner_id uuid REFERENCES platform.accounts(id), authenticated_at timestamptz,
 expires_at timestamptz NOT NULL, revoked_at timestamptz
);
CREATE TABLE platform.audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, owner_id uuid REFERENCES platform.accounts(id),
 school_id uuid, action text NOT NULL, reason text NOT NULL, details jsonb NOT NULL DEFAULT '{}',
 at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE platform.operations (
 owner_id uuid NOT NULL REFERENCES platform.accounts(id), request_id uuid NOT NULL,
 fingerprint text NOT NULL, result jsonb NOT NULL, PRIMARY KEY(owner_id,request_id)
);
CREATE TABLE platform.subscriptions (
 school_id uuid PRIMARY KEY REFERENCES public.schools(id),
 state text NOT NULL CHECK(state IN ('trial','active','restricted')),
 expires_at timestamptz, revision integer NOT NULL DEFAULT 1
);
ALTER TABLE public.schools ADD COLUMN platform_revision integer NOT NULL DEFAULT 1;

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['accounts','sessions','audit','operations','subscriptions'] LOOP
  EXECUTE format('ALTER TABLE platform.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE platform.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON platform.%I FROM PUBLIC,anon,authenticated,nexora_runtime',t);
  EXECUTE format('CREATE POLICY platform_access ON platform.%I TO nexora_platform USING(true) WITH CHECK(true)',t);
 END LOOP;
END $$;
GRANT SELECT ON platform.accounts TO nexora_platform;
GRANT UPDATE(last_step) ON platform.accounts TO nexora_platform;
GRANT SELECT,INSERT,UPDATE ON platform.sessions TO nexora_platform;
GRANT SELECT,INSERT ON platform.audit,platform.operations TO nexora_platform;
GRANT USAGE ON SEQUENCE platform.audit_id_seq TO nexora_platform;
GRANT SELECT,INSERT,UPDATE ON platform.subscriptions TO nexora_platform;
GRANT EXECUTE ON FUNCTION public.nexora_take_request_limit(text,integer,integer) TO nexora_platform;

-- Platform directory can read only identity/aggregate columns, never passwords, answers or MFA secrets.
GRANT SELECT(id,name,slug,status,created_at,platform_revision) ON public.schools TO nexora_platform;
GRANT SELECT(id,school_id,role,status,login_id,display_name,mfa_enrolled_at) ON public.users TO nexora_platform;
CREATE POLICY platform_school_directory ON public.schools FOR SELECT TO nexora_platform USING(true);
CREATE POLICY platform_staff_directory ON public.users FOR SELECT TO nexora_platform USING(true);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['import_jobs','ai_jobs','package_jobs'] LOOP
  EXECUTE format('GRANT SELECT(status) ON public.%I TO nexora_platform',t);
  EXECUTE format('CREATE POLICY platform_queue_counts ON public.%I FOR SELECT TO nexora_platform USING(true)',t);
 END LOOP;
END $$;

-- No-login function owner has only the columns needed by the fixed operations below.
GRANT SELECT ON public.schools TO nexora_platform_ops;
GRANT INSERT(id,name,slug) ON public.schools TO nexora_platform_ops;
GRANT UPDATE(status,platform_revision) ON public.schools TO nexora_platform_ops;
GRANT SELECT(id,school_id,role) ON public.users TO nexora_platform_ops;
GRANT INSERT(id,school_id,login_id,display_name,role,password_hash,status) ON public.users TO nexora_platform_ops;
GRANT UPDATE(password_hash,status,mfa_secret_enc,mfa_enrolled_at,mfa_pending_secret_enc,mfa_pending_expires_at,mfa_secret_version) ON public.users TO nexora_platform_ops;
GRANT SELECT(user_id,school_id) ON public.auth_sessions TO nexora_platform_ops;
GRANT UPDATE(revoked_at) ON public.auth_sessions TO nexora_platform_ops;
CREATE POLICY platform_school_operations ON public.schools TO nexora_platform_ops USING(true) WITH CHECK(true);
CREATE POLICY platform_admin_operations ON public.users TO nexora_platform_ops USING(role='school_admin') WITH CHECK(role='school_admin');
CREATE POLICY platform_revoke_sessions ON public.auth_sessions TO nexora_platform_ops USING(true) WITH CHECK(true);

CREATE FUNCTION platform.provision_school(p_school uuid,p_admin uuid,p_name text,p_slug text,p_login text,p_display text,p_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_hash NOT LIKE '$argon2id$%' THEN RAISE EXCEPTION 'Invalid credential hash'; END IF;
 INSERT INTO public.schools(id,name,slug) VALUES(p_school,p_name,p_slug);
 INSERT INTO public.users(id,school_id,login_id,display_name,role,password_hash,status)
 VALUES(p_admin,p_school,p_login,p_display,'school_admin',p_hash,'inactive');
END $$;
CREATE FUNCTION platform.create_admin(p_school uuid,p_admin uuid,p_login text,p_display text,p_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_hash NOT LIKE '$argon2id$%' THEN RAISE EXCEPTION 'Invalid credential hash'; END IF;
 INSERT INTO public.users(id,school_id,login_id,display_name,role,password_hash,status)
 VALUES(p_admin,p_school,p_login,p_display,'school_admin',p_hash,'inactive');
END $$;
CREATE FUNCTION platform.school_status(p_school uuid,p_status text,p_revision integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r integer;
BEGIN
 IF p_status NOT IN ('active','inactive') THEN RAISE EXCEPTION 'Invalid status'; END IF;
 UPDATE public.schools SET status=p_status,platform_revision=platform_revision+1
 WHERE id=p_school AND platform_revision=p_revision RETURNING platform_revision INTO r;
 IF r IS NOT NULL AND p_status='inactive' THEN
  UPDATE public.auth_sessions SET revoked_at=clock_timestamp() WHERE school_id=p_school;
 END IF;
 RETURN r;
END $$;
CREATE FUNCTION platform.reset_admin(p_school uuid,p_admin uuid,p_hash text,p_reset_mfa boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_hash NOT LIKE '$argon2id$%' THEN RAISE EXCEPTION 'Invalid credential hash'; END IF;
 PERFORM id FROM public.users WHERE id=p_admin AND school_id=p_school AND role='school_admin' FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE public.users SET password_hash=p_hash WHERE id=p_admin AND school_id=p_school;
 IF p_reset_mfa THEN
  UPDATE public.users SET status='inactive',mfa_secret_enc=NULL,mfa_enrolled_at=NULL,
  mfa_pending_secret_enc=NULL,mfa_pending_expires_at=NULL,mfa_secret_version=gen_random_uuid()
  WHERE id=p_admin AND school_id=p_school;
 END IF;
 UPDATE public.auth_sessions SET revoked_at=clock_timestamp() WHERE user_id=p_admin AND school_id=p_school;
 RETURN true;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA platform FROM PUBLIC;
GRANT CREATE ON SCHEMA platform TO nexora_platform_ops;
ALTER FUNCTION platform.provision_school(uuid,uuid,text,text,text,text,text) OWNER TO nexora_platform_ops;
ALTER FUNCTION platform.create_admin(uuid,uuid,text,text,text) OWNER TO nexora_platform_ops;
ALTER FUNCTION platform.school_status(uuid,text,integer) OWNER TO nexora_platform_ops;
ALTER FUNCTION platform.reset_admin(uuid,uuid,text,boolean) OWNER TO nexora_platform_ops;
REVOKE CREATE ON SCHEMA platform FROM nexora_platform_ops;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA platform TO nexora_platform;

-- Subscription rules apply to new scheduling only. Existing delivery is untouched.
GRANT USAGE ON SCHEMA platform TO nexora_runtime;
GRANT SELECT ON platform.subscriptions TO nexora_runtime;
CREATE POLICY school_subscription_read ON platform.subscriptions FOR SELECT TO nexora_runtime
 USING(school_id=NULLIF(current_setting('app.current_school_id',true),'')::uuid);
