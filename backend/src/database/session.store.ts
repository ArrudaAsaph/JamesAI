import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import type { Database } from './database.js';

const PgStore = connectPgSimple(session);

export class PostgresSessionStore extends PgStore {
  constructor(database: Database) {
    super({ pool: database.pool, tableName: 'sessions', pruneSessionInterval: 60 });
  }
}
