import { Router } from 'express';
import type { EmailController } from '../controllers/email.controller.js';
import type { AuthMiddleware } from '../middlewares/auth.middleware.js';

export class EmailRouter {
  public readonly router: Router;
  constructor(private readonly controller: EmailController, private readonly middleware: AuthMiddleware) {
    this.router = Router();
    this.router.get('/search', this.middleware.requireAuthentication.bind(this.middleware), this.controller.search.bind(this.controller));
  }
}
