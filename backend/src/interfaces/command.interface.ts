import type { CalendarEvent } from './calendar.interface.js';

export type CalendarIntent = 'create' | 'update' | 'alert' | 'query' | 'cancel' | 'unknown';

export interface CalendarInterpretation {
  intent: CalendarIntent;
  event: string | null;
  date: string | null;
  time: string | null;
  duration_minutes?: number | null;
  description?: string | null;
  location?: string | null;
  new_event?: string | null;
  reminder_minutes?: number | null;
}

export interface CalendarEventInput {
  summary: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  reminderMinutes?: number;
}

export interface CommandResult {
  text: string;
  context: { id: 'calendar' | 'email' | 'web' } | null;
  interpretation: CalendarInterpretation | null;
  action: 'created' | 'updated' | 'removed' | 'alerted' | 'searched' | 'interpreted' | 'not_understood';
  message: string;
  event?: CalendarEvent;
  emails?: Array<{ id: string; subject: string; from: string; date: string; snippet: string; summary?: string }>;
  sources?: Array<{ title: string; url: string }>;
}
