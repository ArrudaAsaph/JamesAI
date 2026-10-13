import type { Database } from '../database/database.js';
import type { GoogleTokenResponse, GoogleTokenRow } from '../interfaces/calendar.interface.js';
import type { TokenCipherService } from '../services/token-cipher.service.js';

export class GoogleTokenRepository {
  constructor(private readonly database: Database, private readonly cipher: TokenCipherService) {}

  public async save(userId: string, tokens: GoogleTokenResponse): Promise<void> {
    if (!tokens.access_token || !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0) {
      throw new Error('Resposta de tokens inválida.');
    }
    await this.database.pool.query(`
      INSERT INTO google_tokens (user_id, access_token, refresh_token, expires_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT(user_id) DO UPDATE SET access_token = excluded.access_token,
        refresh_token = COALESCE(excluded.refresh_token, google_tokens.refresh_token),
        expires_at = excluded.expires_at
    `, [userId, this.cipher.encrypt(tokens.access_token),
      tokens.refresh_token ? this.cipher.encrypt(tokens.refresh_token) : null,
      new Date(Date.now() + tokens.expires_in * 1000)]);
  }

  public async findByUserId(userId: string): Promise<GoogleTokenRow | null> {
    const result = await this.database.pool.query<GoogleTokenRow>(
      'SELECT access_token, refresh_token, expires_at FROM google_tokens WHERE user_id = $1', [userId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return { access_token: this.cipher.decrypt(row.access_token),
      refresh_token: row.refresh_token ? this.cipher.decrypt(row.refresh_token) : null,
      expires_at: row.expires_at };
  }
}
