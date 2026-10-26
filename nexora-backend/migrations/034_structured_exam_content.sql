-- Additive: historical versions retain their original fields and orders.
ALTER TABLE public.exams ADD COLUMN structure jsonb NOT NULL DEFAULT '{"sections":[],"passages":[]}'::jsonb;
ALTER TABLE public.exam_items ADD COLUMN section_id text;
ALTER TABLE public.exam_items ADD COLUMN passage_id text;
ALTER TABLE public.exam_items ADD COLUMN content jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.exams ADD CONSTRAINT exam_structure_size CHECK (octet_length(structure::text)<=4194304);
ALTER TABLE public.exam_items ADD CONSTRAINT item_content_size CHECK (octet_length(content::text)<=4194304);
