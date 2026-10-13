import type { NextFunction, Request, Response } from 'express';
import type { CommandService } from '../services/command.service.js';
import { CommandError } from '../errors/command.error.js';
import { CalendarError } from '../errors/calendar.error.js';

export class CommandController {
  constructor(private readonly service: CommandService) {}

  public async execute(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) { res.status(401).json({ error: 'Faça login para acessar este recurso.' }); return; }
      const text = typeof req.body?.text === 'string' ? req.body.text : '';
      res.json(await this.service.execute(req.user.id, text));
    } catch (error) {
      if (error instanceof CommandError || error instanceof CalendarError) {
        res.locals.auditErrorCode = error.code;
        res.status(error.status).json({ error: error.message, code: error.code });
        return;
      }
      next(error);
    }
  }
}
