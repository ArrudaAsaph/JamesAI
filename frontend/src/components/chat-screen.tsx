'use client';
import { Component, type FormEvent } from 'react';
import { Bot, LoaderCircle, Mic, SendHorizontal, Square } from 'lucide-react';
import { ApiError, ApiService } from '@/services/api.service';
import type { CommandResponse } from '@/interfaces/calendar.interface';

interface ChatScreenProps {
  onEventsChanged: () => void;
  onSessionExpired: () => void;
}

interface ChatMessage {
  id: string;
  author: 'assistant' | 'user';
  text: string;
  sources?: Array<{ title: string; url: string }>;
}

interface ChatScreenState {
  text: string;
  messages: ChatMessage[];
  recording: boolean;
  sending: boolean;
}

interface SpeechResult { isFinal: boolean; 0: { transcript: string }; }
interface SpeechRecognitionEvent extends Event { resultIndex: number; results: ArrayLike<SpeechResult>; }
interface SpeechRecognitionInstance {
  lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void; abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}
interface SpeechRecognitionConstructor { new (): SpeechRecognitionInstance; }
interface BrowserWindow extends Window { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor; }

export class ChatScreen extends Component<ChatScreenProps, ChatScreenState> {
  private readonly api = new ApiService();
  private recognition: SpeechRecognitionInstance | null = null;
  private finalTranscript = '';
  private interimTranscript = '';
  public state: ChatScreenState = {
    text: '', recording: false, sending: false,
    messages: [{ id: 'welcome', author: 'assistant', text: 'Olá! Posso cuidar da sua agenda, buscar e-mails e pesquisar na web com o Google.' }],
  };

  public componentWillUnmount(): void { this.recognition?.abort(); }

