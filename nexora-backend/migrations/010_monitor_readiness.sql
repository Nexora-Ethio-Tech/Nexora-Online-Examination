-- Additive operational metadata; preserve all answer and receipt evidence.
ALTER TABLE attempts ADD COLUMN last_contact_at timestamptz;
ALTER TABLE attempts ADD COLUMN current_readiness jsonb;
CREATE TABLE device_transfer_events (
 id uuid PRIMARY KEY, school_id uuid NOT NULL REFERENCES schools(id),
 attempt_id uuid NOT NULL, actor_id uuid NOT NULL, actor_name text NOT NULL,
 reason text NOT NULL, transferred_at timestamptz NOT NULL,
 from_generation integer NOT NULL, to_generation integer NOT NULL,
 old_device_id text NOT NULL, new_device_id text NOT NULL,
 FOREIGN KEY (school_id, attempt_id) REFERENCES attempts(school_id,id),
 FOREIGN KEY (school_id, actor_id) REFERENCES users(school_id,id)
);
ALTER TABLE device_transfer_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_transfer_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON device_transfer_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON device_transfer_events TO nexora_runtime;
CREATE POLICY tenant_isolation ON device_transfer_events TO nexora_runtime
 USING (school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
 WITH CHECK (school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);
CREATE INDEX device_transfer_history ON device_transfer_events(school_id,attempt_id,transferred_at DESC,id);
