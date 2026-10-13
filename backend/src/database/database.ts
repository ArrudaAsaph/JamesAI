import { Pool } from 'pg';

export class Database {
  public readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, connectionTimeoutMillis: 5000 });
    this.pool.on('error', this.onError.bind(this));
  }

  public async initialize(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        google_id TEXT NOT NULL UNIQUE,
        name TEXT,
        email TEXT NOT NULL,
        picture TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        last_login TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS google_tokens (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        expires_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        sid VARCHAR PRIMARY KEY,
        sess JSON NOT NULL,
        expire TIMESTAMP(6) NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sessions_expiration ON sessions(expire);
      CREATE TABLE IF NOT EXISTS audit_logs (
        sequence BIGSERIAL PRIMARY KEY,
        request_id UUID NOT NULL,
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
        event_type TEXT NOT NULL,
        actor_id UUID,
        method TEXT,
        path TEXT,
        query_keys TEXT[] NOT NULL DEFAULT '{}',
        status_code INTEGER,
        duration_ms INTEGER,
        ip_hash CHAR(64),
        user_agent TEXT,
        error_code TEXT,
        previous_hash CHAR(64),
        entry_hash CHAR(64) NOT NULL UNIQUE
      );
      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS hash_version SMALLINT NOT NULL DEFAULT 1;
      CREATE INDEX IF NOT EXISTS audit_logs_occurred_at ON audit_logs(occurred_at DESC);
      CREATE INDEX IF NOT EXISTS audit_logs_actor_id ON audit_logs(actor_id, occurred_at DESC);
      CREATE INDEX IF NOT EXISTS audit_logs_request_id ON audit_logs(request_id);
      CREATE OR REPLACE FUNCTION prevent_audit_log_mutation() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'audit_logs is append-only';
      END;
      $$ LANGUAGE plpgsql;
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_logs_append_only') THEN
          CREATE TRIGGER audit_logs_append_only
          BEFORE UPDATE OR DELETE ON audit_logs
          FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
        END IF;
      END;
      $$;
    `);
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }

  private onError(): void {
    console.error('Conexão com o PostgreSQL interrompida.');
  }
}
