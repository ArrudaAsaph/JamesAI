import type { CalendarEvent } from '../interfaces/calendar.interface';

export class CalendarDate {
  public static key(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  public static start(event: CalendarEvent): Date {
    return event.start?.dateTime ? new Date(event.start.dateTime) : new Date((event.start?.date || '1970-01-01') + 'T00:00:00');
  }

  public static occursOn(event: CalendarEvent, day: Date): boolean {
    const start = CalendarDate.start(event);
    const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    const end = event.end?.dateTime ? new Date(event.end.dateTime)
      : event.end?.date ? new Date(event.end.date + 'T00:00:00') : start;
    return end > start ? start < dayEnd && end > dayStart : start >= dayStart && start < dayEnd;
  }

  public static grid(month: Date): Date[] {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    return Array.from({ length: 42 }, function createDay(_, index) {
      return new Date(first.getFullYear(), first.getMonth(), 1 - offset + index);
    });
  }

  public static label(date: Date, options: Intl.DateTimeFormatOptions): string {
    return date.toLocaleDateString('pt-BR', options);
  }

  public static time(event: CalendarEvent): string {
    if (event.start?.date) return 'Dia inteiro';
    return CalendarDate.start(event).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  public static relative(event: CalendarEvent, now = new Date()): string {
    const start = CalendarDate.start(event);
    const a = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
    const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.round((a - b) / 86400000);
    if (CalendarDate.occursOn(event, now)) return 'Hoje';
    if (days === 1) return 'Amanhã';
    if (days > 1) return `Em ${days} dias`;
    return CalendarDate.label(start, { day: 'numeric', month: 'short' });
  }
}
