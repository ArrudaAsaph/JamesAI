import type { AuthConfig } from '../interfaces/auth.interface.js';
import type { CalendarEventInput, CalendarInterpretation, CommandResult } from '../interfaces/command.interface.js';
import type { CalendarEvent, CalendarEventUpdate } from '../interfaces/calendar.interface.js';
import type { CalendarService } from './calendar.service.js';
import type { GmailService } from './gmail.service.js';
import type { GeminiSearchService } from './gemini-search.service.js';
import { CommandError } from '../errors/command.error.js';
import { AiService } from './ai.service.js';
import { ContextService } from './context.service.js';

export class CommandService {
  private readonly context: ContextService;
  private readonly ai: AiService;

  constructor(config: AuthConfig, private readonly calendar: CalendarService, private readonly gmail: GmailService,
    private readonly webSearch: GeminiSearchService) {
    this.context = new ContextService(config.contextsDirectory);
    this.ai = new AiService(config.openRouterApiKey ?? '', config.openRouterModel ?? 'openrouter/free',
      config.openRouterApiUrl ?? 'https://openrouter.ai/api/v1/chat/completions');
  }

  public async execute(userId: string, text: string): Promise<CommandResult> {
    const command = text.trim();
    if (!command || command.length > 4000) throw new CommandError(400, 'INVALID_COMMAND', 'Envie um comando com até 4.000 caracteres.');
    if (this.isMeaningOfLifeQuestion(command)) return { text: command, context: null, interpretation: null,
      action: 'not_understood', message: 'Não existe uma resposta única para o sentido da vida. Muitas pessoas encontram significado nas relações, no aprendizado, na criação e em contribuir com algo que consideram importante.' };
    const context = await this.context.findPrompt(command);
    if (!context) return { text: command, context: null, interpretation: null, action: 'not_understood',
      message: 'Ainda não consigo responder a esse tema sem consultar um serviço. Posso ajudar com sua agenda, resumir e-mails ou pesquisar informações atuais na web.' };
    if (context.id === 'email') return this.searchEmails(userId, command, context.prompt);
    if (context.id === 'web') {
      const result = await this.webSearch.search(command);
      return { text: command, context: { id: 'web' }, interpretation: null, action: 'searched',
        message: result.answer, sources: result.sources };
    }
    const interpretation = await this.ai.interpretCalendar(context.prompt);
    if (interpretation.intent === 'create') return this.createEvent(userId, command, interpretation);
    if (interpretation.intent === 'cancel') return this.removeEvent(userId, command, interpretation);
    if (interpretation.intent === 'update') return this.updateEvent(userId, command, interpretation);
    if (interpretation.intent === 'alert') return this.alertEvent(userId, command, interpretation);
    return { text: command, context: { id: 'calendar' }, interpretation, action: 'interpreted',
      message: 'Entendi o comando, mas preciso de mais detalhes para executá-lo.' };
  }

  private async createEvent(userId: string, text: string, interpretation: CalendarInterpretation): Promise<CommandResult> {
    const eventInput = this.eventInput(interpretation);
    const event = await this.calendar.createEvent(userId, eventInput);
    return { text, context: { id: 'calendar' }, interpretation, action: 'created', event,
      message: `Evento “${eventInput.summary}” adicionado à sua agenda.` };
  }

  private async removeEvent(userId: string, text: string, interpretation: CalendarInterpretation): Promise<CommandResult> {
    const event = await this.targetEvent(userId, interpretation);
    await this.calendar.deleteEvent(userId, event.id as string);
    return { text, context: { id: 'calendar' }, interpretation, action: 'removed',
      message: `Evento “${event.summary ?? interpretation.event}” removido da sua agenda.` };
  }

  private async alertEvent(userId: string, text: string, interpretation: CalendarInterpretation): Promise<CommandResult> {
    if (!interpretation.reminder_minutes || interpretation.reminder_minutes < 1 || interpretation.reminder_minutes > 40320) {
      throw new CommandError(422, 'INVALID_REMINDER', 'Informe quando deseja ser avisado, em até 28 dias antes do evento.');
    }
    const event = await this.targetEvent(userId, interpretation);
    const updated = await this.calendar.updateEvent(userId, event.id as string, { reminderMinutes: interpretation.reminder_minutes });
    return { text, context: { id: 'calendar' }, interpretation, action: 'alerted', event: updated,
      message: `Alerta configurado ${this.reminderLabel(interpretation.reminder_minutes)} para “${event.summary}”.` };
  }

  private async updateEvent(userId: string, text: string, interpretation: CalendarInterpretation): Promise<CommandResult> {
    const event = await this.targetEvent(userId, interpretation);
    const update = this.eventUpdate(event, interpretation);
    const updated = await this.calendar.updateEvent(userId, event.id as string, update);
    return { text, context: { id: 'calendar' }, interpretation, action: 'updated', event: updated,
      message: `Evento “${event.summary ?? interpretation.event}” atualizado.` };
  }

