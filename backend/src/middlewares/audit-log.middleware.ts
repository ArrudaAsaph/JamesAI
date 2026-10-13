import type { RequestHandler } from 'express';
import type { AuditLogService } from '../services/audit-log.service.js';

export class AuditLogMiddleware {
  constructor(private readonly auditLog: AuditLogService) {}

  public create(): RequestHandler {
    return this.auditLog.middleware();
  }
}
