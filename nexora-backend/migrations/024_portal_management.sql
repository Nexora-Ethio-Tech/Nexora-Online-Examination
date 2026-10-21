-- Additive portal lifecycle and school-wide student numbering. Reconcile target ledger first.
CREATE TABLE school_student_counters (
 school_id uuid PRIMARY KEY REFERENCES schools(id),
 last_number integer NOT NULL DEFAULT 0 CHECK(last_number >= 0)
);
ALTER TABLE school_student_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_student_counters FORCE ROW LEVEL SECURITY;
REVOKE ALL ON school_student_counters FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON school_student_counters TO nexora_runtime;
CREATE POLICY tenant_isolation ON school_student_counters TO nexora_runtime
 USING(school_id=NULLIF(current_setting('app.current_school_id',true),'')::uuid)
 WITH CHECK(school_id=NULLIF(current_setting('app.current_school_id',true),'')::uuid);
ALTER TABLE exams ADD COLUMN archived_at timestamptz;
