import type { AuthConfig } from '../interfaces/auth.interface.js';
import type { CalendarEventInput, CalendarInterpretation, CommandResult } from '../interfaces/command.interface.js';
import type { CalendarService } from './calendar.service.js';
import { CommandError } from '../errors/command.error.js';
import { AiService } from './ai.service.js';
import { ContextService } from './context.service.js';

export class CommandService {
  private readonly context: ContextService;
  private readonly ai: AiService;

  constructor(config: AuthConfig, private readonly calendar: CalendarService) {
    this.context = new ContextService(config.contextsDirectory);
    this.ai = new AiService(config.openRouterApiKey ?? '', config.openRouterModel ?? 'inclusionai/ling-3.0-flash-fin:free',
      config.openRouterApiUrl ?? 'https://openrouter.ai/api/v1/chat/completions');
  }

  public async execute(userId: string, text: string): Promise<CommandResult> {
    const command = text.trim();
    if (!command || command.length > 4000) throw new CommandError(400, 'INVALID_COMMAND', 'Envie um comando com até 4.000 caracteres.');
    const context = await this.context.findPrompt(command);
    if (!context) {
      return { text: command, context: null, interpretation: null, action: 'not_understood',
        message: 'Posso ajudar com comandos para sua agenda. Exemplo: agende uma reunião amanhã às 14h.' };
    }
    const interpretation = await this.ai.interpretCalendar(context.prompt);
    if (interpretation.intent !== 'create') {
      return { text: command, context: { id: 'calendar' }, interpretation, action: 'interpreted',
        message: 'Entendi o comando. Por enquanto posso salvar novos eventos na agenda.' };
    }
    const eventInput = this.eventInput(interpretation);
    const event = await this.calendar.createEvent(userId, eventInput);
    return { text: command, context: { id: 'calendar' }, interpretation, action: 'created', event,
      message: `Evento “${eventInput.summary}” adicionado à sua agenda.` };
  }

  private eventInput(interpretation: CalendarInterpretation): CalendarEventInput {
    if (!interpretation.event || !interpretation.date || !interpretation.time) {
      throw new CommandError(422, 'INCOMPLETE_EVENT', 'Informe o nome, a data e o horário do evento.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(interpretation.date) || !/^\d{2}:\d{2}$/.test(interpretation.time)) {
      throw new CommandError(422, 'INVALID_EVENT_DATE', 'Não foi possível identificar uma data e horário válidos.');
    }
    const duration = interpretation.duration_minutes ?? 60;
    if (!Number.isInteger(duration) || duration < 5 || duration > 720) {
      throw new CommandError(422, 'INVALID_EVENT_DURATION', 'A duração do evento deve estar entre 5 e 720 minutos.');
    }
    const start = new Date(`${interpretation.date}T${interpretation.time}:00-03:00`);
    if (!Number.isFinite(start.getTime())) throw new CommandError(422, 'INVALID_EVENT_DATE', 'Não foi possível identificar uma data e horário válidos.');
    return { summary: interpretation.event, start: start.toISOString(), end: new Date(start.getTime() + duration * 60000).toISOString(),
      ...(interpretation.description ? { description: interpretation.description } : {}),
      ...(interpretation.location ? { location: interpretation.location } : {}) };
  }
}
