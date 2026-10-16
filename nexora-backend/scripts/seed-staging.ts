import { Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { databasePoolConfig, loadBackendEnvironment } from '../src/common/db/database-config';
import { hashPassword } from '../src/common/crypto/password';
import { encryptExamPackage } from '../src/common/crypto/package-cipher';

loadBackendEnvironment();
const logger = new Logger('seed-staging');

async function seedStaging() {
  const pool = new Pool(databasePoolConfig('migration'));

  const client = await pool.connect();

  try {
    logger.log('[Seed] Connecting to database...');
    await client.query('BEGIN');
    await client.query(`SET LOCAL app.is_migration_or_admin = 'true';`);

    logger.log('[Seed] Seeding School 1: Hillside Academy...');
    const school1Res = await client.query(`
      INSERT INTO schools (id, name, slug, timezone, status)
      VALUES ('11111111-1111-4111-8111-111111111111', 'Hillside Academy', 'hillside', 'Africa/Addis_Ababa', 'active')
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `);
    const school1Id = school1Res.rows[0].id;

    logger.log('[Seed] Seeding School 2: St. Mary Academy (For tenant isolation verification)...');
    const school2Res = await client.query(`
      INSERT INTO schools (id, name, slug, timezone, status)
      VALUES ('22222222-2222-4222-8222-222222222222', 'St. Mary Academy', 'stmary', 'Africa/Addis_Ababa', 'active')
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `);
    const school2Id = school2Res.rows[0].id;

    // Default password hash for seed users
    const adminPassHash = await hashPassword('AdminPass123!');
    const teacherPassHash = await hashPassword('TeacherPass123!');
    const studentPassHash = await hashPassword('StudentPass123!');

    // Base32 TOTP secret for admin: 'JBSWY3DPEHPK3PXP'
    const adminMfaSecret = 'JBSWY3DPEHPK3PXP';

    logger.log('[Seed] Seeding Users for School 1...');
    // School 1 Admin
    await client.query(
      `
      INSERT INTO users (id, school_id, login_id, display_name, role, password_hash, mfa_secret_enc, status)
      VALUES ('11111111-aaaa-4111-8111-111111111111', $1, 'HILL-ADM01', 'Hillside Admin', 'school_admin', $2, $3, 'active')
      ON CONFLICT (login_id) DO UPDATE SET password_hash = EXCLUDED.password_hash;
    `,
      [school1Id, adminPassHash, adminMfaSecret],
    );

    // School 1 Teacher
    const teacher1Res = await client.query(
      `
      INSERT INTO users (id, school_id, login_id, display_name, role, password_hash, status)
      VALUES ('11111111-bbbb-4111-8111-111111111111', $1, 'HILL-TCH01', 'Teacher Abebe', 'teacher', $2, 'active')
      ON CONFLICT (login_id) DO UPDATE SET password_hash = EXCLUDED.password_hash
      RETURNING id;
    `,
      [school1Id, teacherPassHash],
    );
    const teacher1Id = teacher1Res.rows[0].id;

    // School 1 Students
    const student1Res = await client.query(
      `
      INSERT INTO users (id, school_id, login_id, display_name, role, password_hash, status)
      VALUES ('11111111-cccc-4111-8111-111111111111', $1, 'HILL-STU01', 'Kebede Bekele', 'student', $2, 'active')
      ON CONFLICT (login_id) DO UPDATE SET password_hash = EXCLUDED.password_hash
      RETURNING id;
    `,
      [school1Id, studentPassHash],
    );
    const student1Id = student1Res.rows[0].id;

    const student2Res = await client.query(
      `
      INSERT INTO users (id, school_id, login_id, display_name, role, password_hash, status)
      VALUES ('11111111-dddd-4111-8111-111111111111', $1, 'HILL-STU02', 'Almaz Ayana', 'student', $2, 'active')
      ON CONFLICT (login_id) DO UPDATE SET password_hash = EXCLUDED.password_hash
      RETURNING id;
    `,
      [school1Id, studentPassHash],
    );
    const student2Id = student2Res.rows[0].id;

    logger.log('[Seed] Seeding Users for School 2...');
    // School 2 Admin
    await client.query(
      `
      INSERT INTO users (id, school_id, login_id, display_name, role, password_hash, mfa_secret_enc, status)
      VALUES ('22222222-aaaa-4222-8222-222222222222', $1, 'MARY-ADM01', 'St Mary Admin', 'school_admin', $2, $3, 'active')
      ON CONFLICT (login_id) DO UPDATE SET password_hash = EXCLUDED.password_hash;
    `,
      [school2Id, adminPassHash, adminMfaSecret],
    );

    // School 2 Student
    await client.query(
      `
      INSERT INTO users (id, school_id, login_id, display_name, role, password_hash, status)
      VALUES ('22222222-cccc-4222-8222-222222222222', $1, 'MARY-STU01', 'Dawit Tsige', 'student', $2, 'active')
      ON CONFLICT (login_id) DO UPDATE SET password_hash = EXCLUDED.password_hash;
    `,
      [school2Id, studentPassHash],
    );

    // Class and Subject in School 1
    const classRes = await client.query(
      `
      INSERT INTO classes (id, school_id, name, code_or_year)
      VALUES ('11111111-1111-4111-8111-c00000000001', $1, 'Grade 10A', '2026')
      ON CONFLICT (school_id, id) DO NOTHING
      RETURNING id;
    `,
      [school1Id],
    );
    const classId = classRes.rows[0]?.id || '11111111-1111-4111-8111-c00000000001';

    const subjectRes = await client.query(
      `
      INSERT INTO subjects (id, school_id, name, code)
      VALUES ('11111111-1111-4111-8111-b00000000001', $1, 'Mathematics', 'MATH-10')
      ON CONFLICT (school_id, id) DO NOTHING
      RETURNING id;
    `,
      [school1Id],
    );
    const subjectId = subjectRes.rows[0]?.id || '11111111-1111-4111-8111-b00000000001';

    // Enroll students in class
    await client.query(
      `
      INSERT INTO enrollments (school_id, student_id, class_id, academic_year)
      VALUES ($1, $2, $3, '2026'), ($1, $4, $3, '2026')
      ON CONFLICT (school_id, student_id, class_id) DO NOTHING;
    `,
      [school1Id, student1Id, classId, student2Id],
    );

    // Topic
    const topicRes = await client.query(
      `
      INSERT INTO topics (id, school_id, subject_id, normalized_name)
      VALUES ('11111111-1111-4111-8111-a00000000001', $1, $2, 'Linear Equations')
      ON CONFLICT (school_id, subject_id, normalized_name) DO NOTHING
      RETURNING id;
    `,
      [school1Id, subjectId],
    );
    const topicId = topicRes.rows[0]?.id || '11111111-1111-4111-8111-a00000000001';

    logger.log('[Seed] Seeding Approved Exam & 10 Objective Questions (20 marks)...');
    const examRes = await client.query(
      `
      INSERT INTO exams (id, school_id, owner_id, title, subject_id, class_id, instructions, duration_minutes, pass_percent, state)
      VALUES ('11111111-eeee-4111-8111-111111111111', $1, $2, 'Grade 10 Mathematics Midterm', $3, $4, 'Answer all questions. Calculators allowed.', 60, 50, 'approved')
      ON CONFLICT (school_id, id) DO UPDATE SET title = EXCLUDED.title
      RETURNING id;
    `,
      [school1Id, teacher1Id, subjectId, classId],
    );
    const examId = examRes.rows[0].id;

    // Exam Version
    const versionRes = await client.query(
      `
      INSERT INTO exam_versions (id, school_id, exam_id, version, approved_by, approved_at)
      VALUES ('11111111-ffff-4111-8111-111111111111', $1, $2, 1, '11111111-aaaa-4111-8111-111111111111', NOW())
      ON CONFLICT (school_id, exam_id, version) DO UPDATE SET approved_at = EXCLUDED.approved_at
      RETURNING id;
    `,
      [school1Id, examId],
    );
    const versionId = versionRes.rows[0].id;

    // Seed 10 Items: 8 MCQ + 2 True/False (2 marks each = 20 total)
    const items = [
      {
        id: 'q1',
        type: 'mcq_single',
        stem: 'Solve 2x + 3 = 11.',
        options: [
          { id: 'opt_a', text: '2' },
          { id: 'opt_b', text: '4' },
          { id: 'opt_c', text: '5' },
          { id: 'opt_d', text: '7' },
        ],
        correct: 'opt_b',
        explanation: '2x = 8 => x = 4',
      },
      {
        id: 'q2',
        type: 'mcq_single',
        stem: 'What is the slope of y = 3x - 5?',
        options: [
          { id: 'opt_a', text: '3' },
          { id: 'opt_b', text: '-5' },
          { id: 'opt_c', text: '5' },
          { id: 'opt_d', text: '-3' },
        ],
        correct: 'opt_a',
        explanation: 'm = 3',
      },
      {
        id: 'q3',
        type: 'true_false',
        stem: 'A triangle always has 3 interior angles.',
        options: [
          { id: 'true', text: 'True' },
          { id: 'false', text: 'False' },
        ],
        correct: 'true',
        explanation: 'Triangles have 3 sides and 3 angles',
      },
      {
        id: 'q4',
        type: 'mcq_single',
        stem: 'Find x if 5x = 35.',
        options: [
          { id: 'opt_a', text: '5' },
          { id: 'opt_b', text: '6' },
          { id: 'opt_c', text: '7' },
          { id: 'opt_d', text: '8' },
        ],
        correct: 'opt_c',
        explanation: 'x = 35 / 5 = 7',
      },
      {
        id: 'q5',
        type: 'mcq_single',
        stem: 'Simplify: 4(x + 2).',
        options: [
          { id: 'opt_a', text: '4x + 2' },
          { id: 'opt_b', text: '4x + 8' },
          { id: 'opt_c', text: 'x + 8' },
          { id: 'opt_d', text: '8x' },
        ],
        correct: 'opt_b',
        explanation: 'Distribute 4',
      },
      {
        id: 'q6',
        type: 'true_false',
        stem: 'Parallel lines have opposite reciprocal slopes.',
        options: [
          { id: 'true', text: 'True' },
          { id: 'false', text: 'False' },
        ],
        correct: 'false',
        explanation: 'Parallel lines have equal slopes',
      },
      {
        id: 'q7',
        type: 'mcq_single',
        stem: 'Evaluate 3^2 + 4^2.',
        options: [
          { id: 'opt_a', text: '14' },
          { id: 'opt_b', text: '25' },
          { id: 'opt_c', text: '49' },
          { id: 'opt_d', text: '50' },
        ],
        correct: 'opt_b',
        explanation: '9 + 16 = 25',
      },
      {
        id: 'q8',
        type: 'mcq_single',
        stem: 'What is the y-intercept of y = -2x + 7?',
        options: [
          { id: 'opt_a', text: '-2' },
          { id: 'opt_b', text: '2' },
          { id: 'opt_c', text: '7' },
          { id: 'opt_d', text: '-7' },
        ],
        correct: 'opt_c',
        explanation: 'b = 7',
      },
      {
        id: 'q9',
        type: 'mcq_single',
        stem: 'Solve for x: x/3 = 9.',
        options: [
          { id: 'opt_a', text: '3' },
          { id: 'opt_b', text: '12' },
          { id: 'opt_c', text: '27' },
          { id: 'opt_d', text: '81' },
        ],
        correct: 'opt_c',
        explanation: 'x = 9 * 3 = 27',
      },
      {
        id: 'q10',
        type: 'mcq_single',
        stem: 'Which of the following is an irrational number?',
        options: [
          { id: 'opt_a', text: '0.5' },
          { id: 'opt_b', text: '3/4' },
          { id: 'opt_c', text: 'sqrt(2)' },
          { id: 'opt_d', text: '9' },
        ],
        correct: 'opt_c',
        explanation: 'sqrt(2) cannot be written as a fraction',
      },
    ];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      await client.query(
        `
        INSERT INTO exam_items (
          school_id, exam_version_id, item_id, position, type, stem, options, correct_key, marks, primary_topic_id, secondary_topics, explanation
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 2, $9, '[]'::jsonb, $10)
        ON CONFLICT (school_id, exam_version_id, item_id) DO NOTHING;
      `,
        [
          school1Id,
          versionId,
          item.id,
          i + 1,
          item.type,
          item.stem,
          JSON.stringify(item.options),
          item.correct,
          topicId,
          item.explanation,
        ],
      );
    }

    // Encrypt Student Question Package (Excluding keys and explanations)
    const studentPackageAllowlist = {
      examVersion: 1,
      title: 'Grade 10 Mathematics Midterm',
      instructions: 'Answer all questions. Calculators allowed.',
      items: items.map((it) => ({
        itemId: it.id,
        type: it.type,
        stem: it.stem,
        marks: 2,
        options: it.options,
      })),
    };

    const encResult = encryptExamPackage(studentPackageAllowlist);
    await client.query(
      `
      INSERT INTO exam_packages (
        school_id, exam_version_id, algorithm, iv_base64url, ciphertext_base64url, sha256_hex, key_enc
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (school_id, exam_version_id) DO UPDATE SET
        iv_base64url = EXCLUDED.iv_base64url,
        ciphertext_base64url = EXCLUDED.ciphertext_base64url,
        sha256_hex = EXCLUDED.sha256_hex,
        key_enc = EXCLUDED.key_enc;
    `,
      [
        school1Id,
        versionId,
        encResult.algorithm,
        encResult.iv,
        encResult.ciphertext,
        encResult.sha256,
        encResult.keyBase64url,
      ],
    );

    logger.log('[Seed] Seeding Exam Sessions across all phases...');
    const now = new Date();

    // 1. Scheduled phase (starts in 2 hours)
    const schedPrep = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const schedStart = new Date(schedPrep.getTime() + 10 * 60 * 1000);
    const schedEnd = new Date(schedStart.getTime() + 60 * 60 * 1000);
    await client.query(
      `
      INSERT INTO exam_sessions (id, school_id, exam_id, exam_version_id, preparation_visible_at, starts_at, ends_at)
      VALUES ('11111111-9999-4111-8111-000000000001', $1, $2, $3, $4, $5, $6)
      ON CONFLICT (school_id, id) DO NOTHING;
    `,
      [school1Id, examId, versionId, schedPrep, schedStart, schedEnd],
    );

    // 2. Preparing phase (started 5 mins ago, starts in 5 mins)
    const prepPrep = new Date(now.getTime() - 5 * 60 * 1000);
    const prepStart = new Date(prepPrep.getTime() + 10 * 60 * 1000);
    const prepEnd = new Date(prepStart.getTime() + 60 * 60 * 1000);
    const prepSessionRes = await client.query(
      `
      INSERT INTO exam_sessions (id, school_id, exam_id, exam_version_id, preparation_visible_at, starts_at, ends_at)
      VALUES ('11111111-9999-4111-8111-000000000002', $1, $2, $3, $4, $5, $6)
      ON CONFLICT (school_id, id) DO NOTHING
      RETURNING id;
    `,
      [school1Id, examId, versionId, prepPrep, prepStart, prepEnd],
    );
    const prepSessionId = prepSessionRes.rows[0]?.id || '11111111-9999-4111-8111-000000000002';

    // Enroll students into preparing session
    await client.query(
      `
      INSERT INTO session_roster (school_id, session_id, student_id, extra_time_minutes, admission_status)
      VALUES 
        ($1, $2, $3, 0, 'admitted'),
        ($1, $2, $4, 15, 'admitted')
      ON CONFLICT (school_id, session_id, student_id) DO NOTHING;
    `,
      [school1Id, prepSessionId, student1Id, student2Id],
    );

    // 3. Open phase (started 15 mins ago, ends in 45 mins)
    const openPrep = new Date(now.getTime() - 25 * 60 * 1000);
    const openStart = new Date(now.getTime() - 15 * 60 * 1000);
    const openEnd = new Date(openStart.getTime() + 60 * 60 * 1000);
    const openSessionRes = await client.query(
      `
      INSERT INTO exam_sessions (id, school_id, exam_id, exam_version_id, preparation_visible_at, starts_at, ends_at)
      VALUES ('11111111-9999-4111-8111-000000000003', $1, $2, $3, $4, $5, $6)
      ON CONFLICT (school_id, id) DO NOTHING
      RETURNING id;
    `,
      [school1Id, examId, versionId, openPrep, openStart, openEnd],
    );
    const openSessionId = openSessionRes.rows[0]?.id || '11111111-9999-4111-8111-000000000003';

    await client.query(
      `
      INSERT INTO session_roster (school_id, session_id, student_id, extra_time_minutes, admission_status)
      VALUES ($1, $2, $3, 0, 'admitted')
      ON CONFLICT (school_id, session_id, student_id) DO NOTHING;
    `,
      [school1Id, openSessionId, student1Id],
    );

    await client.query('COMMIT');
    logger.log('[Seed] Staging seed completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('[Seed] Seeding failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seedStaging();
