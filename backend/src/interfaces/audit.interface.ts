export interface AuditEntry {
  requestId: string;
  occurredAt: string;
  hashVersion: number;
  eventType: string;
  actorId: string | null;
  method: string | null;
  path: string | null;
  queryKeys: string[];
  statusCode: number | null;
  durationMs: number | null;
  ipHash: string | null;
  userAgent: string | null;
  errorCode: string | null;
}

export interface AuditRow extends Omit<AuditEntry, 'occurredAt'> {
  sequence: string;
  occurredAt: Date;
  previousHash: string | null;
  entryHash: string;
}
