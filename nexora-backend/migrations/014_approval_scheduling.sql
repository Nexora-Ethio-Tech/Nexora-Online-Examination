ALTER TABLE exam_versions ADD COLUMN frozen_metadata jsonb;
ALTER TABLE exam_sessions ADD COLUMN planned_results_release_at timestamptz;
ALTER TABLE exam_sessions ADD COLUMN results_revision integer NOT NULL DEFAULT 1;
ALTER TABLE session_roster ADD COLUMN last_accommodation_change jsonb;
ALTER TABLE practice_access ADD COLUMN released_at timestamptz;
CREATE TABLE package_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
 exam_version_id uuid NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','ready','failed')),
 lease_token uuid,lease_until timestamptz,error_message text,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,exam_version_id),FOREIGN KEY(school_id,exam_version_id) REFERENCES exam_versions(school_id,id) ON DELETE CASCADE
);
CREATE TABLE exam_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
 exam_id uuid NOT NULL,session_id uuid,actor_id uuid NOT NULL,actor_name text NOT NULL,
 action text NOT NULL,comment text NOT NULL,revision integer NOT NULL,at timestamptz NOT NULL,details jsonb NOT NULL DEFAULT '{}',
 FOREIGN KEY(school_id,exam_id) REFERENCES exams(school_id,id) ON DELETE CASCADE
);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['package_jobs','exam_history'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,anon,authenticated',t);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I TO nexora_runtime',t);
 EXECUTE format('CREATE POLICY tenant_isolation ON %I TO nexora_runtime USING(school_id=NULLIF(current_setting(''app.current_school_id'',true),'''')::uuid) WITH CHECK(school_id=NULLIF(current_setting(''app.current_school_id'',true),'''')::uuid)',t);
 END LOOP; END $$;
REVOKE UPDATE ON exam_history FROM nexora_runtime;
