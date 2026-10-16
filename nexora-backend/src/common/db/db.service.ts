import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DbService.name);
  private pool!: Pool;

  onModuleInit() {
    const connectionString =
      process.env.DATABASE_URL ||
      'postgres://postgres:postgres@localhost:5432/nexora_exam';

    const max = parseInt(process.env.DB_POOL_MAX || '5', 10);
    const isRemote =
      connectionString.includes('supabase.com') ||
      connectionString.includes('supabase.co') ||
      connectionString.includes('sslmode=require');

    this.pool = new Pool({
      connectionString,
      max,
      ssl: isRemote ? { rejectUnauthorized: false } : undefined,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 30000,
    });

    this.pool.on('error', (err) => {
      this.logger.error('Unexpected error on idle PostgreSQL client', err.stack);
    });
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
    }
  }

  /**
   * Executes a standalone query using a pooled connection.
   */
  async query<R extends QueryResultRow = any>(
    text: string,
    params?: any[],
  ): Promise<QueryResult<R>> {
    return this.pool.query<R>(text, params);
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
      await client.query(`SELECT set_config('app.current_school_id', $1, true)`, [schoolId]);
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
