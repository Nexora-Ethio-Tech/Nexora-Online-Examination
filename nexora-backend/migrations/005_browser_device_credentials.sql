-- A browser credential is shared across authenticated student enrollments.
CREATE TABLE browser_devices (
    device_id TEXT PRIMARY KEY,
    credential_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ambiguous legacy credentials fail closed without deleting exam evidence.
INSERT INTO browser_devices (device_id, credential_hash, expires_at, revoked_at, created_at)
SELECT device_id,
       MIN(credential_hash),
       MIN(created_at) + INTERVAL '30 days',
       CASE WHEN COUNT(DISTINCT credential_hash) > 1 THEN NOW() ELSE NULL END,
       MIN(created_at)
FROM device_bindings
GROUP BY device_id;

ALTER TABLE device_bindings
    ADD CONSTRAINT fk_device_bindings_browser
    FOREIGN KEY (device_id) REFERENCES browser_devices(device_id);
