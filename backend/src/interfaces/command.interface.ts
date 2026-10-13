import type { CalendarEvent } from './calendar.interface.js';

export type CalendarIntent = 'create' | 'update' | 'query' | 'cancel' | 'unknown';

export interface CalendarInterpretation {
  intent: CalendarIntent;
  event: string | null;
  date: string | null;
  time: string | null;
  duration_minutes?: number | null;
  description?: string | null;
  location?: string | null;
}

export interface CalendarEventInput {
  summary: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
}

export interface CommandResult {
  text: string;
  context: { id: 'calendar' } | null;
  interpretation: CalendarInterpretation | null;
  action: 'created' | 'interpreted' | 'not_understood';
  message: string;
  event?: CalendarEvent;
}
