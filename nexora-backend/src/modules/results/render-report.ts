import { ResultSource } from '../../common/db/result-snapshot';
import { Report, Publication, ResultRow, reportSchema } from './schemas';

export function renderReport(
  source: ResultSource,
  publication: Publication | null,
  now: string,
  exclusions: { attemptId: string; reason: string }[] = [],
): Report {
  const maxScore = source.items.reduce((sum, i) => sum + i.marks, 0);
  const rows: ResultRow[] = source.rows.map((row) => {
    const exclusion = exclusions.find((e) => e.attemptId === row.attemptId);
    const status = exclusion
      ? 'excluded'
      : !row.attemptId
        ? 'absent'
        : row.state === 'invalidated'
          ? 'invalidated'
          : row.receiptId
            ? 'finalized'
            : row.pendingRecovery
              ? 'recovery_pending'
              : 'awaiting_upload';
    let score: number | null = null;
    if (status === 'finalized') {
      if (row.score === null || row.state !== 'submitted')
        throw new Error('Committed result is inconsistent');
      const answers = new Map(row.answers.map((a) => [a.itemId, a.value]));
      score = source.items.reduce(
        (sum, i) => sum + (answers.get(i.itemId) === i.correctKey ? i.marks : 0),
        0,
      );
      if (score !== row.score) throw new Error('Stored grade does not match the accepted snapshot');
    }
    const percent = score === null ? null : (100 * score) / maxScore;
    return {
      studentId: row.studentId,
      studentName: row.studentName,
      loginId: row.loginId,
      attemptId: row.attemptId,
      status,
      score,
      maxScore,
      percent,
      rank: null,
      passed: percent === null ? null : percent >= source.session.passPercent,
      exclusionReason: exclusion?.reason ?? null,
    };
  });
  const finalized = rows.filter(
    (row): row is ResultRow & { score: number; percent: number } =>
      row.score !== null && row.percent !== null,
  );
  for (const row of finalized)
    row.rank = 1 + finalized.filter((other) => other.score > row.score).length;
  const distribution = ['0–19%', '20–39%', '40–59%', '60–79%', '80–100%'].map((label) => ({
    label,
    count: 0,
  }));
  for (const row of finalized) distribution[Math.min(4, Math.floor(row.percent / 20))].count++;
  const included = new Set(finalized.map((r) => r.studentId));
  const topics = [...new Set(source.items.map((i) => i.topic))].sort().map((topic) => {
    const items = source.items.filter((i) => i.topic === topic),
      availableMarks = finalized.length * items.reduce((sum, i) => sum + i.marks, 0);
    let earnedMarks = 0;
    for (const row of source.rows) {
      if (!included.has(row.studentId)) continue;
      const answers = new Map(row.answers.map((a) => [a.itemId, a.value]));
      for (const item of items)
        if (answers.get(item.itemId) === item.correctKey) earnedMarks += item.marks;
    }
    return {
      topic,
      itemCount: items.length,
      studentCount: finalized.length,
      earnedMarks,
      availableMarks,
      percent: availableMarks ? (100 * earnedMarks) / availableMarks : null,
    };
  });
  const { examId, examVersion, passPercent, ...summary } = source.session;
  void examId;
  void examVersion;
  void passPercent;
  return reportSchema.parse({
    summary: { ...summary, publication },
    rows,
    analytics: {
      revision: source.session.revision,
      includedCount: finalized.length,
      statusCount: rows.length - finalized.length,
      distribution,
      topics,
    },
    serverNow: now,
  });
}
