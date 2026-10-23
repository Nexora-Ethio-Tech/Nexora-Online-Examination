import type { Draft, Item } from '@/features/exams/authoring/schemas';
import type { AdminDetail, Sitting } from '@/features/exams/admin/schemas';
import type { Paper } from '@/features/runner/schemas';
import type { Attempt } from '@/features/exams/schemas';
import type { Report } from '@/features/results/schemas';
import type { RecoveryDetail } from '@/features/exams/recovery/schemas';
import type { PracticeAccess, PracticeAttempt } from '@/features/practice/schemas';
import { createDirectoryStore } from './directory-store';
import type { AccommodationStudent } from '@/features/exams/admin/accommodation-schemas';

export type DemoSitting = {
  accommodations?: AccommodationStudent[];
  session: Sitting;
  title: string;
  durationMinutes: number;
  paper: Paper;
  shuffle: boolean;
};
export function createAuthoringStore() {
  return {
    directory: createDirectoryStore(),
    invigilation: new Map<string, { active: boolean; revision: number }>(),
    staffAliases: new Map<string, string>(),
    draftOwners: new Map<string, string>(),
    drafts: new Map<string, Draft>(),
    papers: new Map<string, Item[]>(),
    approved: new Map<string, { version: number; items: Item[]; draft: Draft }>(),
    sessions: new Map<string, DemoSitting>(),
    history: new Map<string, AdminDetail['history']>(),
    resultAttempts: new Map<
      string,
      { attempt: Attempt; answers: { itemId: string; value: string | null }[] }
    >(),
    resultSnapshots: new Map<string, Report[]>(),
    publications: new Map<string, Report[]>(),
    recoveries: new Map<string, { detail: RecoveryDetail; uploadKey: string }>(),
    practiceAccess: new Map<string, PracticeAccess>(),
    practiceAttempts: new Map<
      string,
      { studentId: string; valid: boolean; attempt: PracticeAttempt }
    >(),
  };
}
export type AuthoringStore = ReturnType<typeof createAuthoringStore>;
