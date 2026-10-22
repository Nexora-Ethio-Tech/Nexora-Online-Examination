-- Additive classification: do not guess grades or split legacy personal names.
ALTER TABLE classes ADD COLUMN grade text CHECK (length(grade) BETWEEN 1 AND 40);
ALTER TABLE classes ADD COLUMN section text CHECK (length(section) BETWEEN 1 AND 40);
ALTER TABLE subjects ADD COLUMN grade text CHECK (length(grade) BETWEEN 1 AND 40);
ALTER TABLE users ADD COLUMN first_name text;
ALTER TABLE users ADD COLUMN father_name text;
ALTER TABLE users ADD COLUMN grandfather_name text;
CREATE INDEX classes_school_grade ON classes(school_id, grade) WHERE active;
CREATE INDEX subjects_school_grade ON subjects(school_id, grade) WHERE active;
