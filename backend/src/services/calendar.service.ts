import axios from 'axios';
import type { CalendarEvents, CalendarQuery, CalendarEvent, CalendarEventInput, CalendarEventUpdate } from '../interfaces/calendar.interface.js';
import type { GoogleTokenService } from './google-token.service.js';
import { CalendarError } from '../errors/calendar.error.js';

export class CalendarService {
  constructor(private readonly tokens: GoogleTokenService) {}

  public async listEvents(userId: string, query: CalendarQuery): Promise<CalendarEvents> {
    let token = await this.tokens.getAccessToken(userId);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await axios.get<CalendarEvents>(
          'https://www.googleapis.com/calendar/v3/calendars/primary/events', {
            headers: { Authorization: `Bearer ${token}` },
            params: { ...query, singleEvents: true, orderBy: 'startTime' },
            timeout: 10000,
          });
        return { items: response.data.items ?? [],
          ...(response.data.nextPageToken ? { nextPageToken: response.data.nextPageToken } : {}),
          ...(response.data.summary ? { summary: response.data.summary } : {}),
          ...(response.data.timeZone ? { timeZone: response.data.timeZone } : {}) };
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          if (status === 401 && attempt === 0) {
            token = await this.tokens.getAccessToken(userId, true);
            continue;
          }
          if (status === 401) throw new CalendarError(403, 'GOOGLE_RECONNECT_REQUIRED',
            'Acesse /auth/google novamente para autorizar o calendário.');
          if (status === 403) throw new CalendarError(403, 'CALENDAR_ACCESS_DENIED',
            'Acesso negado pelo Google. Confira a permissão do calendário e a ativação da Calendar API.');
          if (status === 400) throw new CalendarError(400, 'INVALID_CALENDAR_QUERY',
            'O Google recusou os filtros ou o token de paginação.');
          if (status === 429) throw new CalendarError(429, 'CALENDAR_RATE_LIMIT',
            'Limite de consultas do Google atingido. Tente novamente mais tarde.');
        }
        throw new CalendarError(502, 'CALENDAR_UNAVAILABLE', 'Não foi possível consultar o Google Calendar.');
      }
    }
    throw new CalendarError(502, 'CALENDAR_UNAVAILABLE', 'Não foi possível consultar o Google Calendar.');
  }

  public async createEvent(userId: string, event: CalendarEventInput): Promise<CalendarEvent> {
    let token = await this.tokens.getAccessToken(userId);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await axios.post<CalendarEvent>(
          'https://www.googleapis.com/calendar/v3/calendars/primary/events', {
            summary: event.summary,
            ...(event.description ? { description: event.description } : {}),
            ...(event.location ? { location: event.location } : {}),
            start: { dateTime: event.start, timeZone: 'America/Fortaleza' },
            end: { dateTime: event.end, timeZone: 'America/Fortaleza' },
            ...(event.reminderMinutes !== undefined ? { reminders: this.reminders(event.reminderMinutes) } : {}),
          }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 10000 });
        return response.data;
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          if (status === 401 && attempt === 0) { token = await this.tokens.getAccessToken(userId, true); continue; }
          if (status === 401) throw new CalendarError(403, 'GOOGLE_RECONNECT_REQUIRED',
            'Acesse /auth/google novamente para autorizar o calendário.');
          if (status === 403) throw new CalendarError(403, 'CALENDAR_ACCESS_DENIED',
            'Acesso negado pelo Google. Confira a permissão do calendário e a ativação da Calendar API.');
          if (status === 400) throw new CalendarError(400, 'INVALID_CALENDAR_EVENT',
            'O Google recusou os dados do evento.');
          if (status === 429) throw new CalendarError(429, 'CALENDAR_RATE_LIMIT',
            'Limite de alterações no Google Calendar atingido. Tente novamente mais tarde.');
        }
        throw new CalendarError(502, 'CALENDAR_UNAVAILABLE', 'Não foi possível salvar o evento no Google Calendar.');
      }
    }
    throw new CalendarError(502, 'CALENDAR_UNAVAILABLE', 'Não foi possível salvar o evento no Google Calendar.');
  }

  public async findEvent(userId: string, summary: string, date?: string | null): Promise<CalendarEvent> {
    const timeMin = date ? new Date(`${date}T00:00:00-03:00`) : new Date();
    const timeMax = date ? new Date(timeMin.getTime() + 24 * 60 * 60 * 1000) : new Date(timeMin.getTime() + 366 * 24 * 60 * 60 * 1000);
    const events = await this.listEvents(userId, { timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(), maxResults: 2500 });
    const normalized = this.normalize(summary);
    const matches = (events.items ?? []).filter(function matching(event) {
      const current = event.summary?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim() ?? '';
      return current === normalized || current.includes(normalized) || normalized.includes(current);
    });
    if (!matches.length) throw new CalendarError(404, 'CALENDAR_EVENT_NOT_FOUND', 'Não encontrei esse evento na sua agenda.');
    if (matches.length > 1) throw new CalendarError(409, 'CALENDAR_EVENT_AMBIGUOUS',
      'Encontrei mais de um evento com esse nome. Informe a data e horário para identificá-lo.');
    const match = matches[0];
    if (!match || !match.id) throw new CalendarError(502, 'CALENDAR_UNAVAILABLE', 'O Google retornou um evento inválido.');
    return match;
  }

  public async updateEvent(userId: string, eventId: string, update: CalendarEventUpdate): Promise<CalendarEvent> {
    return this.writeEvent<CalendarEvent>(userId, eventId, 'patch', {
      ...(update.summary ? { summary: update.summary } : {}),
      ...(update.description !== undefined ? { description: update.description } : {}),
      ...(update.location !== undefined ? { location: update.location } : {}),
      ...(update.start ? { start: { dateTime: update.start, timeZone: 'America/Fortaleza' } } : {}),
      ...(update.end ? { end: { dateTime: update.end, timeZone: 'America/Fortaleza' } } : {}),
      ...(update.reminderMinutes !== undefined ? { reminders: this.reminders(update.reminderMinutes) } : {}),
    });
  }

  public async deleteEvent(userId: string, eventId: string): Promise<void> {
    await this.writeEvent<void>(userId, eventId, 'delete');
  }

  private async writeEvent<T>(userId: string, eventId: string, method: 'patch' | 'delete', data?: object): Promise<T> {
    let token = await this.tokens.getAccessToken(userId);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await axios.request<T>({ method,
          url: `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
          data, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 10000 });
        return response.data;
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          if (status === 401 && attempt === 0) { token = await this.tokens.getAccessToken(userId, true); continue; }
          if (status === 401) throw new CalendarError(403, 'GOOGLE_RECONNECT_REQUIRED', 'Acesse /auth/google novamente para autorizar o calendário.');
          if (status === 404) throw new CalendarError(404, 'CALENDAR_EVENT_NOT_FOUND', 'Não encontrei esse evento na sua agenda.');
          if (status === 403) throw new CalendarError(403, 'CALENDAR_ACCESS_DENIED', 'Acesso negado pelo Google Calendar.');
          if (status === 400) throw new CalendarError(400, 'INVALID_CALENDAR_EVENT', 'O Google recusou os dados do evento.');
          if (status === 429) throw new CalendarError(429, 'CALENDAR_RATE_LIMIT', 'Limite de alterações no Google Calendar atingido. Tente novamente mais tarde.');
        }
        throw new CalendarError(502, 'CALENDAR_UNAVAILABLE', 'Não foi possível atualizar o Google Calendar.');
      }
    }
    throw new CalendarError(502, 'CALENDAR_UNAVAILABLE', 'Não foi possível atualizar o Google Calendar.');
  }

  private reminders(minutes: number): { useDefault: false; overrides: Array<{ method: string; minutes: number }> } {
    return { useDefault: false, overrides: [{ method: 'popup', minutes }] };
  }

  private normalize(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }
}
