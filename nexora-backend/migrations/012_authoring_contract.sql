-- Reconcile the historical authoring migration present on the hosted database
-- but absent from the repository, and add durable source/review evidence.
ALTER TABLE exams ADD COLUMN IF NOT EXISTS assignment_id uuid;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';
ALTER TABLE exams ADD COLUMN IF NOT EXISTS ordering text NOT NULL DEFAULT 'fixed';
ALTER TABLE exams ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';
ALTER TABLE exams ADD COLUMN IF NOT EXISTS import_id uuid;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS return_comment text;
ALTER TABLE exams ALTER COLUMN pass_percent TYPE numeric USING pass_percent::numeric;
ALTER TABLE exam_items ALTER COLUMN exam_version_id DROP NOT NULL;
ALTER TABLE exam_items ADD COLUMN IF NOT EXISTS exam_id uuid;
ALTER TABLE exam_items ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE exam_items ADD COLUMN IF NOT EXISTS primary_topic text NOT NULL DEFAULT '';
ALTER TABLE exam_items ADD COLUMN IF NOT EXISTS key_consistent boolean;
ALTER TABLE exam_items ADD COLUMN IF NOT EXISTS review_flags jsonb NOT NULL DEFAULT '[]';
ALTER TABLE exam_items ADD COLUMN IF NOT EXISTS reviewed boolean NOT NULL DEFAULT false;
ALTER TABLE exam_items ADD COLUMN IF NOT EXISTS review_note text NOT NULL DEFAULT '';
ALTER TABLE exam_items ADD COLUMN reviewed_by uuid;
ALTER TABLE exam_items ADD COLUMN reviewed_at timestamptz;
ALTER TABLE exam_items ADD COLUMN ai_input_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS draft_item_identity ON exam_items(school_id,exam_id,item_id) WHERE exam_version_id IS NULL;
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'queued';
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS parsed_count integer NOT NULL DEFAULT 0;
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS completed_count integer NOT NULL DEFAULT 0;
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS source_name text;
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS source_sha256 text NOT NULL DEFAULT '';
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS failure text;
ALTER TABLE import_jobs ADD COLUMN source_bytes bytea;
ALTER TABLE import_jobs ADD COLUMN lease_token uuid;
ALTER TABLE ai_jobs ADD COLUMN item_id text;
ALTER TABLE ai_jobs ADD COLUMN lease_token uuid;
ALTER TABLE ai_jobs ADD COLUMN provider_model text;
ALTER TABLE ai_jobs ADD COLUMN prompt_version text;
ALTER TABLE ai_jobs ADD COLUMN taxonomy_revision text;
ALTER TABLE ai_jobs ADD COLUMN input_tokens integer NOT NULL DEFAULT 0;
ALTER TABLE ai_jobs ADD COLUMN output_tokens integer NOT NULL DEFAULT 0;
CREATE TABLE authoring_snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
 exam_id uuid NOT NULL,revision integer NOT NULL,actor_id uuid NOT NULL,
 kind text NOT NULL,content jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(school_id,exam_id) REFERENCES exams(school_id,id) ON DELETE CASCADE
);
ALTER TABLE authoring_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE authoring_snapshots FORCE ROW LEVEL SECURITY;
REVOKE ALL ON authoring_snapshots FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON authoring_snapshots TO nexora_runtime;
CREATE POLICY tenant_isolation ON authoring_snapshots TO nexora_runtime
 USING(school_id=NULLIF(current_setting('app.current_school_id',true),'')::uuid)
 WITH CHECK(school_id=NULLIF(current_setting('app.current_school_id',true),'')::uuid);
