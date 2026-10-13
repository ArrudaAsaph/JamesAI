import type { Request, Response, NextFunction } from 'express';

export class AuthMiddleware {
  public requireAuthentication(req: Request, res: Response, next: NextFunction): void {
    res.set('Cache-Control', 'no-store');
    if (!req.isAuthenticated() || !req.user) {
      res.locals.auditErrorCode = 'AUTHENTICATION_REQUIRED';
      res.status(401).json({ error: 'Faça login para acessar este recurso.' });
      return;
    }
    next();
  }
}
