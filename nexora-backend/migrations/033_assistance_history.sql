ALTER TABLE public.exam_assistance_requests ADD COLUMN interruption_kind text NOT NULL DEFAULT 'manual';
CREATE INDEX assistance_audit_resource ON public.audit_events(school_id,resource_id,server_at) WHERE action IN ('assistance_approved','assistance_rejected','assistance_mfa_failed');
