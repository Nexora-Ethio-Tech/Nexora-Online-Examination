-- The authoring worker's detailed lifecycle is import_jobs.state, not legacy status.
GRANT SELECT(state) ON public.import_jobs TO nexora_platform;
