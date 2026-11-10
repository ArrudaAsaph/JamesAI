import type { Request, Response, NextFunction } from 'express';
import type { GmailService } from '../services/gmail.service.js';
import { CalendarError } from '../errors/calendar.error.js';

export class EmailController {
  constructor(private readonly service: GmailService) {}

  public async search(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) { res.status(401).json({ error: 'Faça login para acessar este recurso.' }); return; }
      const query = this.stringValue(req, 'q');
      if (!query || query.length > 1024) throw new CalendarError(400, 'INVALID_EMAIL_QUERY', 'Informe uma busca de e-mail com até 1.024 caracteres.');
      const maxResults = this.maxResults(req);
      res.json(await this.service.search(req.user.id, query, maxResults));
    } catch (error) {
      if (error instanceof CalendarError) { res.locals.auditErrorCode = error.code; res.status(error.status).json({ error: error.message, code: error.code }); return; }
      next(error);
    }
  }

  private stringValue(req: Request, key: string): string | undefined {
    const value = req.query[key];
    return typeof value === 'string' ? value.trim() : undefined;
  }

  private maxResults(req: Request): number {
    const value = this.stringValue(req, 'maxResults') ?? '10';
    const number = Number(value);
    if (!/^\d+$/.test(value) || !Number.isInteger(number) || number < 1 || number > 25) {
      throw new CalendarError(400, 'INVALID_EMAIL_QUERY', 'maxResults deve estar entre 1 e 25.');
    }
    return number;
  }
}
