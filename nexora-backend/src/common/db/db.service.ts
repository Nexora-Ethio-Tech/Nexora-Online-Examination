import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { databasePoolConfig, loadBackendEnvironment } from './database-config';

@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DbService.name);
  private pool!: Pool;

  async onModuleInit() {
    loadBackendEnvironment();
    this.pool = new Pool(databasePoolConfig('runtime'));

    this.pool.on('error', (err) => {
      this.logger.error('Unexpected error on idle PostgreSQL client', err.stack);
    });
    try {
      const result = await this.pool.query<{ unsafe: boolean }>(
        `SELECT r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb
          OR has_schema_privilege(current_user, 'public', 'CREATE')
          OR EXISTS (SELECT 1 FROM pg_roles p WHERE p.oid <> r.oid
            AND (p.rolsuper OR p.rolbypassrls OR p.rolcreaterole OR p.rolcreatedb)
            AND pg_has_role(r.oid, p.oid, 'MEMBER'))
          OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relowner = r.oid) AS unsafe
         FROM pg_roles r WHERE r.rolname = current_user`,
      );
      if (result.rows[0]?.unsafe !== false) {
        throw new Error(
          'DATABASE_URL must use the restricted runtime role. Run db:provision-runtime.',
        );
      }
    } catch (error) {
      await this.pool.end();
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
    }
  }

  /**
   * Executes a standalone query using a pooled connection.
   */
  async query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<R>> {
    return this.pool.query<R>(text, params);
  }

  async tenantQuery<R extends QueryResultRow = QueryResultRow>(
    schoolId: string,
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<R>> {
    return this.withTenantTransaction(schoolId, (client) => client.query<R>(text, params));
  }

  async authQuery<R extends QueryResultRow = QueryResultRow>(
    context: { tokenHash?: string; loginId?: string },
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<R>> {
    return this.withAuthTransaction(context, (client) => client.query<R>(text, params));
  }

  async withAuthTransaction<T>(
    context: { tokenHash?: string; loginId?: string },
    fn: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return this.withTransaction(async (client) => {
      await client.query(
        `SELECT set_config('app.current_school_id', '', true),
                set_config('app.auth_token_hash', $1, true),
                set_config('app.auth_login_id', $2, true)`,
        [context.tokenHash ?? '', context.loginId ?? ''],
      );
      return fn(client);
    });
  }

  /**
   * Runs a function inside a database transaction.
   */
  async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Runs a function inside a tenant-scoped database transaction.
   * Sets app.current_school_id for PostgreSQL Row-Level Security (RLS) using set_config(..., true).
   */
  async withTenantTransaction<T>(
    schoolId: string,
    fn: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // set_config with is_local=true is equivalent to SET LOCAL but accepts parameters ($1)
      await client.query(
        `SELECT set_config('app.current_school_id', $1, true),
                set_config('app.auth_token_hash', '', true),
                set_config('app.auth_login_id', '', true)`,
        [schoolId],
      );
      const result = await fn(client);
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
