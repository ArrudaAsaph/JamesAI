import type { User, EventsResponse, CalendarEvent, CommandResponse } from '@/interfaces/calendar.interface';

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) {
    super(message);
  }
}

export class ApiService {
  public static readonly loginUrl = '/api/auth/google?client=web';

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetch('/api' + path, { ...init, credentials: 'include', cache: 'no-store' });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new ApiError('Não foi possível conectar. Verifique sua conexão e tente novamente.', 0);
    }
    if (!response.ok) {
      const body = await response.json().catch(function invalidResponse() { return {}; });
      throw new ApiError(body.error || 'Não foi possível carregar os dados. Tente novamente.', response.status, body.code);
    }
    if (response.status === 204) return undefined as T;
    return response.json();
  }

  public async me(signal?: AbortSignal): Promise<User> {
    const result = await this.request<{ user: User }>('/auth/me', { signal });
    return result.user;
  }

  public async logout(): Promise<void> {
    await this.request('/auth/logout', { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
  }

  public async events(from: Date, to: Date, signal?: AbortSignal): Promise<CalendarEvent[]> {
    const items: CalendarEvent[] = [];
    let pageToken: string | undefined;
    const seen = new Set<string>();
    do {
      const query = new URLSearchParams({ timeMin: from.toISOString(), timeMax: to.toISOString(), maxResults: '2500' });
      if (pageToken) query.set('pageToken', pageToken);
      const result = await this.request<EventsResponse>('/calendar/events?' + query, { signal });
      items.push(...result.items);
      pageToken = result.nextPageToken;
      if (pageToken && seen.has(pageToken)) throw new ApiError('Não foi possível carregar todos os eventos. Tente novamente.', 502);
      if (pageToken) seen.add(pageToken);
    } while (pageToken);
    return items.filter(function visible(event) { return event.status !== 'cancelled' && Boolean(event.start); });
  }

  public async command(text: string): Promise<CommandResponse> {
    return this.request<CommandResponse>('/commands', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
    });
  }
}
