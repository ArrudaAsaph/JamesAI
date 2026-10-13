import { GoogleTokenRepository } from './repositories/google-token.repository.js';
import { TokenCipherService } from './services/token-cipher.service.js';
import { GoogleTokenService } from './services/google-token.service.js';
import { CalendarService } from './services/calendar.service.js';
import { CalendarController } from './controllers/calendar.controller.js';
import { CalendarRouter } from './routes/calendar.router.js';
import { Database } from './database/database.js';
import { PostgresSessionStore } from './database/session.store.js';
import { UserRepository } from './repositories/user.repository.js';
import { AuthMiddleware } from './middlewares/auth.middleware.js';
import { AuditLogMiddleware } from './middlewares/audit-log.middleware.js';
import { AuditLogRepository } from './repositories/audit-log.repository.js';
import { AuditLogService } from './services/audit-log.service.js';
import { CommandService } from './services/command.service.js';
import { CommandController } from './controllers/command.controller.js';
import { CommandRouter } from './routes/command.router.js';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import { AuthController } from './controllers/auth.controller.js';
import { AuthService } from './services/auth.service.js';
import { AuthRouter } from './routes/auth.router.js';
import type { AuthConfig } from './interfaces/auth.interface.js';

export type { AuthConfig } from './interfaces/auth.interface.js';

export class App {
  public readonly app: express.Express;
  public readonly database: Database;
  public readonly auditLog: AuditLogService;
  private readonly sessionStore: PostgresSessionStore;

  constructor(config: AuthConfig) {
    this.app = express();
    this.database = new Database(config.databaseUrl);
    this.auditLog = new AuditLogService(new AuditLogRepository(this.database), config.auditLogKey);
    const users = new UserRepository(this.database);
    const tokens = new GoogleTokenRepository(this.database, new TokenCipherService(config.tokenEncryptionKey));
    const authService = new AuthService(config, users, tokens);
    const calendarService = new CalendarService(new GoogleTokenService(config, tokens));
    const authMiddleware = new AuthMiddleware();
    const calendarRouter = new CalendarRouter(new CalendarController(calendarService), authMiddleware);
    const commandRouter = new CommandRouter(new CommandController(new CommandService(config, calendarService)), authMiddleware);
    const authController = new AuthController(authService, config);
    const authRouter = new AuthRouter(authController, new AuthMiddleware());
    this.app.disable('x-powered-by');

    this.sessionStore = new PostgresSessionStore(this.database);
    this.app.use(session({
      name: 'charles.sid',
      store: this.sessionStore,
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: config.production ?? false,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000,
      },
    }));
    this.app.use(authService.passport.initialize());
    this.app.use(authService.passport.session());
    this.app.use(new AuditLogMiddleware(this.auditLog).create());
    this.app.use(express.json({ limit: '32kb' }));

    this.app.use('/auth', authRouter.router);
    this.app.use('/calendar', calendarRouter.router);
    this.app.use('/commands', commandRouter.router);

    this.app.use(this.handleError.bind(this));
  }

  public async initialize(): Promise<void> {
    await this.database.initialize();
  }

  public async close(): Promise<void> {
    await this.auditLog.close();
    this.sessionStore.close();
    await this.database.close();
  }

  private handleError(_error: unknown, _req: Request, res: Response, _next: NextFunction): void {
    res.locals.auditErrorCode = 'INTERNAL_ERROR';
    res.status(500).json({ error: 'Não foi possível processar a solicitação.' });
  }
}
