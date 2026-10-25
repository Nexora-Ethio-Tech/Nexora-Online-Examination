ALTER TABLE public.users ADD COLUMN phone_number text;
ALTER TABLE public.users ADD COLUMN recovery_email text;
ALTER TABLE public.users ADD COLUMN roll_number text;
GRANT SELECT(account_number) ON public.schools TO nexora_platform;
GRANT SELECT(first_name,father_name,grandfather_name,phone_number,recovery_email,revision) ON public.users TO nexora_platform;
GRANT UPDATE(first_name,father_name,grandfather_name,phone_number,recovery_email,display_name,revision) ON public.users TO nexora_platform_ops;
GRANT SELECT(revision) ON public.users TO nexora_platform_ops;
CREATE FUNCTION platform.update_admin_profile(p_school uuid,p_admin uuid,p_first text,p_father text,p_grandfather text,p_phone text,p_email text,p_revision integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE updated integer;
BEGIN
 UPDATE public.users SET first_name=p_first,father_name=p_father,grandfather_name=p_grandfather,
 display_name=concat_ws(' ',p_first,p_father,p_grandfather),phone_number=p_phone,recovery_email=p_email,revision=revision+1
 WHERE school_id=p_school AND id=p_admin AND role='school_admin' AND revision=p_revision RETURNING revision INTO updated;
 IF updated IS NULL THEN RAISE EXCEPTION 'STALE_ADMIN_PROFILE'; END IF;
 RETURN updated;
END; $$;
ALTER FUNCTION platform.update_admin_profile(uuid,uuid,text,text,text,text,text,integer) OWNER TO nexora_platform_ops;
REVOKE ALL ON FUNCTION platform.update_admin_profile(uuid,uuid,text,text,text,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.update_admin_profile(uuid,uuid,text,text,text,text,text,integer) TO nexora_platform;
