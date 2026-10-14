import type { Item } from '@/features/exams/authoring/schemas';
import type { ResultRow, Report } from '@/features/results/schemas';

export type MarkingInput = {
  studentId: string;
  studentName: string;
  loginId: string;
  attemptId: string | null;
  status: ResultRow['status'];
  answers: { itemId: string; value: string | null }[];
  exclusionReason?: string;
};

// Server simulator only. The production frontend never receives keys or grades answers.
export function markResults(items: Item[], inputs: MarkingInput[], passPercent: number) {
  const maxScore = items.reduce((sum, item) => sum + item.marks, 0);
  const earned = (input: MarkingInput, item: Item) =>
    input.answers.find((a) => a.itemId === item.itemId)?.value === item.correctOptionId
      ? item.marks
      : 0;
  const rows: ResultRow[] = inputs.map((input) => {
    const score =
      input.status === 'finalized'
        ? items.reduce((sum, item) => sum + earned(input, item), 0)
        : null;
    const percent = score === null ? null : (score / maxScore) * 100;
    return {
      studentId: input.studentId,
      studentName: input.studentName,
      loginId: input.loginId,
      attemptId: input.attemptId,
      status: input.status,
      score,
      maxScore,
      percent,
      rank: null,
      passed: percent === null ? null : percent >= passPercent,
      exclusionReason: input.exclusionReason ?? null,
    };
  });
  for (const row of rows) {
    const score = row.score;
    if (score !== null)
      row.rank = 1 + rows.filter((r) => r.score !== null && r.score > score).length;
  }
  const included = inputs.filter((i) => i.status === 'finalized');
  const topics = [...new Set(items.map((i) => i.primaryTopic))].map((topic) => {
    const questions = items.filter((i) => i.primaryTopic === topic);
    const availableMarks = questions.reduce((sum, i) => sum + i.marks, 0) * included.length;
    const earnedMarks = included.reduce(
      (sum, input) => sum + questions.reduce((n, i) => n + earned(input, i), 0),
      0,
    );
    return {
      topic,
      itemCount: questions.length,
      studentCount: included.length,
      earnedMarks,
      availableMarks,
      percent: availableMarks ? (earnedMarks / availableMarks) * 100 : null,
    };
  });
  const distribution = ['0–19%', '20–39%', '40–59%', '60–79%', '80–100%'].map((label, index) => ({
    label,
    count: rows.filter(
      (r) => r.percent !== null && Math.min(4, Math.floor(r.percent / 20)) === index,
    ).length,
  }));
  return {
    rows,
    analytics: {
      includedCount: included.length,
      statusCount: rows.length - included.length,
      topics,
      distribution,
    },
  };
}

export function reportsCsv(reports: Report[]) {
  const cell = (value: unknown) => {
    let text = value === null || value === undefined ? '' : String(value);
    if (/^[\s]*[=+\-@\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const rows: unknown[][] = [
    [
      'Exam',
      'Class',
      'Session',
      'Revision',
      'Publication',
      'User ID',
      'Student',
      'Status',
      'Mark',
      'Maximum',
      'Percent',
      'Rank',
      'Exclusion reason',
    ],
  ];
  for (const r of reports)
    for (const row of r.rows)
      rows.push([
        r.summary.title,
        r.summary.className,
        r.summary.sessionId,
        r.summary.revision,
        r.summary.publication?.revision === r.summary.revision
          ? `Approved; release ${r.summary.publication.releaseAt}`
          : 'Unpublished revision',
        row.loginId,
        row.studentName,
        row.status,
        row.score,
        row.maxScore,
        row.percent,
        row.rank,
        row.exclusionReason,
      ]);
  return '\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n');
}
