-- School opt-in and durable generation requests. Existing uploads stay unchanged.
CREATE TABLE school_ai_exam_settings (
 school_id uuid PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT false,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0)
);
ALTER TABLE school_ai_exam_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_ai_exam_settings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON school_ai_exam_settings FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON school_ai_exam_settings TO nexora_runtime;
CREATE POLICY tenant_isolation ON school_ai_exam_settings TO nexora_runtime
 USING(school_id=NULLIF(current_setting('app.current_school_id',true),'')::uuid)
 WITH CHECK(school_id=NULLIF(current_setting('app.current_school_id',true),'')::uuid);
ALTER TABLE import_jobs ADD COLUMN generation_request jsonb;
ALTER TABLE import_jobs ADD COLUMN generation_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE import_jobs ADD COLUMN generation_model text;
ALTER TABLE import_jobs ADD COLUMN generation_input_tokens integer NOT NULL DEFAULT 0;
ALTER TABLE import_jobs ADD COLUMN generation_output_tokens integer NOT NULL DEFAULT 0;
ALTER TABLE import_jobs ADD COLUMN generation_policy_revision integer;
ALTER TABLE import_jobs ADD COLUMN generation_prompt_version text;
ALTER TABLE import_jobs ADD COLUMN generation_output jsonb;
