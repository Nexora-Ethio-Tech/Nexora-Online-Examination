import { z } from 'zod';

/** Fail closed before launching processes; never inherit hosted connection strings. */
export function localTestSettings(value: unknown, automated: boolean): Record<string, string> {
  const config = z
    .object({
      manual: z.record(z.string(), z.string()),
      automated: z.record(z.string(), z.string()),
    })
    .parse(value);
  const settings = automated ? config.automated : config.manual;
  for (const name of ['DATABASE_URL', 'MIGRATION_DATABASE_URL', 'PLATFORM_DATABASE_URL']) {
    const url = new URL(settings[name] ?? '');
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.hostname !== '127.0.0.1' ||
      url.port !== '55432' ||
      url.pathname !== (automated ? '/nexora_be02a_test' : '/nexora_manual_test')
    )
      throw new Error('Local test configuration must use the designated isolated database.');
  }
  return settings;
}
