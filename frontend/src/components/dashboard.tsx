'use client';
import { Component } from 'react';
import { House, ListTodo, UserRound, LogOut, ArrowUpRight, RefreshCw, LoaderCircle, X, AlertCircle, MessageCircle } from 'lucide-react';
import { Brand } from './brand';
import { MonthCalendar } from './month-calendar';
import { EventCard } from './event-card';
import { EventDetails } from './event-details';
import { ChatScreen } from './chat-screen';
import { ApiError, ApiService } from '@/services/api.service';
import { CalendarDate } from '@/lib/calendar';
import type { CalendarEvent } from '@/interfaces/calendar.interface';
import type { DashboardProps, DashboardState, DashboardView } from '@/interfaces/dashboard.interface';

export class Dashboard extends Component<DashboardProps, DashboardState> {
  private readonly api = new ApiService();
  private request: AbortController | null = null;
  public state: DashboardState = {
    month: new Date(new Date().getFullYear(), new Date().getMonth(), 1), selected: null,
    view: 'calendar', events: [], upcoming: [], loading: true, error: null, reconnect: false,
    logoutBusy: false, activeEvent: null, limit: 6, syncedAt: null,
  };

  public componentDidMount(): void { void this.load(); }
  public componentWillUnmount(): void { this.request?.abort(); }

