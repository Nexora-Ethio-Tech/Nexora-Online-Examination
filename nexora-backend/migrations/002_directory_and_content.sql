-- Migration 002: Directory and Content
-- Classes & Subjects
CREATE TABLE IF NOT EXISTS classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code_or_year TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_classes_school_id UNIQUE (school_id, id)
);

CREATE TABLE IF NOT EXISTS subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_subjects_school_id UNIQUE (school_id, id)
);

-- Enrollments (student -> class)
CREATE TABLE IF NOT EXISTS enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL,
    class_id UUID NOT NULL,
    academic_year TEXT NOT NULL DEFAULT '2026',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_enrollments_student FOREIGN KEY (school_id, student_id) REFERENCES users(school_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_enrollments_class FOREIGN KEY (school_id, class_id) REFERENCES classes(school_id, id) ON DELETE CASCADE,
    CONSTRAINT uq_enrollments_student_class UNIQUE (school_id, student_id, class_id)
);

-- Teacher Assignments (teacher -> class + subject)
CREATE TABLE IF NOT EXISTS teacher_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL,
    class_id UUID NOT NULL,
    subject_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_teacher_assignments_teacher FOREIGN KEY (school_id, teacher_id) REFERENCES users(school_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_teacher_assignments_class FOREIGN KEY (school_id, class_id) REFERENCES classes(school_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_teacher_assignments_subject FOREIGN KEY (school_id, subject_id) REFERENCES subjects(school_id, id) ON DELETE CASCADE,
    CONSTRAINT uq_teacher_assignments UNIQUE (school_id, teacher_id, class_id, subject_id)
);

-- Topics
CREATE TABLE IF NOT EXISTS topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL,
    normalized_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_topics_subject FOREIGN KEY (school_id, subject_id) REFERENCES subjects(school_id, id) ON DELETE CASCADE,
    CONSTRAINT uq_topics_school_subject_name UNIQUE (school_id, subject_id, normalized_name)
);

-- Exams
CREATE TABLE IF NOT EXISTS exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL,
    title TEXT NOT NULL,
    subject_id UUID NOT NULL,
    class_id UUID NOT NULL,
    instructions TEXT NOT NULL DEFAULT '',
    duration_minutes INT NOT NULL DEFAULT 60,
    pass_percent INT NOT NULL DEFAULT 50,
    state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'pending_approval', 'approved', 'returned')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_exams_school_id UNIQUE (school_id, id),
    CONSTRAINT fk_exams_owner FOREIGN KEY (school_id, owner_id) REFERENCES users(school_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_exams_subject FOREIGN KEY (school_id, subject_id) REFERENCES subjects(school_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_exams_class FOREIGN KEY (school_id, class_id) REFERENCES classes(school_id, id) ON DELETE CASCADE
);

-- Exam Versions (Immutable once approved)
CREATE TABLE IF NOT EXISTS exam_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    exam_id UUID NOT NULL,
    version INT NOT NULL DEFAULT 1,
    approved_by UUID NULL,
    approved_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_exam_versions_school_id UNIQUE (school_id, id),
    CONSTRAINT fk_exam_versions_exam FOREIGN KEY (school_id, exam_id) REFERENCES exams(school_id, id) ON DELETE CASCADE,
    CONSTRAINT uq_exam_version_num UNIQUE (school_id, exam_id, version)
);

-- Exam Items
CREATE TABLE IF NOT EXISTS exam_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    exam_version_id UUID NOT NULL,
    item_id TEXT NOT NULL, -- e.g. 'q1'
    position INT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('mcq_single', 'true_false')),
    stem TEXT NOT NULL,
    options JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{id, text}]
    correct_key TEXT NOT NULL,
    marks INT NOT NULL DEFAULT 1,
    primary_topic_id UUID NULL,
    secondary_topics JSONB NOT NULL DEFAULT '[]'::jsonb,
    explanation TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_exam_items_version FOREIGN KEY (school_id, exam_version_id) REFERENCES exam_versions(school_id, id) ON DELETE CASCADE,
    CONSTRAINT uq_exam_items_version_item UNIQUE (school_id, exam_version_id, item_id)
);

-- Exam Packages (Encrypted student payload)
CREATE TABLE IF NOT EXISTS exam_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    exam_version_id UUID NOT NULL,
    algorithm TEXT NOT NULL DEFAULT 'AES-GCM',
    iv_base64url TEXT NOT NULL,
    ciphertext_base64url TEXT NOT NULL,
    sha256_hex TEXT NOT NULL,
    key_enc TEXT NOT NULL, -- Protected AES-256 key (base64url)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_exam_packages_version FOREIGN KEY (school_id, exam_version_id) REFERENCES exam_versions(school_id, id) ON DELETE CASCADE,
    CONSTRAINT uq_exam_packages_version UNIQUE (school_id, exam_version_id)
);

-- Row-Level Security
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes FORCE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects FORCE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments FORCE ROW LEVEL SECURITY;
ALTER TABLE teacher_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics FORCE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams FORCE ROW LEVEL SECURITY;
ALTER TABLE exam_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE exam_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_items FORCE ROW LEVEL SECURITY;
ALTER TABLE exam_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_packages FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_classes ON classes
    USING (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
    WITH CHECK (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);

CREATE POLICY tenant_isolation_subjects ON subjects
    USING (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
    WITH CHECK (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);

CREATE POLICY tenant_isolation_enrollments ON enrollments
    USING (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
    WITH CHECK (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);

CREATE POLICY tenant_isolation_teacher_assignments ON teacher_assignments
    USING (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
    WITH CHECK (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);

CREATE POLICY tenant_isolation_topics ON topics
    USING (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
    WITH CHECK (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);

CREATE POLICY tenant_isolation_exams ON exams
    USING (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
    WITH CHECK (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);

CREATE POLICY tenant_isolation_exam_versions ON exam_versions
    USING (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
    WITH CHECK (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);

CREATE POLICY tenant_isolation_exam_items ON exam_items
    USING (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
    WITH CHECK (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);

CREATE POLICY tenant_isolation_exam_packages ON exam_packages
    USING (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
    WITH CHECK (current_setting('app.is_migration_or_admin', true) = 'true' OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);
