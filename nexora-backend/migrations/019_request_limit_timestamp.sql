-- CURRENT_TIME is a PostgreSQL keyword of type timetz; avoid it as a variable name.
CREATE OR REPLACE FUNCTION nexora_take_request_limit(p_bucket text,p_limit integer,p_seconds integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE started timestamptz; used integer; v_now timestamptz := clock_timestamp();
BEGIN
 IF p_bucket !~ '^[a-f0-9]{64}$' OR p_limit<1 OR p_limit>1000 OR p_seconds<1 OR p_seconds>3600 THEN RAISE EXCEPTION 'Invalid request limit'; END IF;
 INSERT INTO public.request_limits(bucket,window_start,count) VALUES(p_bucket,v_now,1)
 ON CONFLICT(bucket) DO UPDATE SET
 count=CASE WHEN public.request_limits.window_start+make_interval(secs=>p_seconds)<=v_now THEN 1 ELSE LEAST(public.request_limits.count+1,p_limit+1) END,
 window_start=CASE WHEN public.request_limits.window_start+make_interval(secs=>p_seconds)<=v_now THEN v_now ELSE public.request_limits.window_start END
 RETURNING window_start,count INTO started,used;
 IF used<=p_limit THEN RETURN 0; END IF;
 RETURN GREATEST(1,ceil(extract(epoch FROM started+make_interval(secs=>p_seconds)-v_now))::integer);
END $$;
REVOKE ALL ON FUNCTION nexora_take_request_limit(text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION nexora_take_request_limit(text,integer,integer) TO nexora_runtime;

