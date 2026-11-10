import type { Request } from 'express';
import type { GoogleTokenRepository } from '../repositories/google-token.repository.js';
import type { GoogleTokenResponse } from '../interfaces/calendar.interface.js';
import type { UserRepository } from '../repositories/user.repository.js';
import type { SerializeCallback } from '../interfaces/session.interface.js';
import { Passport } from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth2';
import type { VerifyCallback } from 'passport-google-oauth2';
import type {
  AuthCallback, AuthConfig, GoogleProfile, SessionCallback,
} from '../interfaces/auth.interface.js';

export class AuthService {
  public readonly passport = new Passport();

  constructor(config: AuthConfig, private readonly users: UserRepository,
    private readonly tokens: GoogleTokenRepository) {
    const strategyOptions = {
      clientID: config.googleClientId,
      clientSecret: config.googleClientSecret,
      callbackURL: config.googleCallbackUrl,
      state: true,
      pkce: true,
      passReqToCallback: true as const,
    };

    this.passport.use(new GoogleStrategy(strategyOptions, this.verifyProfile.bind(this)));
    this.passport.serializeUser(this.serializeUser.bind(this));
    this.passport.deserializeUser(this.deserializeUser.bind(this));
  }

  public authenticate(callback: AuthCallback) {
    const options = {
      accessType: 'offline',
      prompt: 'consent',
      scope: [
        'email',
        'profile',
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/gmail.readonly',
      ],
    };
    return this.passport.authenticate('google', options, callback);
  }

  private async verifyProfile(
    _req: Request,
    accessToken: string,
    refreshToken: string,
    params: GoogleTokenResponse,
    profile: GoogleProfile,
    done: VerifyCallback,
  ): Promise<void> {
    if (!profile.id || !profile.email || profile.email_verified !== true) {
      done(null, false);
      return;
    }
    let user: Express.User;
    try {
      user = await this.users.saveGoogleProfile(profile);
      await this.tokens.save(user.id, { access_token: accessToken, refresh_token: refreshToken,
        expires_in: params.expires_in });
    } catch (error) {
      done(error);
      return;
    }
    done(null, user);
  }

  private serializeUser(user: Express.User, done: SerializeCallback): void {
    done(null, user.id);
  }

  private async deserializeUser(id: string, done: SessionCallback): Promise<void> {
    if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      done(null, false);
      return;
    }
    let user: Express.User | null;
    try {
      user = await this.users.findById(id);
    } catch (error) {
      done(error);
      return;
    }
    done(null, user ?? false);
  }
}
