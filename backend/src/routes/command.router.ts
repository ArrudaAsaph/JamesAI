import { Router } from 'express';
import type { CommandController } from '../controllers/command.controller.js';
import type { AuthMiddleware } from '../middlewares/auth.middleware.js';

export class CommandRouter {
  public readonly router: Router;

  constructor(private readonly controller: CommandController, private readonly middleware: AuthMiddleware) {
    this.router = Router();
    this.router.post('/', this.middleware.requireAuthentication.bind(this.middleware),
      this.controller.execute.bind(this.controller));
  }
}
