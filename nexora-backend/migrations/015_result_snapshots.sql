CREATE TABLE result_snapshots (
 school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
 session_id uuid NOT NULL,revision integer NOT NULL,source jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(school_id,session_id,revision),
 FOREIGN KEY(school_id,session_id) REFERENCES exam_sessions(school_id,id) ON DELETE CASCADE
);
ALTER TABLE result_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE result_snapshots FORCE ROW LEVEL SECURITY;
REVOKE ALL ON result_snapshots FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON result_snapshots TO nexora_runtime;
CREATE POLICY tenant_isolation ON result_snapshots TO nexora_runtime
 USING(school_id=NULLIF(current_setting('app.current_school_id',true),'')::uuid)
 WITH CHECK(school_id=NULLIF(current_setting('app.current_school_id',true),'')::uuid);
ALTER TABLE result_publications ADD COLUMN reason text;
ALTER TABLE result_publications ADD COLUMN actor_name text;
ALTER TABLE result_publications ADD COLUMN report_snapshot jsonb;
ALTER TABLE recovery_uploads ADD COLUMN decision_result_revision integer;
