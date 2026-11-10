import type { UserData } from './user.interface.js';

declare global {
  namespace Express {
    interface User extends UserData {}
  }
}

export interface AuthConfig {
  frontendUrl?: string;
  auditLogKey: string;
  googleClientId: string;
  googleClientSecret: string;
  googleCallbackUrl: string;
  sessionSecret: string;
  tokenEncryptionKey: string;
  production?: boolean;
  databaseUrl: string;
  openRouterApiKey?: string;
  openRouterModel?: string;
  openRouterApiUrl?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  contextsDirectory?: string;
}

export interface GoogleProfile {
  id: string;
  displayName?: string;
  email?: string;
  email_verified?: boolean;
  picture?: string;
}

export interface AuthCallback {
  (error: unknown, user: Express.User | false | null): void;
}

export interface SessionCallback {
  (error: unknown, user?: Express.User | false): void;
}

declare module 'express-session' {
  interface SessionData {
    returnToFrontend?: boolean;
  }
}