  private async searchEmails(userId: string, text: string, prompt: string): Promise<CommandResult> {
    const latestDirection = this.latestEmailDirection(text);
    const result = latestDirection
      ? await this.gmail.latest(userId, latestDirection)
      : await this.gmail.search(userId, (await this.ai.interpretEmail(prompt)).query, 10);
    const displayed = result.messages.slice(0, 5);
    const summaries = await this.ai.summarizeEmails(displayed);
    const details = displayed.map(function label(email) {
      return `• ${email.subject} — ${email.from}\n  Sobre: ${summaries.get(email.id) ?? 'Resumo indisponível.'}`;
    }).join('\n');
    const emails = result.messages.map(function publicEmail(email) {
      const { content: _content, ...safeEmail } = email;
      const summary = summaries.get(email.id);
      const { internalDate: _internalDate, ...publicEmail } = safeEmail;
      return { ...publicEmail, ...(summary ? { summary } : {}) };
    });
    return { text, context: { id: 'email' }, interpretation: null, action: 'searched', emails,
      message: result.messages.length
        ? `Encontrei ${latestDirection ? 'o e-mail mais recente' : `cerca de ${result.resultSizeEstimate} e-mail(s)`}. Mostrando ${displayed.length}:\n${details}`
        : latestDirection === 'sent' ? 'Não encontrei e-mails enviados.' : latestDirection === 'received'
          ? 'Não encontrei e-mails na caixa de entrada.' : 'Não encontrei e-mails para essa busca.' };
  }

  private latestEmailDirection(text: string): 'received' | 'sent' | null {
    const value = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (!/\b(ultimo|ultima|mais recente)\b/.test(value) || !/\b(e-?mail|mensagem)\b/.test(value)) return null;
    if (/\b(enviei|enviado|enviada|mandei|envio)\b/.test(value)) return 'sent';
    return 'received';
  }

  private isMeaningOfLifeQuestion(text: string): boolean {
    const value = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return /\bsentido da vida\b/.test(value);
  }

  private async targetEvent(userId: string, interpretation: CalendarInterpretation): Promise<CalendarEvent> {
    if (!interpretation.event) throw new CommandError(422, 'INCOMPLETE_EVENT', 'Informe o nome do evento que deseja alterar.');
    if (interpretation.date && !/^\d{4}-\d{2}-\d{2}$/.test(interpretation.date)) {
      throw new CommandError(422, 'INVALID_EVENT_DATE', 'Não foi possível identificar a data do evento.');
    }
    return this.calendar.findEvent(userId, interpretation.event, interpretation.date);
  }

  private eventInput(interpretation: CalendarInterpretation): CalendarEventInput {
    if (!interpretation.event || !interpretation.date || !interpretation.time) {
      throw new CommandError(422, 'INCOMPLETE_EVENT', 'Informe o nome, a data e o horário do evento.');
    }
    const timing = this.timing(interpretation.date, interpretation.time, interpretation.duration_minutes ?? 60);
    return { summary: interpretation.event, start: timing.start, end: timing.end,
      ...(interpretation.description ? { description: interpretation.description } : {}),
      ...(interpretation.location ? { location: interpretation.location } : {}),
      ...(interpretation.reminder_minutes ? { reminderMinutes: this.reminderMinutes(interpretation.reminder_minutes) } : {}) };
  }

  private eventUpdate(event: CalendarEvent, interpretation: CalendarInterpretation): CalendarEventUpdate {
    const update: CalendarEventUpdate = {};
    if (interpretation.new_event) update.summary = interpretation.new_event;
    if (interpretation.description) update.description = interpretation.description;
    if (interpretation.location) update.location = interpretation.location;
    if (interpretation.reminder_minutes) update.reminderMinutes = this.reminderMinutes(interpretation.reminder_minutes);
    if (interpretation.date || interpretation.time) {
      const original = event.start?.dateTime;
      if (!original) throw new CommandError(422, 'UNSUPPORTED_EVENT', 'Não é possível alterar o horário de um evento de dia inteiro por voz.');
      const date = interpretation.date ?? this.datePart(new Date(original));
      const time = interpretation.time ?? this.timePart(new Date(original));
      const duration = interpretation.duration_minutes ?? this.duration(event);
      const timing = this.timing(date, time, duration);
      update.start = timing.start;
      update.end = timing.end;
    }
    if (!Object.keys(update).length) throw new CommandError(422, 'INCOMPLETE_EVENT', 'Informe o que deseja alterar no evento.');
    return update;
  }

  private timing(date: string, time: string, duration: number): { start: string; end: string } {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
      throw new CommandError(422, 'INVALID_EVENT_DATE', 'Não foi possível identificar uma data e horário válidos.');
    }
    if (!Number.isInteger(duration) || duration < 5 || duration > 720) {
      throw new CommandError(422, 'INVALID_EVENT_DURATION', 'A duração do evento deve estar entre 5 e 720 minutos.');
    }
    const start = new Date(`${date}T${time}:00-03:00`);
    if (!Number.isFinite(start.getTime())) throw new CommandError(422, 'INVALID_EVENT_DATE', 'Não foi possível identificar uma data e horário válidos.');
    return { start: start.toISOString(), end: new Date(start.getTime() + duration * 60000).toISOString() };
  }

  private duration(event: CalendarEvent): number {
    const start = event.start?.dateTime ? Date.parse(event.start.dateTime) : NaN;
    const end = event.end?.dateTime ? Date.parse(event.end.dateTime) : NaN;
    const duration = Math.round((end - start) / 60000);
    return Number.isInteger(duration) && duration >= 5 && duration <= 720 ? duration : 60;
  }

  private datePart(value: Date): string { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value); }
  private timePart(value: Date): string { return new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Fortaleza', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(value); }
  private reminderMinutes(value: number): number { if (!Number.isInteger(value) || value < 1 || value > 40320) throw new CommandError(422, 'INVALID_REMINDER', 'O alerta deve ser entre 1 minuto e 28 dias antes do evento.'); return value; }
  private reminderLabel(minutes: number): string { return minutes < 60 ? `${minutes} minuto(s) antes` : minutes % 60 === 0 ? `${minutes / 60} hora(s) antes` : `${minutes} minutos antes`; }
}
