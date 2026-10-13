import type { Request, Response, NextFunction } from 'express';
import type { CalendarService } from '../services/calendar.service.js';
import type { CalendarQuery } from '../interfaces/calendar.interface.js';
import { CalendarError } from '../errors/calendar.error.js';

export class CalendarController {
  constructor(private readonly service: CalendarService) {}

  public async listEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Faça login para acessar este recurso.' });
        return;
      }
      const query = this.parseQuery(req);
      res.json(await this.service.listEvents(req.user.id, query));
    } catch (error) {
      if (error instanceof CalendarError) {
        res.locals.auditErrorCode = error.code;
        res.status(error.status).json({ error: error.message, code: error.code });
        return;
      }
      next(error);
    }
  }

  private parseQuery(req: Request): CalendarQuery {
    for (const key of Object.keys(req.query)) {
      if (!['timeMin', 'timeMax', 'maxResults', 'pageToken'].includes(key)) {
        throw new CalendarError(400, 'INVALID_CALENDAR_QUERY', `Filtro não permitido: ${key}.`);
      }
    }
    const timeMin = this.stringValue(req, 'timeMin') ?? new Date().toISOString();
    const timeMax = this.stringValue(req, 'timeMax');
    this.validateDate(timeMin);
    if (timeMax) this.validateDate(timeMax);
    if (timeMax && Date.parse(timeMax) <= Date.parse(timeMin)) {
      throw new CalendarError(400, 'INVALID_CALENDAR_QUERY', 'timeMax deve ser posterior a timeMin.');
    }
    const limit = this.stringValue(req, 'maxResults') ?? '50';
    const maxResults = Number(limit);
    if (!/^\d+$/.test(limit) || !Number.isInteger(maxResults) || maxResults < 1 || maxResults > 2500) {
      throw new CalendarError(400, 'INVALID_CALENDAR_QUERY', 'maxResults deve estar entre 1 e 2500.');
    }
    const pageToken = this.stringValue(req, 'pageToken');
    return { timeMin, maxResults, ...(timeMax ? { timeMax } : {}), ...(pageToken ? { pageToken } : {}) };
  }

  private stringValue(req: Request, key: string): string | undefined {
    const value = req.query[key];
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || !value.trim() || value.length > 4096) {
      throw new CalendarError(400, 'INVALID_CALENDAR_QUERY', `Filtro inválido: ${key}.`);
    }
    return value;
  }

  private validateDate(value: string): void {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value) ||
        !Number.isFinite(Date.parse(value))) {
      throw new CalendarError(400, 'INVALID_CALENDAR_QUERY', 'Use datas RFC3339 com fuso, como 2026-09-27T00:00:00Z.');
    }
  }
}
