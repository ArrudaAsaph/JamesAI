import 'dotenv/config';
import path from 'node:path';
import type { AuthConfig } from '../interfaces/auth.interface.js';

export class Environment implements AuthConfig {
  public readonly frontendUrl: string;
  public readonly databaseUrl: string;
  public readonly auditLogKey: string;
  public readonly port: number;
  public readonly googleClientId: string;
  public readonly googleClientSecret: string;
  public readonly googleCallbackUrl: string;
  public readonly tokenEncryptionKey: string;
  public readonly sessionSecret: string;
  public readonly production: boolean;
  public readonly openRouterApiKey: string;
  public readonly openRouterModel: string;
  public readonly openRouterApiUrl: string;
  public readonly geminiApiKey: string;
  public readonly geminiModel: string;
  public readonly contextsDirectory: string;

  constructor() {
    this.frontendUrl = process.env.FRONTEND_URL?.trim() || 'http://localhost:3002';
    this.databaseUrl = this.required('DATABASE_URL');
    this.auditLogKey = this.required('AUDIT_LOG_KEY');
    this.port = Number(process.env.PORT ?? 3000);
    this.googleClientId = this.required('GOOGLE_CLIENT_ID');
    this.googleClientSecret = this.required('GOOGLE_CLIENT_SECRET');
    this.googleCallbackUrl = this.required('GOOGLE_CALLBACK_URL');
    this.tokenEncryptionKey = this.required('TOKEN_ENCRYPTION_KEY');
    this.sessionSecret = this.required('SESSION_SECRET');
    this.production = process.env.NODE_ENV === 'production';
    this.openRouterApiKey = process.env.OPENROUTER_API_KEY?.trim() ?? '';
    this.openRouterModel = process.env.OPENROUTER_MODEL?.trim() ?? 'nvidia/nemotron-3.5-super-vl:free';
    this.openRouterApiUrl = process.env.OPENROUTER_API_URL?.trim() ?? 'https://openrouter.ai/api/v1/chat/completions';
    this.geminiApiKey = process.env.GEMINI_API_KEY?.trim() ?? '';
    this.geminiModel = process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash';
    this.contextsDirectory = path.resolve(process.cwd(), process.env.CONTEXTS_DIRECTORY?.trim() || 'src/contexts');
    this.validate();
  }

  private required(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Configure ${name} no arquivo .env.`);
    return value;
  }

  private validate(): void {
    if (!Number.isInteger(this.port) || this.port < 1 || this.port > 65535) {
      throw new Error('PORT deve ser um número entre 1 e 65535.');
    }
    if (this.sessionSecret.length < 32) {
      throw new Error('SESSION_SECRET deve ter pelo menos 32 caracteres aleatórios.');
    }
    if (!/^[a-f0-9]{64}$/i.test(this.auditLogKey)) {
      throw new Error('AUDIT_LOG_KEY deve conter 64 caracteres hexadecimais.');
    }
    const frontend = new URL(this.frontendUrl);
    if (!['http:', 'https:'].includes(frontend.protocol) || frontend.pathname !== '/' ||
        frontend.search || frontend.hash || frontend.username || frontend.password ||
        (this.production && frontend.protocol !== 'https:')) {
      throw new Error('FRONTEND_URL deve conter a origem do frontend (HTTPS em produção).');
    }
    const databaseUrl = new URL(this.databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
      throw new Error('DATABASE_URL deve apontar para PostgreSQL.');
    }
    const callback = new URL(this.googleCallbackUrl);
    if (!['http:', 'https:'].includes(callback.protocol) ||
        callback.pathname !== '/auth/google' || callback.search || callback.hash ||
        callback.username || callback.password || (this.production && callback.protocol !== 'https:')) {
      throw new Error('GOOGLE_CALLBACK_URL deve apontar para /auth/google (HTTPS em produção).');
    }
  }
}
