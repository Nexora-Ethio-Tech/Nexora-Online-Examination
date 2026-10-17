-- Historical uploads remain nullable: their original comparison cannot be reconstructed reliably.
ALTER TABLE recovery_uploads ADD COLUMN generation_at_upload integer;
ALTER TABLE recovery_uploads ADD COLUMN timely_evidence jsonb;
