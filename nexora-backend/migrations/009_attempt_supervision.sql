ALTER TABLE attempts ADD COLUMN suspended BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE attempts ADD COLUMN supervision_revision INTEGER NOT NULL DEFAULT 0;
CREATE TABLE attempt_supervision_events (
  school_id UUID NOT NULL REFERENCES schools(id), attempt_id UUID NOT NULL,
  id UUID NOT NULL, actor_id UUID NOT NULL, payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (school_id, attempt_id, id),
  FOREIGN KEY (school_id, attempt_id) REFERENCES attempts(school_id, id),
  FOREIGN KEY (school_id, actor_id) REFERENCES users(school_id, id)
);
ALTER TABLE attempt_supervision_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempt_supervision_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON attempt_supervision_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON attempt_supervision_events TO nexora_runtime;
CREATE POLICY tenant_isolation ON attempt_supervision_events TO nexora_runtime
  USING (school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
  WITH CHECK (school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);
