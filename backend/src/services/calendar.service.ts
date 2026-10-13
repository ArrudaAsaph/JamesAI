import axios from 'axios';
import type { CalendarEvents, CalendarQuery, CalendarEvent, CalendarEventInput } from '../interfaces/calendar.interface.js';
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
}
