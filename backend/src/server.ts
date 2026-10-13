import { App } from './app.js';
import { Environment } from './config/environment.js';
import type { Server as HttpServer } from 'node:http';

export class Server {
  private readonly application: App;
  private httpServer: HttpServer | undefined;

  constructor(private readonly environment: Environment) {
    this.application = new App(environment);
  }

  public async start(): Promise<void> {
    await this.application.initialize();
    await this.application.auditLog.systemEvent('system.started');
    this.httpServer = this.application.app.listen(this.environment.port, this.onListening.bind(this));
    this.httpServer.on('error', this.onError.bind(this));
    process.once('SIGTERM', this.stop.bind(this));
    process.once('SIGINT', this.stop.bind(this));
  }

  public async stop(): Promise<void> {
    if (this.httpServer) {
      await new Promise<void>(this.closeHttp.bind(this));
    }
    await this.application.auditLog.systemEvent('system.stopped');
    await this.application.close();
  }

  private closeHttp(resolve: () => void): void {
    this.httpServer?.close(function onClose() { resolve(); });
  }

  private async onError(): Promise<void> {
    console.error('Não foi possível iniciar o servidor. Confira se a porta está disponível.');
    await this.stop();
    process.exitCode = 1;
  }

  private onListening(): void {
    console.log(`Servidor iniciado na porta ${this.environment.port}.`);
  }
}

const server = new Server(new Environment());
try {
  await server.start();
} catch {
  console.error('Falha ao iniciar: confira DATABASE_URL e se o PostgreSQL está disponível.');
  await server.stop();
  process.exitCode = 1;
}
