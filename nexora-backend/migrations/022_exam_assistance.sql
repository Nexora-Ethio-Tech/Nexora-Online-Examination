-- Additive; do not replace either historical 020 migration or the older 021.
ALTER TABLE attempts ADD COLUMN assistance_paused boolean NOT NULL DEFAULT false;

CREATE TABLE sitting_staff_assignments (
  school_id uuid NOT NULL,
  session_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1,
  PRIMARY KEY(school_id, session_id, staff_id),
  FOREIGN KEY(school_id, session_id) REFERENCES exam_sessions(school_id,id),
  FOREIGN KEY(school_id, staff_id) REFERENCES users(school_id,id)
);

CREATE TABLE exam_assistance_requests (
  id uuid NOT NULL,
  school_id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  student_id uuid NOT NULL,
  device_generation integer NOT NULL,
  supervision_revision integer NOT NULL,
  state text NOT NULL CHECK(state IN ('pending','approved','rejected','expired')),
  requested_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  decided_by uuid,
  decided_at timestamptz,
  reason text,
  PRIMARY KEY(school_id,id),
  FOREIGN KEY(school_id,attempt_id) REFERENCES attempts(school_id,id),
  FOREIGN KEY(school_id,student_id) REFERENCES users(school_id,id),
  FOREIGN KEY(school_id,decided_by) REFERENCES users(school_id,id)
);
CREATE UNIQUE INDEX one_pending_assistance_per_attempt
  ON exam_assistance_requests(school_id,attempt_id) WHERE state='pending';
CREATE INDEX assistance_attempt_history
  ON exam_assistance_requests(school_id,attempt_id,requested_at DESC);

ALTER TABLE sitting_staff_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sitting_staff_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE exam_assistance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_assistance_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sitting_staff_assignments,exam_assistance_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON sitting_staff_assignments,exam_assistance_requests TO nexora_runtime;
CREATE POLICY sitting_staff_tenant ON sitting_staff_assignments TO nexora_runtime
  USING(school_id=NULLIF(current_setting('app.current_school_id',true),'')::uuid)
  WITH CHECK(school_id=NULLIF(current_setting('app.current_school_id',true),'')::uuid);
CREATE POLICY assistance_tenant ON exam_assistance_requests TO nexora_runtime
  USING(school_id=NULLIF(current_setting('app.current_school_id',true),'')::uuid)
  WITH CHECK(school_id=NULLIF(current_setting('app.current_school_id',true),'')::uuid);
