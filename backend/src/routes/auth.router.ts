import type { AuthMiddleware } from '../middlewares/auth.middleware.js';
import { Router } from 'express';
import type { AuthController } from '../controllers/auth.controller.js';

export class AuthRouter {
  public readonly router: Router;

  constructor(
    private readonly controller: AuthController,
    private readonly middleware: AuthMiddleware,
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    // A mesma rota inicia o login e recebe o callback do Google.
    this.router.get('/me', this.middleware.requireAuthentication.bind(this.middleware),
      this.controller.me.bind(this.controller));
    this.router.post('/logout', this.controller.logout.bind(this.controller));
    this.router.get('/google', this.controller.authenticate.bind(this.controller));
  }
}
