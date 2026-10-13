import axios from 'axios';
import type { AuthConfig } from '../interfaces/auth.interface.js';
import type { GoogleTokenResponse } from '../interfaces/calendar.interface.js';
import type { GoogleTokenRepository } from '../repositories/google-token.repository.js';
import { CalendarError } from '../errors/calendar.error.js';

export class GoogleTokenService {
  private readonly pending = new Map<string, Promise<string>>();

  constructor(private readonly config: AuthConfig, private readonly tokens: GoogleTokenRepository) {}

  public async getAccessToken(userId: string, forceRefresh = false): Promise<string> {
    const tokens = await this.tokens.findByUserId(userId);
    if (!tokens) throw this.reconnect();
    if (!forceRefresh && tokens.expires_at.getTime() > Date.now() + 60000) return tokens.access_token;
    if (!tokens.refresh_token) throw this.reconnect();
    const pending = this.pending.get(userId);
    if (pending) return pending;
    const request = this.refresh(userId, tokens.refresh_token);
    this.pending.set(userId, request);
    try {
      return await request;
    } finally {
      this.pending.delete(userId);
    }
  }

  private async refresh(userId: string, refreshToken: string): Promise<string> {
    let tokens: GoogleTokenResponse;
    try {
      const response = await axios.post<GoogleTokenResponse>('https://oauth2.googleapis.com/token',
        new URLSearchParams({ client_id: this.config.googleClientId,
          client_secret: this.config.googleClientSecret, refresh_token: refreshToken,
          grant_type: 'refresh_token' }), { timeout: 10000 });
      tokens = response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data?.error === 'invalid_grant') {
        throw this.reconnect();
      }
      throw new CalendarError(502, 'GOOGLE_TOKEN_ERROR', 'Não foi possível renovar o acesso ao Google.');
    }
    await this.tokens.save(userId, tokens);
    return tokens.access_token;
  }

  private reconnect(): CalendarError {
    return new CalendarError(403, 'GOOGLE_RECONNECT_REQUIRED',
      'Acesse /auth/google novamente para autorizar o calendário.');
  }
}
