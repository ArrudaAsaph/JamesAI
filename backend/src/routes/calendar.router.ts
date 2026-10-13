import { Router } from 'express';
import type { CalendarController } from '../controllers/calendar.controller.js';
import type { AuthMiddleware } from '../middlewares/auth.middleware.js';

export class CalendarRouter {
  public readonly router: Router;

  constructor(private readonly controller: CalendarController, private readonly middleware: AuthMiddleware) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    this.router.get('/events', this.middleware.requireAuthentication.bind(this.middleware),
      this.controller.listEvents.bind(this.controller));
  }
}
