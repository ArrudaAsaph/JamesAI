'use client';
import { Component } from 'react';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import { Dashboard } from '@/components/dashboard';
import { LoginScreen } from '@/components/login-screen';
import { Brand } from '@/components/brand';
import { ApiError, ApiService } from '@/services/api.service';
import type { User } from '@/interfaces/calendar.interface';

export default class Home extends Component<Record<string, never>, { user: User | null; loading: boolean; error: string | null; loginError: boolean }> {
  private readonly api = new ApiService();
  private controller: AbortController | null = null;
  public state = { user: null as User | null, loading: true, error: null as string | null, loginError: false };

  public componentDidMount(): void {
    this.setState({ loginError: new URLSearchParams(window.location.search).has('error') });
    void this.loadSession();
  }
  public componentWillUnmount(): void { this.controller?.abort(); }
  private async loadSession(): Promise<void> {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.setState({ loading: true, error: null });
    try {
      const user = await this.api.me(controller.signal);
      if (!controller.signal.aborted) this.setState({ user, loading: false });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) this.setState({ user: null, loading: false });
      else this.setState({ loading: false, error: error instanceof Error ? error.message : 'Não foi possível conectar.' });
    }
  }
  private expired(): void { this.setState({ user: null, loading: false }); }
  private async logout(): Promise<void> {
    await this.api.logout();
    this.setState({ user: null, loginError: false });
    window.history.replaceState(null, '', '/');
  }
  public render(): React.ReactNode {
    if (this.state.loading) return <main className="flex min-h-dvh flex-col items-center justify-center gap-8"><Brand /><p role="status" className="flex items-center gap-2 text-sm text-muted"><LoaderCircle size={18} className="animate-spin" /> Carregando…</p></main>;
    if (this.state.error) return <main className="flex min-h-dvh flex-col items-center justify-center gap-7 px-6 text-center"><Brand /><p role="alert" className="max-w-sm text-sm leading-7 text-muted">{this.state.error}</p><button onClick={this.loadSession.bind(this)} className="flex items-center gap-2 rounded-xl bg-mint px-6 py-3 text-sm font-bold"><RefreshCw size={16} /> Tentar novamente</button></main>;
    if (!this.state.user) return <LoginScreen error={this.state.loginError} />;
    return <Dashboard user={this.state.user} onLogout={this.logout.bind(this)} onSessionExpired={this.expired.bind(this)} />;
  }
}
