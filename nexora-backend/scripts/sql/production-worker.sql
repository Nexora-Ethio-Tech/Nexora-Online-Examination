-- Operator-installed Supabase infrastructure, not a portable application migration.
-- Requires pg_net and Vault. Install as the protected database operator only.
CREATE SCHEMA IF NOT EXISTS nexora_worker_ops;
REVOKE ALL ON SCHEMA nexora_worker_ops FROM PUBLIC;

CREATE TABLE IF NOT EXISTS nexora_worker_ops.scheduler (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  endpoint text NOT NULL CHECK (endpoint ~ '^https://[^/]+/api/v1/internal/import-worker$'),
  secret_id uuid NOT NULL,
  cursor_school uuid,
  request_id bigint,
  dispatch_nonce uuid,
  claimed boolean NOT NULL DEFAULT false,
  dispatched_at timestamptz,
  checked_at timestamptz,
  last_http_status integer,
  last_result text,
  successful_requests bigint NOT NULL DEFAULT 0,
  failed_requests bigint NOT NULL DEFAULT 0
);
REVOKE ALL ON nexora_worker_ops.scheduler FROM PUBLIC;

CREATE OR REPLACE FUNCTION nexora_worker_ops.tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  cfg nexora_worker_ops.scheduler%ROWTYPE;
  response record;
  school uuid;
  bearer text;
  new_request bigint;
  nonce uuid;
  epoch text;
  signature text;
BEGIN
  -- A single in-flight HTTP request bounds concurrency across all schools.
  SELECT * INTO cfg FROM nexora_worker_ops.scheduler WHERE singleton FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR NOT cfg.enabled THEN RETURN; END IF;
  UPDATE nexora_worker_ops.scheduler SET checked_at = clock_timestamp() WHERE singleton;
  IF cfg.request_id IS NOT NULL THEN
    SELECT status_code, timed_out, error_msg INTO response
      FROM net._http_response WHERE id = cfg.request_id;
    IF NOT FOUND THEN
      -- Lost pg_net responses (including an extension restart) must not stall forever.
      IF cfg.dispatched_at > clock_timestamp() - interval '3 minutes' THEN RETURN; END IF;
      UPDATE nexora_worker_ops.scheduler SET failed_requests = failed_requests + 1,
        last_http_status = NULL, last_result = 'response_missing', request_id = NULL WHERE singleton;
    ELSE
      UPDATE nexora_worker_ops.scheduler SET
        last_http_status = response.status_code,
        last_result = CASE WHEN response.status_code = 200 AND NOT coalesce(response.timed_out, false)
          AND response.error_msg IS NULL THEN 'worker_completed' ELSE 'worker_http_failed' END,
        successful_requests = successful_requests + CASE WHEN response.status_code = 200
          AND NOT coalesce(response.timed_out, false) AND response.error_msg IS NULL THEN 1 ELSE 0 END,
        failed_requests = failed_requests + CASE WHEN response.status_code = 200
          AND NOT coalesce(response.timed_out, false) AND response.error_msg IS NULL THEN 0 ELSE 1 END,
        request_id = NULL WHERE singleton;
      -- Do not retain HTTP bodies/headers in our operational records.
      DELETE FROM net._http_response WHERE id = cfg.request_id;
    END IF;
  END IF;

  -- Round-robin over active schools with eligible work. New schools need no configuration.
  SELECT s.id INTO school FROM public.schools s WHERE s.status = 'active' AND (
    EXISTS (SELECT 1 FROM public.import_jobs j JOIN public.exams e
      ON e.school_id = j.school_id AND e.id = j.exam_id AND e.import_id = j.id
      WHERE j.school_id = s.id AND e.state IN ('draft', 'returned') AND
        (j.state = 'queued' OR (j.state = 'parsing' AND j.lease_until < now())))
    OR EXISTS (SELECT 1 FROM public.ai_jobs a JOIN public.import_jobs j
      ON j.school_id = a.school_id AND j.id = a.import_job_id JOIN public.exams e
      ON e.school_id = j.school_id AND e.id = j.exam_id AND e.import_id = j.id
      WHERE a.school_id = s.id AND e.state IN ('draft', 'returned')
        AND j.state IN ('ai_queued', 'ai_running') AND
        ((a.status = 'pending' AND (a.retry_at IS NULL OR a.retry_at <= now()))
          OR (a.status = 'processing' AND a.lease_until < now())))
    OR EXISTS (SELECT 1 FROM public.package_jobs p WHERE p.school_id = s.id
      AND (p.status = 'pending' OR (p.status = 'processing' AND p.lease_until < now())))
  ) ORDER BY CASE WHEN cfg.cursor_school IS NULL OR s.id > cfg.cursor_school THEN 0 ELSE 1 END,
      s.id LIMIT 1;
  IF school IS NULL THEN RETURN; END IF;
  SELECT decrypted_secret INTO bearer FROM vault.decrypted_secrets WHERE id = cfg.secret_id;
  IF bearer IS NULL OR length(bearer) < 32 THEN
    UPDATE nexora_worker_ops.scheduler SET enabled = false, last_result = 'secret_unavailable'
      WHERE singleton;
    RETURN;
  END IF;
  nonce := gen_random_uuid();
  epoch := floor(extract(epoch FROM clock_timestamp()))::bigint::text;
  signature := encode(extensions.hmac(convert_to('nexora-worker-v1' || E'\n' || school::text || E'\n'
    || nonce::text || E'\n' || epoch, 'UTF8'), convert_to(bearer, 'UTF8'), 'sha256'), 'hex');
  SELECT net.http_post(url := cfg.endpoint,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Nexora-HMAC ' || signature,
      'x-nexora-worker-time', epoch, 'x-nexora-worker-nonce', nonce),
    body := jsonb_build_object('schoolId', school), timeout_milliseconds := 120000) INTO new_request;
  UPDATE nexora_worker_ops.scheduler SET cursor_school = school, request_id = new_request,
    dispatch_nonce = nonce, claimed = false,
    dispatched_at = clock_timestamp() WHERE singleton;
END;
$$;
REVOKE ALL ON FUNCTION nexora_worker_ops.tick() FROM PUBLIC;

-- Runtime can consume exactly the currently issued school-bound dispatch, never read its secret.
CREATE OR REPLACE FUNCTION public.nexora_claim_worker_dispatch(p_school uuid, p_nonce uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  UPDATE nexora_worker_ops.scheduler SET claimed = true
    WHERE singleton AND enabled AND NOT claimed AND cursor_school = p_school
      AND dispatch_nonce = p_nonce AND request_id IS NOT NULL
      AND dispatched_at > clock_timestamp() - interval '90 seconds';
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.nexora_claim_worker_dispatch(uuid,uuid) FROM PUBLIC;
