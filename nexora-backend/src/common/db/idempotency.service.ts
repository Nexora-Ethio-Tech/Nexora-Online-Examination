import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DbService } from './db.service';
import { computeCanonicalDigest } from '../crypto/canonical-digest';
import { DomainException } from '../errors/domain.exception';

export interface IdempotentResult<T = unknown> {
  isCached: boolean;
  statusCode: number;
  response: T;
}

@Injectable()
export class IdempotencyService {
  constructor(private readonly db: DbService) {}

  /**
   * Checks or reserves an idempotency key.
   * If existing match with same payload: returns cached response.
   * If existing match with different payload: throws 409 REVISION_CONFLICT.
   */
  async checkOrStore<T>(
    client: PoolClient | null,
    scope: {
      schoolId: string;
      actorId: string;
      operation: string;
      idempotencyKey: string;
      payload: unknown;
    },
    executeFn: () => Promise<{ statusCode: number; response: T }>,
  ): Promise<{ statusCode: number; response: T }> {
    const payloadDigest = computeCanonicalDigest(scope.payload);

    const runQuery = (text: string, params?: unknown[]) =>
      client ? client.query(text, params) : this.db.query(text, params);

    const existing = await runQuery(
      `SELECT payload_digest, status_code, response_body
       FROM idempotency_keys
       WHERE school_id = $1 AND actor_id = $2 AND operation = $3 AND idempotency_key = $4
       FOR UPDATE`,
      [scope.schoolId, scope.actorId, scope.operation, scope.idempotencyKey],
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      if (row.payload_digest !== payloadDigest) {
        throw DomainException.conflict(
          'REVISION_CONFLICT',
          'Idempotency-Key reused with conflicting payload',
        );
      }
      return {
        statusCode: row.status_code,
        response: row.response_body as T,
      };
    }

    // Execute the action
    const result = await executeFn();

    // Store the result
    await runQuery(
      `INSERT INTO idempotency_keys (
         school_id, actor_id, operation, idempotency_key, payload_digest, status_code, response_body, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        scope.schoolId,
        scope.actorId,
        scope.operation,
        scope.idempotencyKey,
        payloadDigest,
        result.statusCode,
        JSON.stringify(result.response),
      ],
    );

    return result;
  }
}
