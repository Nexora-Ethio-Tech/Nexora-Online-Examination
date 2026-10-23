-- Stable platform school numbers. Existing account login IDs are deliberately unchanged.
ALTER TABLE schools ADD COLUMN account_number integer GENERATED ALWAYS AS IDENTITY;
ALTER TABLE schools ADD CONSTRAINT schools_account_number_unique UNIQUE(account_number);
ALTER TABLE schools ADD CONSTRAINT schools_account_number_positive CHECK(account_number > 0);
GRANT USAGE ON SEQUENCE schools_account_number_seq TO nexora_platform_ops;
CREATE TABLE school_teacher_counters (
 school_id uuid PRIMARY KEY REFERENCES schools(id),
 last_number integer NOT NULL DEFAULT 0 CHECK(last_number >= 0)
);
ALTER TABLE school_teacher_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_teacher_counters FORCE ROW LEVEL SECURITY;
REVOKE ALL ON school_teacher_counters FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON school_teacher_counters TO nexora_runtime;
CREATE POLICY tenant_isolation ON school_teacher_counters TO nexora_runtime
 USING(school_id=NULLIF(current_setting('app.current_school_id',true),'')::uuid)
 WITH CHECK(school_id=NULLIF(current_setting('app.current_school_id',true),'')::uuid);
CREATE FUNCTION preserve_school_account_number() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.account_number IS DISTINCT FROM OLD.account_number THEN
  RAISE EXCEPTION 'School account number cannot be changed';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER schools_account_number_immutable BEFORE UPDATE ON schools
 FOR EACH ROW EXECUTE FUNCTION preserve_school_account_number();
