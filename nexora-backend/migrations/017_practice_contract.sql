ALTER TABLE practice_access ALTER COLUMN release_at DROP NOT NULL;
ALTER TABLE practice_access ADD COLUMN revision integer NOT NULL DEFAULT 1;
ALTER TABLE practice_attempts ADD COLUMN valid boolean NOT NULL DEFAULT true;
ALTER TABLE practice_summaries ALTER COLUMN best_percent TYPE numeric;
CREATE TABLE practice_access_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
 exam_version_id uuid NOT NULL,actor_id uuid NOT NULL,actor_name text NOT NULL,
 enabled boolean NOT NULL,release_at timestamptz,reason text NOT NULL,at timestamptz NOT NULL,
 FOREIGN KEY(school_id,exam_version_id) REFERENCES exam_versions(school_id,id) ON DELETE CASCADE,
 FOREIGN KEY(school_id,actor_id) REFERENCES users(school_id,id) ON DELETE CASCADE
);
ALTER TABLE practice_access_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_access_history FORCE ROW LEVEL SECURITY;
REVOKE ALL ON practice_access_history FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON practice_access_history TO nexora_runtime;
CREATE POLICY tenant_isolation ON practice_access_history TO nexora_runtime
 USING(school_id=NULLIF(current_setting('app.current_school_id',true),'')::uuid)
 WITH CHECK(school_id=NULLIF(current_setting('app.current_school_id',true),'')::uuid);
