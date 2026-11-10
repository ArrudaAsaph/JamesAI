import { createHmac, createHash, randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { AuditEntry, AuditRow } from '../interfaces/audit.interface.js';
import type { AuditLogRepository } from '../repositories/audit-log.repository.js';

export class AuditLogService {
  private readonly pending = new Set<Promise<void>>();

  constructor(private readonly repository: AuditLogRepository, private readonly key: string) {}

  public middleware(): RequestHandler {
    return this.recordRequest.bind(this);
  }

  public async systemEvent(eventType: 'system.started' | 'system.stopped'): Promise<void> {
    const entry: AuditEntry = {
      requestId: randomUUID(), occurredAt: new Date().toISOString(), hashVersion: 2,
      eventType, actorId: null, method: null, path: null,
      queryKeys: [], statusCode: null, durationMs: null, ipHash: null, userAgent: null,
      errorCode: null,
    };
    await this.persist(entry);
  }

  public async close(): Promise<void> {
    await Promise.allSettled(Array.from(this.pending));
  }

  public async verifyIntegrity(): Promise<{ valid: boolean; checked: number; invalidSequence?: string }> {
    const entries = await this.repository.listAll();
    let previousHash: string | null = null;
    for (const row of entries) {
      const entry = this.entryFromRow(row);
      const expectedHash = this.sign(entry, previousHash);
      const legacyTimestampHash = row.hashVersion === 1
        ? this.signLegacyTimestamp(entry, previousHash)
        : null;
      if (row.previousHash !== previousHash ||
          (row.entryHash !== expectedHash && row.entryHash !== legacyTimestampHash)) {
        return { valid: false, checked: Number(row.sequence) - 1, invalidSequence: row.sequence };
      }
      previousHash = row.entryHash;
    }
    return { valid: true, checked: entries.length };
  }

  private recordRequest(req: Request, res: Response, next: NextFunction): void {
    const requestId = randomUUID();
    const startedAt = process.hrtime.bigint();
    res.setHeader('X-Request-Id', requestId);
    res.once('finish', this.onResponseFinished.bind(this, req, res, requestId, startedAt));
    next();
  }

  private onResponseFinished(req: Request, res: Response, requestId: string, startedAt: bigint): void {
    const elapsed = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const entry: AuditEntry = {
      requestId,
      occurredAt: new Date().toISOString(),
      hashVersion: 2,
      eventType: this.eventType(req),
      actorId: req.user?.id ?? null,
      method: req.method,
      path: this.path(req),
      queryKeys: Object.keys(req.query).sort(),
      statusCode: res.statusCode,
      durationMs: Math.round(elapsed),
      ipHash: this.hash(req.ip || req.socket.remoteAddress || ''),
      userAgent: this.userAgent(req),
      errorCode: typeof res.locals.auditErrorCode === 'string' ? res.locals.auditErrorCode : null,
    };
    const task = this.persist(entry);
    this.pending.add(task);
    void task.finally(this.removePending.bind(this, task));
  }

  private removePending(task: Promise<void>): void {
    this.pending.delete(task);
  }

  private async persist(entry: AuditEntry): Promise<void> {
    try {
      const entryHash = await this.repository.append(entry, this.sign.bind(this, entry));
      console.info(JSON.stringify({ audit: true, ...entry, entryHash }));
    } catch (error) {
      console.error(JSON.stringify({ audit: true, eventType: 'audit.write_failed',
        requestId: entry.requestId, reason: error instanceof Error ? error.message : 'unknown' }));
    }
  }

  private eventType(req: Request): string {
    const path = this.path(req);
    if (path === '/auth/google') return req.query.code ? 'auth.login.completed' : 'auth.login.started';
    if (path === '/auth/logout') return 'auth.logout';
    if (path === '/auth/me') return 'auth.session.checked';
    if (path === '/calendar/events') return 'calendar.events.listed';
    if (path === '/commands') return 'command.executed';
    if (path === '/emails/search') return 'email.search.executed';
    return 'http.request.completed';
  }

  private path(req: Request): string {
    return new URL(req.originalUrl, 'http://audit.local').pathname.slice(0, 2048);
  }

  private userAgent(req: Request): string | null {
    const userAgent = req.get('user-agent')?.trim();
    return userAgent ? userAgent.slice(0, 512) : null;
  }

  private hash(value: string): string | null {
    return value ? createHmac('sha256', this.key).update(value).digest('hex') : null;
  }

  private sign(entry: AuditEntry, previousHash: string | null): string {
    return this.signCanonical(this.canonical(entry), previousHash);
  }

  private signLegacyTimestamp(entry: AuditEntry, previousHash: string | null): string {
    return this.signCanonical(JSON.stringify({
      requestId: entry.requestId, occurredAt: entry.occurredAt, eventType: entry.eventType,
      actorId: entry.actorId, method: entry.method, path: entry.path, queryKeys: entry.queryKeys,
      statusCode: entry.statusCode, durationMs: entry.durationMs, ipHash: entry.ipHash,
      userAgent: entry.userAgent, errorCode: entry.errorCode,
    }), previousHash);
  }

  private signCanonical(canonical: string, previousHash: string | null): string {
    return createHmac('sha256', this.key)
      .update((previousHash ?? '') + '\n' + canonical)
      .digest('hex');
  }

  private canonical(entry: AuditEntry): string {
    if (entry.hashVersion === 1) {
      return JSON.stringify({
        requestId: entry.requestId, eventType: entry.eventType, actorId: entry.actorId,
        method: entry.method, path: entry.path, queryKeys: entry.queryKeys,
        statusCode: entry.statusCode, durationMs: entry.durationMs, ipHash: entry.ipHash,
        userAgent: entry.userAgent, errorCode: entry.errorCode,
      });
    }
    return JSON.stringify({
      requestId: entry.requestId, occurredAt: entry.occurredAt, hashVersion: entry.hashVersion,
      eventType: entry.eventType, actorId: entry.actorId,
      method: entry.method, path: entry.path, queryKeys: entry.queryKeys,
      statusCode: entry.statusCode, durationMs: entry.durationMs, ipHash: entry.ipHash,
      userAgent: entry.userAgent, errorCode: entry.errorCode,
    });
  }

  private entryFromRow(row: AuditRow): AuditEntry {
    return {
      requestId: row.requestId,
      occurredAt: row.occurredAt.toISOString(),
      hashVersion: row.hashVersion,
      eventType: row.eventType,
      actorId: row.actorId,
      method: row.method,
      path: row.path,
      queryKeys: row.queryKeys,
      statusCode: row.statusCode,
      durationMs: row.durationMs,
      ipHash: row.ipHash,
      userAgent: row.userAgent,
      errorCode: row.errorCode,
    };
  }
}
