-- Expose only a bounded page of active school identities to the trusted worker runtime.
-- Processing remains tenant scoped; no table-wide runtime SELECT or RLS bypass is added.
CREATE FUNCTION public.nexora_worker_schools(p_after uuid DEFAULT NULL)
RETURNS TABLE(id uuid) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog AS $$
 SELECT s.id FROM public.schools s
 WHERE s.status='active' AND (p_after IS NULL OR s.id>p_after)
 ORDER BY s.id LIMIT 2
$$;
ALTER FUNCTION public.nexora_worker_schools(uuid) OWNER TO nexora_platform_ops;
REVOKE ALL ON FUNCTION public.nexora_worker_schools(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nexora_worker_schools(uuid) TO nexora_runtime;
