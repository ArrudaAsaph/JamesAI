import { Environment } from './config/environment.js';
import { Database } from './database/database.js';
import { AuditLogRepository } from './repositories/audit-log.repository.js';
import { AuditLogService } from './services/audit-log.service.js';

const environment = new Environment();
const database = new Database(environment.databaseUrl);

try {
  await database.initialize();
  const auditLog = new AuditLogService(new AuditLogRepository(database), environment.auditLogKey);
  const result = await auditLog.verifyIntegrity();
  if (!result.valid) {
    console.error(`Falha de integridade no registro de auditoria ${result.invalidSequence}.`);
    process.exitCode = 1;
  } else {
    console.info(`Integridade confirmada para ${result.checked} registros de auditoria.`);
  }
} finally {
  await database.close();
}
