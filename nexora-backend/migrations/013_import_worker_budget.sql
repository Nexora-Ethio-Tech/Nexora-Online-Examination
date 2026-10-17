ALTER TABLE import_jobs ADD COLUMN ai_reserved_tokens integer NOT NULL DEFAULT 0 CHECK(ai_reserved_tokens>=0);
ALTER TABLE ai_jobs ADD COLUMN reserved_tokens integer NOT NULL DEFAULT 0 CHECK(reserved_tokens>=0);
