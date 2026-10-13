import { Brand } from './brand';
import { ApiService } from '@/services/api.service';

export function LoginScreen({ error }: { error: boolean }) {
  return <div className="min-h-dvh bg-mint">
    <header className="mx-auto max-w-[1080px] px-8 pb-16 pt-12 md:px-12"><Brand /></header>
    <main className="flex min-h-[calc(100dvh-150px)] justify-center rounded-t-[48px] bg-paper px-8 pb-12 pt-20 md:rounded-t-[64px] md:pt-28">
      <div className="w-full max-w-[340px]">
        <h1 className="text-[28px] font-medium">Entrar no Charles</h1>
        <p className="mt-3 text-sm leading-7 text-muted">Use sua conta Google para acessar<br />seu calendário e seus eventos.</p>
        {error && <p role="alert" className="mt-6 border-l-2 border-red-400 pl-3 text-xs leading-6 text-red-800">O login não foi concluído. Tente novamente e autorize o acesso ao calendário.</p>}
        <a href={ApiService.loginUrl} className="mt-10 flex min-h-14 items-center justify-center gap-3 rounded-xl border border-[#b4cbbb] bg-white px-5 text-sm font-medium transition hover:border-ink">
          <svg width="19" height="19" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.2h6.6c3.9-3.6 6.1-8.9 6.1-15.1Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5.2c-1.8 1.2-4.1 1.9-6.9 1.9-5.3 0-9.8-3.6-11.4-8.4H5.8v5.3A20.4 20.4 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.6 27.4a12.2 12.2 0 0 1 0-7.8v-5.3H5.8a20.1 20.1 0 0 0 0 18.4l6.8-5.3Z"/><path fill="#EA4335" d="M24 11.2c3 0 5.7 1 7.8 3.1l5.8-5.8A19.5 19.5 0 0 0 24 3 20.4 20.4 0 0 0 5.8 14.3l6.8 5.3C14.2 14.8 18.7 11.2 24 11.2Z"/></svg>
          Continuar com Google
        </a>
        <p className="mt-5 text-center text-xs text-muted">O Google vai pedir sua autorização.</p>
      </div>
    </main>
  </div>;
}
