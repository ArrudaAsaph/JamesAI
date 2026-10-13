import type { User, CalendarEvent } from './calendar.interface';

export type DashboardView = 'calendar' | 'agenda' | 'chat' | 'account';
export interface DashboardProps {
  user: User;
  onLogout: () => Promise<void>;
  onSessionExpired: () => void;
}
export interface DashboardState {
  month: Date;
  selected: Date | null;
  view: DashboardView;
  events: CalendarEvent[];
  upcoming: CalendarEvent[];
  loading: boolean;
  error: string | null;
  reconnect: boolean;
  logoutBusy: boolean;
  activeEvent: CalendarEvent | null;
  limit: number;
  syncedAt: Date | null;
}
