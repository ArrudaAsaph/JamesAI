export interface CalendarQuery {
  timeMin: string;
  timeMax?: string;
  maxResults: number;
  pageToken?: string;
}

export interface CalendarEvent {
  id?: string;
  summary?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  [field: string]: unknown;
}

export interface CalendarEventInput {
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
}

export interface CalendarEvents {
  items?: CalendarEvent[];
  nextPageToken?: string;
  summary?: string;
  timeZone?: string;
}

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

export interface GoogleTokenRow {
  access_token: string;
  refresh_token: string | null;
  expires_at: Date;
}
