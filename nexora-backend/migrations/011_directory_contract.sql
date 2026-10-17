ALTER TABLE classes ADD COLUMN revision integer NOT NULL DEFAULT 1;
ALTER TABLE classes ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE subjects ADD COLUMN revision integer NOT NULL DEFAULT 1;
ALTER TABLE subjects ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE teacher_assignments ADD COLUMN revision integer NOT NULL DEFAULT 1;
ALTER TABLE teacher_assignments ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN revision integer NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN student_ref text;
ALTER TABLE users ADD COLUMN credentials_issued boolean NOT NULL DEFAULT true;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
CREATE UNIQUE INDEX users_school_student_ref ON users(school_id,lower(student_ref)) WHERE student_ref IS NOT NULL;
CREATE TABLE directory_imports (
 id uuid PRIMARY KEY, school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL, class_id uuid NOT NULL, class_revision integer NOT NULL,
 revision integer NOT NULL DEFAULT 1, expires_at timestamptz NOT NULL,
 preview jsonb NOT NULL, committed_result jsonb,
 FOREIGN KEY(school_id,actor_id) REFERENCES users(school_id,id),
 FOREIGN KEY(school_id,class_id) REFERENCES classes(school_id,id)
);
ALTER TABLE audit_events ADD COLUMN target_label text;
ALTER TABLE audit_events ADD COLUMN actor_name text;
ALTER TABLE directory_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE directory_imports FORCE ROW LEVEL SECURITY;
REVOKE ALL ON directory_imports FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON directory_imports TO nexora_runtime;
CREATE POLICY tenant_isolation ON directory_imports TO nexora_runtime
 USING(school_id=NULLIF(current_setting('app.current_school_id',true),'')::uuid)
 WITH CHECK(school_id=NULLIF(current_setting('app.current_school_id',true),'')::uuid);
