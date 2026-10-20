import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow } from 'pg';
import { databasePoolConfig } from '../common/db/database-config';

export function platformKey(environment: NodeJS.ProcessEnv = process.env) {
  const value = environment.PLATFORM_MFA_ENCRYPTION_KEY ?? '';
  const key = Buffer.from(value, 'base64url');
  if (key.length !== 32 || key.toString('base64url') !== value)
    throw new Error('PLATFORM_MFA_ENCRYPTION_KEY must be a separate private 32-byte base64url key');
  return key;
}
export function platformPoolConfig(environment: NodeJS.ProcessEnv = process.env) {
  if (!environment.PLATFORM_DATABASE_URL) throw new Error('PLATFORM_DATABASE_URL is required');
  if (
    environment.NODE_ENV === 'production' &&
    [
      environment.MIGRATION_DATABASE_URL,
      environment.DATABASE_URL,
      environment.MFA_ENCRYPTION_KEY,
    ].some(Boolean)
  )
    throw new Error('Production platform service must not contain migration or school credentials');
  const config = databasePoolConfig('runtime', {
    ...environment,
    DATABASE_URL: environment.PLATFORM_DATABASE_URL,
  });
  if (
    environment.NODE_ENV === 'production' &&
    (!config.ssl || (typeof config.ssl === 'object' && config.ssl.rejectUnauthorized !== true))
  )
    throw new Error('Production platform database requires verified TLS');
  return config;
}
@Injectable()
export class PlatformDb implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;
  async onModuleInit() {
    platformKey();
    this.pool = new Pool(platformPoolConfig());
    try {
      const role = await this.pool.query<{ safe: boolean }>(`SELECT
       current_user='nexora_platform' AND NOT (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication)
       AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid)
       AND NOT EXISTS(SELECT 1 FROM pg_class WHERE relowner=r.oid)
       AND NOT has_schema_privilege(current_user,'public','CREATE')
       AND NOT has_schema_privilege(current_user,'platform','CREATE') AS safe
       FROM pg_roles r WHERE rolname=current_user`);
      if (role.rows[0]?.safe !== true)
        throw new Error('Platform database must use the isolated nexora_platform role');
    } catch (error) {
      await this.pool.end();
      throw error;
    }
  }
  async onModuleDestroy() {
    await this.pool?.end();
  }
  query<R extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]) {
    return this.pool.query<R>(sql, values);
  }
  async transaction<T>(work: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL statement_timeout='10s'");
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
