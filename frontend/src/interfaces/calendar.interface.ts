export interface User {
  id: string;
  name: string | null;
  email: string;
  picture: string | null;
}

export interface CalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  status?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  hangoutLink?: string;
}

export interface EventsResponse {
  items: CalendarEvent[];
  nextPageToken?: string;
  summary?: string;
  timeZone?: string;
}

export interface CommandResponse {
  text: string;
  context: { id: 'calendar' | 'email' | 'web' } | null;
  interpretation: {
    intent: 'create' | 'update' | 'query' | 'cancel' | 'unknown';
    event: string | null;
    date: string | null;
    time: string | null;
  } | null;
  action: 'created' | 'updated' | 'removed' | 'alerted' | 'searched' | 'interpreted' | 'not_understood';
  message: string;
  event?: CalendarEvent;
  emails?: Array<{ id: string; subject: string; from: string; date: string; snippet: string; summary?: string }>;
  sources?: Array<{ title: string; url: string }>;
}
