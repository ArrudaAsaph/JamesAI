import type { PoolClient } from 'pg';
import type { Database } from '../database/database.js';
import type { AuditEntry, AuditRow } from '../interfaces/audit.interface.js';

export class AuditLogRepository {
  constructor(private readonly database: Database) {}

  public async append(entry: AuditEntry, createEntryHash: (previousHash: string | null) => string): Promise<string> {
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('charles_audit_logs_chain'))");
      const previousHash = await this.previousHash(client);
      const entryHash = createEntryHash(previousHash);
      await client.query(`
        INSERT INTO audit_logs (
          request_id, occurred_at, hash_version, event_type, actor_id, method, path, query_keys, status_code,
          duration_ms, ip_hash, user_agent, error_code, previous_hash, entry_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      `, [entry.requestId, entry.occurredAt, entry.hashVersion, entry.eventType, entry.actorId, entry.method, entry.path,
        entry.queryKeys, entry.statusCode, entry.durationMs, entry.ipHash, entry.userAgent,
        entry.errorCode, previousHash, entryHash]);
      await client.query('COMMIT');
      return entryHash;
    } catch (error) {
      await client.query('ROLLBACK').catch(function ignoreRollbackFailure() {});
      throw error;
    } finally {
      client.release();
    }
  }

  public async listByRequestId(requestId: string): Promise<AuditRow[]> {
    const result = await this.database.pool.query<AuditRow>(
      `SELECT sequence, request_id AS "requestId", occurred_at AS "occurredAt", hash_version AS "hashVersion",
        event_type AS "eventType", actor_id AS "actorId", method, path,
        query_keys AS "queryKeys", status_code AS "statusCode", duration_ms AS "durationMs",
        ip_hash AS "ipHash", user_agent AS "userAgent", error_code AS "errorCode",
        previous_hash AS "previousHash", entry_hash AS "entryHash"
      FROM audit_logs WHERE request_id = $1 ORDER BY sequence`, [requestId],
    );
    return result.rows;
  }

  public async listAll(): Promise<AuditRow[]> {
    const result = await this.database.pool.query<AuditRow>(`
      SELECT sequence, request_id AS "requestId", occurred_at AS "occurredAt", hash_version AS "hashVersion",
        event_type AS "eventType", actor_id AS "actorId", method, path,
        query_keys AS "queryKeys", status_code AS "statusCode", duration_ms AS "durationMs",
        ip_hash AS "ipHash", user_agent AS "userAgent", error_code AS "errorCode",
        previous_hash AS "previousHash", entry_hash AS "entryHash"
      FROM audit_logs ORDER BY sequence
    `);
    return result.rows;
  }

  private async previousHash(client: PoolClient): Promise<string | null> {
    const result = await client.query<{ entry_hash: string }>(
      'SELECT entry_hash FROM audit_logs ORDER BY sequence DESC LIMIT 1',
    );
    return result.rows[0]?.entry_hash ?? null;
  }
}
