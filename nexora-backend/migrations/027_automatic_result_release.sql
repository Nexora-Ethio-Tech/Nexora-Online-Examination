-- System publications have no human approver. Existing signed publications remain intact.
ALTER TABLE result_publications ALTER COLUMN approved_by DROP NOT NULL;
ALTER TABLE result_publications ADD COLUMN automatic boolean NOT NULL DEFAULT false;
ALTER TABLE result_publications ADD CONSTRAINT result_publications_actor_check CHECK (approved_by IS NOT NULL OR automatic);
-- Preserve existing future release commitments when moving to scheduled release.
UPDATE exam_sessions s SET planned_results_release_at=GREATEST(s.planned_results_release_at,p.release_at)
FROM (SELECT school_id,session_id,max(results_release_at) release_at FROM result_publications GROUP BY school_id,session_id) p
WHERE s.school_id=p.school_id AND s.id=p.session_id;