  private async load(): Promise<void> {
    this.request?.abort();
    const controller = new AbortController();
    this.request = controller;
    this.setState({ loading: true, error: null, reconnect: false });
    const days = CalendarDate.grid(this.state.month);
    const now = new Date();
    const horizon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 90);
    const end = new Date(days[41].getFullYear(), days[41].getMonth(), days[41].getDate() + 1);
    try {
      const [events, upcoming] = await Promise.all([
        this.api.events(days[0], end, controller.signal), this.api.events(now, horizon, controller.signal),
      ]);
      if (!controller.signal.aborted) this.setState({ events, upcoming, loading: false, syncedAt: new Date() });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) { this.props.onSessionExpired(); return; }
      this.setState({ loading: false, error: error instanceof Error ? error.message : 'Não foi possível carregar seus eventos.',
        reconnect: error instanceof ApiError && error.status === 403 });
    }
  }

  private changeMonth(month: Date): void {
    this.setState({ month, selected: null, events: [], limit: 6 }, this.load.bind(this));
  }
  private selectDay(day: Date): void {
    const selected = this.state.selected && CalendarDate.key(day) === CalendarDate.key(this.state.selected) ? null : day;
    if (day.getMonth() !== this.state.month.getMonth() || day.getFullYear() !== this.state.month.getFullYear()) {
      this.setState({ month: new Date(day.getFullYear(), day.getMonth(), 1), selected, events: [] }, this.load.bind(this));
    } else this.setState({ selected, limit: 6 });
  }
  private today(): void {
    const now = new Date();
    this.setState({ month: new Date(now.getFullYear(), now.getMonth(), 1), selected: now, events: [], view: 'calendar' }, this.load.bind(this));
  }
  private changeView(view: DashboardView): void { this.setState({ view, selected: null, limit: 6 }); }
  private openEvent(event: CalendarEvent): void { this.setState({ activeEvent: event }); }
  private closeEvent(): void { this.setState({ activeEvent: null }); }
  private clearSelection(): void { this.setState({ selected: null, limit: 6 }); }
  private moreEvents(): void { this.setState({ limit: this.state.limit + 6 }); }
  private async logout(): Promise<void> {
    if (this.state.logoutBusy) return;
    this.setState({ logoutBusy: true });
    try { await this.props.onLogout(); } catch (error) {
      this.setState({ logoutBusy: false, error: error instanceof Error ? error.message : 'Não foi possível sair. Tente novamente.' });
    }
  }

  private navigation(mobile = false): React.ReactNode {
    const entries: { view: DashboardView; label: string; icon: typeof House }[] = [
      { view: 'calendar', label: 'Calendário', icon: House },
      { view: 'agenda', label: 'Próximos eventos', icon: ListTodo },
      { view: 'chat', label: 'Charles', icon: MessageCircle },
      { view: 'account', label: 'Minha conta', icon: UserRound },
    ];
    return entries.map(function item(this: Dashboard, entry) {
      const Icon = entry.icon;
      const active = this.state.view === entry.view;
      return <button key={entry.view} onClick={this.changeView.bind(this, entry.view)}
        aria-label={entry.label} title={entry.label} aria-current={active ? 'page' : undefined}
        className={mobile
          ? `flex size-14 items-center justify-center rounded-[21px] ${active ? 'bg-mint' : 'hover:bg-mint/15'}`
          : `border-b-2 px-1 py-3 text-sm ${active ? 'border-ink font-medium' : 'border-transparent text-ink/65 hover:text-ink'}`}>
        {mobile ? <Icon size={29} strokeWidth={1.6} /> : entry.label}
      </button>;
    }, this);
  }

  private renderEvents(): React.ReactNode {
    if (this.state.error && !this.state.loading) return null;
    const { selected, upcoming, events, loading, limit } = this.state;
    const visible = selected ? events.filter(function onDay(event) { return CalendarDate.occursOn(event, selected); }) : upcoming;
    const title = selected ? CalendarDate.label(selected, { day: 'numeric', month: 'long' }) : 'Próximos eventos';
    return <section id="events" className="mt-5 md:mt-8" aria-label="Lista de eventos">
      <div className={`mb-4 flex items-center justify-between gap-3 ${selected || this.state.view === 'agenda' ? '' : 'sr-only md:not-sr-only md:mb-4 md:flex'}`}>
        <h2 className="text-sm font-medium">{title}</h2>
        {selected && <button onClick={this.clearSelection.bind(this)} className="flex items-center gap-1 py-2 text-xs text-muted"><X size={14} /> Limpar</button>}
      </div>
      {loading ? <div role="status" aria-label="Carregando eventos" className="py-8 text-center text-sm text-muted">Carregando eventos…</div>
        : visible.length ? <div className="space-y-2">{visible.slice(0, limit).map(function card(this: Dashboard, event, i) {
          return <EventCard key={event.id} event={event} featured={i === 0} onOpen={this.openEvent.bind(this)} />;
        }, this)}{visible.length > limit && <button onClick={this.moreEvents.bind(this)} className="mt-3 w-full py-3 text-sm text-[#0875df] hover:underline">Ver mais eventos</button>}</div>
        : <p className="py-8 text-center text-sm text-muted">{selected ? 'Nenhum evento neste dia.' : 'Nenhum evento nos próximos 90 dias.'}</p>}
    </section>;
  }

  public render(): React.ReactNode {
    const { user } = this.props;
    const { view, loading, error, reconnect, activeEvent } = this.state;
    const today = new Date();
    const firstName = user.name?.split(' ')[0] || 'você';
    const greeting = today.getHours() < 12 ? 'Bom dia' : today.getHours() < 18 ? 'Boa tarde' : 'Boa noite';
    return <div className="min-h-dvh bg-mint">
      <header className="mx-auto max-w-[1080px] px-8 pb-7 pt-12 md:px-12 md:pt-6">
        <div className="mb-8 hidden items-center justify-between md:flex"><Brand /><nav className="flex gap-8" aria-label="Navegação principal">{this.navigation()}</nav></div>
        <div className="flex items-center justify-between">
          <div><h1 className="text-[21px] leading-tight font-medium md:text-[27px]">{view === 'chat' ? 'Charles' : `Olá, ${firstName}`}</h1><p className="mt-1 text-[13px]">{view === 'chat' ? 'Seu assistente de agenda' : greeting}</p></div>
          {view !== 'chat' && <button onClick={this.load.bind(this)} disabled={loading} aria-label="Atualizar eventos" title="Atualizar eventos" className="flex size-9 items-center justify-center rounded-full bg-[#ddf8e4] hover:bg-white disabled:opacity-60"><RefreshCw size={18} strokeWidth={1.5} className={loading ? 'animate-spin' : ''} /></button>}
        </div>
      </header>
      <main className="min-h-[calc(100dvh-130px)] rounded-t-[48px] bg-paper px-6 pb-32 pt-8 md:min-h-[calc(100dvh-180px)] md:rounded-t-[64px] md:px-12 md:pb-16 md:pt-10">
        <div className="mx-auto max-w-[760px]">
          {error && <div role="alert" className="mb-6 flex items-start gap-3 border-l-2 border-amber-600 py-2 pl-3"><AlertCircle size={17} className="mt-1 shrink-0 text-amber-800" /><div><p className="text-xs leading-6 text-amber-900">{error}</p>{reconnect ? <a href={ApiService.loginUrl} className="mt-2 inline-flex items-center gap-1 text-xs font-medium underline">Reconectar Google <ArrowUpRight size={14} /></a> : <button onClick={this.load.bind(this)} className="mt-2 text-xs font-medium underline">Tentar novamente</button>}</div></div>}
          {view === 'account' ? <section className="mx-auto max-w-md py-5 md:py-10">
            <UserRound size={35} strokeWidth={1.4} /><h2 className="mt-5 text-xl font-medium">Minha conta</h2>
            <dl className="mt-8 space-y-5"><div><dt className="text-xs text-muted">Nome</dt><dd className="mt-1 text-sm">{user.name || 'Não informado'}</dd></div><div><dt className="text-xs text-muted">E-mail</dt><dd className="mt-1 break-all text-sm">{user.email}</dd></div></dl>
            <button onClick={this.logout.bind(this)} disabled={this.state.logoutBusy} className="mt-9 flex items-center gap-2 py-3 text-sm font-medium text-[#0875df] hover:underline disabled:opacity-60">{this.state.logoutBusy ? <LoaderCircle size={17} className="animate-spin" /> : <LogOut size={17} />} Sair da conta</button>
          </section> : view === 'chat' ? <ChatScreen onEventsChanged={this.load.bind(this)} onSessionExpired={this.props.onSessionExpired} /> : <>
            {view === 'calendar' && <MonthCalendar month={this.state.month} selected={this.state.selected} events={this.state.events} loading={loading} onMonthChange={this.changeMonth.bind(this)} onSelect={this.selectDay.bind(this)} onToday={this.today.bind(this)} />}
            {this.renderEvents()}
          </>}
        </div>
      </main>
      <nav aria-label="Navegação mobile" className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around rounded-t-[54px] bg-[#dff7e5] px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-5 md:hidden">{this.navigation(true)}</nav>
      {activeEvent && <EventDetails event={activeEvent} onClose={this.closeEvent.bind(this)} />}
    </div>;
  }
}
