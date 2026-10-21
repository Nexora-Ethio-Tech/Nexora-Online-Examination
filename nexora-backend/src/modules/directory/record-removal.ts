import { PoolClient } from 'pg';

/** Inspect every declared incoming FK, including future schema additions, before a physical delete.
 * Identifiers are quoted by PostgreSQL from its catalog, never supplied by a request.
 * Only transient login sessions and current class membership may cascade for unused accounts.
 * The caller holds FOR UPDATE on the target, serializing new FK references.
 */
export async function hasRetainedReferences(
  c: PoolClient,
  table: string,
  school: string,
  id: string,
) {
  const checks = await c.query<{ check_sql: string }>(
    `SELECT format('SELECT 1 FROM %I.%I child JOIN public.%I parent ON %s WHERE parent.school_id=$1 AND parent.id=$2 LIMIT 1',
      ns.nspname,cl.relname,$1,string_agg(format('child.%I=parent.%I',ca.attname,pa.attname),' AND ' ORDER BY keys.ordinality)) check_sql
     FROM pg_constraint fk JOIN pg_class cl ON cl.oid=fk.conrelid JOIN pg_namespace ns ON ns.oid=cl.relnamespace
     CROSS JOIN LATERAL unnest(fk.conkey,fk.confkey) WITH ORDINALITY keys(child_key,parent_key,ordinality)
     JOIN pg_attribute ca ON ca.attrelid=fk.conrelid AND ca.attnum=keys.child_key
     JOIN pg_attribute pa ON pa.attrelid=fk.confrelid AND pa.attnum=keys.parent_key
     WHERE fk.contype='f' AND fk.confrelid=to_regclass('public.'||$1)
       AND NOT ($1='users' AND ns.nspname='public' AND cl.relname IN ('enrollments','auth_sessions'))
     GROUP BY fk.oid,ns.nspname,cl.relname`,
    [table],
  );
  for (const check of checks.rows) {
    if ((await c.query(check.check_sql, [school, id])).rowCount) return true;
  }
  return false;
}
