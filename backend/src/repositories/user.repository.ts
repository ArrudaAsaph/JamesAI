import { randomUUID } from 'node:crypto';
import type { Database } from '../database/database.js';
import type { GoogleProfile } from '../interfaces/auth.interface.js';
import type { UserRow } from '../interfaces/user.interface.js';
import { User } from '../models/user.model.js';

export class UserRepository {
  private readonly columns = `id, google_id AS "googleId", name, email, picture,
    created_at AS "createdAt", updated_at AS "updatedAt", last_login AS "lastLogin"`;

  constructor(private readonly database: Database) {}

  public async findById(id: string): Promise<User | null> {
    const result = await this.database.pool.query<UserRow>(
      `SELECT ${this.columns} FROM users WHERE id = $1`, [id],
    );
    const row = result.rows[0];
    return row ? this.toModel(row) : null;
  }

  public async saveGoogleProfile(profile: GoogleProfile): Promise<User> {
    if (profile.email_verified !== true || !profile.email) {
      throw new Error('O Google deve confirmar o e-mail do usuário.');
    }
    const now = new Date().toISOString();
    const user = new User({
      id: randomUUID(), googleId: profile.id, name: profile.displayName ?? null,
      email: profile.email, picture: profile.picture ?? null,
      createdAt: now, updatedAt: now, lastLogin: now,
    });
    // O ID do provedor identifica a conta, mesmo quando seu e-mail muda.
    const result = await this.database.pool.query<UserRow>(`
      INSERT INTO users (id, google_id, name, email, picture, created_at, updated_at, last_login)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT(google_id) DO UPDATE SET name = excluded.name,
        email = excluded.email, picture = excluded.picture,
        updated_at = excluded.updated_at, last_login = excluded.last_login
      RETURNING ${this.columns}
    `, [user.id, user.googleId, user.name, user.email, user.picture,
      user.createdAt, user.updatedAt, user.lastLogin]);
    const row = result.rows[0];
    if (!row) throw new Error('Não foi possível salvar o usuário.');
    return this.toModel(row);
  }

  private toModel(row: UserRow): User {
    return new User({ ...row, createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(), lastLogin: row.lastLogin.toISOString() });
  }
}
