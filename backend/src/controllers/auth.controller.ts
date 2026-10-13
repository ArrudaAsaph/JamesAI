import type { AuthConfig } from '../interfaces/auth.interface.js';
import type { Request, Response, NextFunction } from 'express';
import type { AuthService } from '../services/auth.service.js';

export class AuthController {
  constructor(private readonly authService: AuthService, private readonly config: AuthConfig) {}

  public authenticate(req: Request, res: Response, next: NextFunction): void {
    res.set('Cache-Control', 'no-store');
    if (req.query.client === 'web' && req.query.code === undefined && req.query.error === undefined) {
      req.session.returnToFrontend = true;
    }
    if (req.query.error !== undefined) {
      this.rejectLogin(req, res, 401, 'Autenticação não autorizada pelo Google.');
      return;
    }
    for (const field of ['code', 'state']) {
      if (req.query[field] !== undefined &&
          (typeof req.query[field] !== 'string' || !req.query[field])) {
        res.status(400).json({ error: 'Callback de autenticação inválido.' });
        return;
      }
    }
    if (req.query.state !== undefined && req.query.code === undefined) {
      res.status(400).json({ error: 'Callback de autenticação inválido.' });
      return;
    }
    this.authService.authenticate(this.handleAuthentication.bind(this, req, res, next))(req, res, next);
  }

  public me(req: Request, res: Response): void {
    res.json({ authenticated: true, user: req.user });
  }

  public logout(req: Request, res: Response, next: NextFunction): void {
    res.set('Cache-Control', 'no-store');
    // Cabeçalho não simples impede logout por formulários de outros sites.
    const origin = req.get('origin');
    const allowedOrigins = [this.frontendUrl(), new URL(this.config.googleCallbackUrl).origin];
    if (req.get('x-requested-with') !== 'XMLHttpRequest' || (origin && !allowedOrigins.includes(origin))) {
      res.locals.auditErrorCode = 'INVALID_ORIGIN';
      res.status(403).json({ error: 'Origem da solicitação inválida.' });
      return;
    }
    const secure = this.config.production ?? false;
    req.logout(function onLogout(error: unknown) {
      if (error) return next(error);
      req.session.destroy(function onDestroy(sessionError: unknown) {
        if (sessionError) return next(sessionError);
        res.clearCookie('charles.sid', { path: '/', httpOnly: true, sameSite: 'lax', secure });
        res.status(204).end();
      });
    });
  }

  private frontendUrl(): string {
    return new URL(this.config.frontendUrl ?? 'http://localhost:3002').origin;
  }

  private rejectLogin(req: Request, res: Response, status: number, message: string): void {
    res.locals.auditErrorCode = status === 401 ? 'AUTHENTICATION_DENIED' : 'AUTHENTICATION_FAILED';
    if (req.session.returnToFrontend) {
      delete req.session.returnToFrontend;
      res.redirect(this.frontendUrl() + '/?error=auth_failed');
      return;
    }
    res.status(status).json({ error: message });
  }

  private handleAuthentication(
    req: Request,
    res: Response,
    next: NextFunction,
    error: unknown,
    user: Express.User | false | null,
  ): void {
    if (error) {
      this.rejectLogin(req, res, 502, 'Não foi possível concluir a autenticação com o Google.');
      return;
    }
    if (!user) {
      this.rejectLogin(req, res, 401, 'Autenticação inválida ou expirada. Inicie o login novamente.');
      return;
    }
    const frontend = req.session.returnToFrontend ? this.frontendUrl() : null;
    req.logIn(user, function onLogin(loginError: unknown): void {
      if (loginError) {
        next(loginError);
        return;
      }
      if (frontend) {
        res.redirect(frontend);
        return;
      }
      res.json({ authenticated: true, user });
    });
  }
}
