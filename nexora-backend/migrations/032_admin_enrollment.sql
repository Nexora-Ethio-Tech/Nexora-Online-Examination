CREATE TABLE public.admin_enrollment_invites (
 token_hash text PRIMARY KEY, school_id uuid NOT NULL REFERENCES public.schools(id), user_id uuid NOT NULL REFERENCES public.users(id),
 expires_at timestamptz NOT NULL, consumed_at timestamptz
);
ALTER TABLE public.admin_enrollment_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_enrollment_invites FORCE ROW LEVEL SECURITY;
CREATE POLICY enrollment_owner ON public.admin_enrollment_invites TO nexora_platform USING(true) WITH CHECK(true);
CREATE POLICY enrollment_tenant ON public.admin_enrollment_invites TO nexora_runtime USING(school_id::text=current_setting('app.current_school_id',true)) WITH CHECK(school_id::text=current_setting('app.current_school_id',true));
CREATE POLICY enrollment_lookup ON public.admin_enrollment_invites FOR SELECT TO nexora_platform_ops USING(true);
GRANT SELECT,INSERT,UPDATE ON public.admin_enrollment_invites TO nexora_platform;
GRANT SELECT,UPDATE ON public.admin_enrollment_invites TO nexora_runtime;
GRANT SELECT ON public.admin_enrollment_invites TO nexora_platform_ops;
CREATE FUNCTION public.nexora_enrollment_target(p_hash text) RETURNS TABLE(school_id uuid,user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT i.school_id,i.user_id FROM public.admin_enrollment_invites i WHERE i.token_hash=p_hash AND i.consumed_at IS NULL AND i.expires_at>clock_timestamp()
$$;
ALTER FUNCTION public.nexora_enrollment_target(text) OWNER TO nexora_platform_ops;
REVOKE ALL ON FUNCTION public.nexora_enrollment_target(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nexora_enrollment_target(text) TO nexora_runtime;