  private async submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await this.send(this.state.text);
  }

  private async send(text: string): Promise<void> {
    const command = text.trim();
    if (!command || this.state.sending) return;
    this.setState(function sending(current) {
      return { sending: true, text: '', messages: [...current.messages, { id: crypto.randomUUID(), author: 'user', text: command }] };
    });
    try {
      const result = await this.api.command(command);
      this.receiveResult(result);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) { this.props.onSessionExpired(); return; }
      this.addAssistantMessage(error instanceof Error ? error.message : 'Não consegui processar este comando.');
    } finally {
      this.setState({ sending: false });
    }
  }

  private receiveResult(result: CommandResponse): void {
    this.addAssistantMessage(result.message, result.sources);
    if (['created', 'updated', 'removed', 'alerted'].includes(result.action)) this.props.onEventsChanged();
  }

  private addAssistantMessage(text: string, sources?: Array<{ title: string; url: string }>): void {
    this.setState(function append(current) {
      return { messages: [...current.messages, { id: crypto.randomUUID(), author: 'assistant', text, ...(sources ? { sources } : {}) }] };
    });
  }

  private toggleRecording(): void {
    if (this.state.recording) { this.recognition?.stop(); return; }
    const browserWindow = window as BrowserWindow;
    const Recognition = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
    if (!Recognition) { this.addAssistantMessage('Seu navegador não oferece reconhecimento de voz. Você pode escrever o comando abaixo.'); return; }
    const recognition = new Recognition();
    this.recognition = recognition;
    this.finalTranscript = '';
    this.interimTranscript = '';
    recognition.lang = 'pt-BR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = this.receiveSpeech.bind(this);
    recognition.onerror = this.speechError.bind(this);
    recognition.onend = this.speechEnded.bind(this);
    try { recognition.start(); this.setState({ recording: true }); }
    catch { this.recognition = null; this.addAssistantMessage('Não consegui iniciar o microfone. Confira a permissão e tente novamente.'); }
  }

  private receiveSpeech(event: SpeechRecognitionEvent): void {
    let interim = '';
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (!result) continue;
      if (result.isFinal) this.finalTranscript += `${result[0].transcript} `;
      else interim += result[0].transcript;
    }
    this.interimTranscript = interim;
    this.setState({ text: `${this.finalTranscript} ${this.interimTranscript}`.replace(/\s+/g, ' ').trim() });
  }

  private speechError(): void {
    this.setState({ recording: false });
    this.addAssistantMessage('Não consegui reconhecer sua voz. Tente novamente ou escreva o comando.');
  }

  private speechEnded(): void {
    this.recognition = null;
    this.setState({ recording: false });
    const transcript = `${this.finalTranscript} ${this.interimTranscript}`.replace(/\s+/g, ' ').trim();
    if (transcript) void this.send(transcript);
  }

  public render(): React.ReactNode {
    const { messages, text, recording, sending } = this.state;
    return <section aria-label="Chat com Charles" className="mx-auto flex min-h-[calc(100dvh-290px)] max-w-2xl flex-col">
      <header className="flex items-center gap-3 border-b border-ink/10 pb-5">
        <span className="flex size-10 items-center justify-center rounded-2xl bg-mint"><Bot size={21} strokeWidth={1.6} /></span>
        <div><h2 className="text-base font-medium">Charles</h2><p className="text-xs text-muted">Assistente da sua agenda</p></div>
      </header>
      <div className="flex flex-1 flex-col gap-3 py-7" aria-live="polite">
        {messages.map(function message(item) {
          return <article key={item.id} className={`max-w-[88%] whitespace-pre-line rounded-2xl px-4 py-3 text-sm leading-6 ${item.author === 'user' ? 'ml-auto bg-ink text-white' : 'bg-white text-ink shadow-[0_6px_20px_rgba(20,54,45,0.05)]'}`}>
            {item.text}
            {item.sources?.length ? <ul className="mt-3 space-y-1 border-t border-ink/10 pt-2 text-xs">
              {item.sources.map(function source(item) {
                return <li key={item.url}><a href={item.url} target="_blank" rel="noreferrer" className="text-ink underline underline-offset-2">{item.title}</a></li>;
              })}
            </ul> : null}
          </article>;
        })}
        {messages.length === 1 && <div className="flex flex-wrap gap-2 pt-1" aria-label="Sugestões de comando">
          {this.quickActions().map(function action(this: ChatScreen, item) {
            return <button key={item.label} type="button" onClick={this.prepareCommand.bind(this, item.text)} disabled={sending || recording}
              className="rounded-full border border-ink/10 bg-white px-3 py-2 text-xs text-ink hover:border-ink/30 disabled:opacity-50">{item.label}</button>;
          }, this)}
        </div>}
        {sending && <p className="flex items-center gap-2 text-xs text-muted"><LoaderCircle size={15} className="animate-spin" /> Charles está organizando sua agenda…</p>}
      </div>
      <form className="sticky bottom-0 flex gap-2 border-t border-ink/10 bg-paper py-4" onSubmit={this.submit.bind(this)}>
        <input value={text} disabled={sending || recording} onChange={this.changeText.bind(this)}
          placeholder={recording ? 'Ouvindo… toque no quadrado para finalizar' : 'Escreva um comando'}
          className="min-w-0 flex-1 rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none placeholder:text-muted focus:border-ink/30 disabled:opacity-70" />
        <button type="button" onClick={this.toggleRecording.bind(this)} disabled={sending} aria-label={recording ? 'Finalizar gravação' : 'Iniciar gravação'} aria-pressed={recording}
          className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${recording ? 'bg-ink text-white' : 'bg-mint text-ink'} disabled:opacity-60`}>
          {recording ? <Square size={16} fill="currentColor" /> : <Mic size={19} strokeWidth={1.8} />}
        </button>
        <button type="submit" disabled={!text.trim() || sending || recording} aria-label="Enviar comando" className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-ink text-white disabled:opacity-40"><SendHorizontal size={18} /></button>
      </form>
    </section>;
  }

  private changeText(event: React.ChangeEvent<HTMLInputElement>): void { this.setState({ text: event.target.value }); }
  private prepareCommand(text: string): void { this.setState({ text }); }
  private quickActions(): Array<{ label: string; text: string }> {
    return [
      { label: 'Criar evento', text: 'Agende uma reunião amanhã às 14h' },
      { label: 'Atualizar evento', text: 'Mude minha reunião de amanhã para 15h' },
      { label: 'Remover evento', text: 'Remova minha reunião de amanhã' },
      { label: 'Criar alerta', text: 'Me alerte 30 minutos antes da minha reunião de amanhã' },
      { label: 'Buscar e-mails', text: 'Busque e-mails sobre orçamento' },
      { label: 'Pesquisar na web', text: 'Pesquise no Google as principais notícias de hoje sobre inteligência artificial' },
    ];
  }
}
