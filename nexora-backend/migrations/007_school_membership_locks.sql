-- SELECT ... FOR SHARE needs UPDATE privilege as well as SELECT visibility.
-- Membership locks must not require an administrative database connection.
GRANT UPDATE ON public.schools TO nexora_runtime;

CREATE POLICY school_membership_update ON public.schools FOR UPDATE TO nexora_runtime
    USING (id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
    WITH CHECK (id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);
