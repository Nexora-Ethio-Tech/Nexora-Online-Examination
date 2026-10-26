import { randomInt } from 'crypto';
import type { Structure } from '../authoring/content-schema';
export function questionOrder(
  items: {
    item_id: string;
    type?: string;
    section_id?: string | null;
    passage_id?: string | null;
  }[],
  structure: Structure,
  enabled: boolean,
  random: (max: number) => number = randomInt,
) {
  if (!enabled && !structure.sections.length) return items.map((i) => i.item_id);
  const shuffle = (values: string[]) => {
    for (let i = values.length - 1; i > 0; i--) {
      const j = random(i + 1);
      [values[i], values[j]] = [values[j], values[i]];
    }
    return values;
  };
  // Section order is explicit. Standalone and passage groups never mix; types never mix.
  const sections = structure.sections.length ? structure.sections.map((s) => s.id) : [null];
  const result: string[] = [];
  for (const section of sections) {
    const buckets = new Map<string, string[]>();
    for (const item of items.filter((i) => (i.section_id ?? null) === section)) {
      const key = JSON.stringify([item.type ?? 'mcq_single', item.passage_id ?? null]);
      buckets.set(key, [...(buckets.get(key) ?? []), item.item_id]);
    }
    const canShuffle =
      enabled &&
      (section === null || structure.sections.find((s) => s.id === section)?.shuffle === true);
    for (const bucket of buckets.values()) result.push(...(canShuffle ? shuffle(bucket) : bucket));
  }
  if (result.length !== items.length) throw new Error('Invalid exam section membership');
  return result;
}
