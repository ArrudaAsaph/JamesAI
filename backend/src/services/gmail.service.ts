import axios from 'axios';
import type { EmailMessage, EmailSearchResult } from '../interfaces/email.interface.js';
import type { GoogleTokenService } from './google-token.service.js';
import { CalendarError } from '../errors/calendar.error.js';

interface GmailListResponse { messages?: Array<{ id: string; threadId: string }>; resultSizeEstimate?: number; }
interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}
interface GmailMessageResponse {
  id: string;
  threadId: string;
  internalDate?: string;
  snippet?: string;
  payload?: GmailPart & { headers?: Array<{ name?: string; value?: string }> };
}

export class GmailService {
  constructor(private readonly tokens: GoogleTokenService) {}

  public async search(userId: string, query: string, maxResults: number): Promise<EmailSearchResult> {
    const token = await this.tokens.getAccessToken(userId);
    try {
      const list = await axios.get<GmailListResponse>('https://gmail.googleapis.com/gmail/v1/users/me/messages', {
        headers: { Authorization: `Bearer ${token}` }, params: { q: query, maxResults }, timeout: 10000,
      });
      const messages = await Promise.all((list.data.messages ?? []).map(this.getMessage.bind(this, token)));
      messages.sort(function newestFirst(first, second) { return (second.internalDate ?? 0) - (first.internalDate ?? 0); });
      return { messages, resultSizeEstimate: list.data.resultSizeEstimate ?? messages.length };
    } catch (error) {
      if (axios.isAxiosError(error)) this.throwGoogleError(error.response?.status);
      throw error;
    }
  }

  public async latest(userId: string, direction: 'received' | 'sent' = 'received'): Promise<EmailSearchResult> {
    const result = await this.search(userId, direction === 'sent' ? 'in:sent' : 'in:inbox', 10);
    return { messages: result.messages.slice(0, 1), resultSizeEstimate: result.resultSizeEstimate };
  }

  private async getMessage(token: string, message: { id: string; threadId: string }): Promise<EmailMessage> {
    try {
      const response = await axios.get<GmailMessageResponse>(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(message.id)}`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { format: 'full' }, timeout: 10000,
        });
      const headers = response.data.payload?.headers ?? [];
      return { id: response.data.id, threadId: response.data.threadId,
        ...(response.data.internalDate && Number.isFinite(Number(response.data.internalDate))
          ? { internalDate: Number(response.data.internalDate) } : {}),
        subject: this.header(headers, 'Subject') || '(sem assunto)',
        from: this.header(headers, 'From') || '(remetente não informado)', date: this.header(headers, 'Date') || '',
        snippet: response.data.snippet ?? '', content: this.messageContent(response.data.payload) || response.data.snippet || '' };
    } catch (error) {
      if (axios.isAxiosError(error)) this.throwGoogleError(error.response?.status);
      throw error;
    }
  }

  private header(headers: Array<{ name?: string; value?: string }>, name: string): string | undefined {
    return headers.find(function findHeader(header) { return header.name?.toLowerCase() === name.toLowerCase(); })?.value;
  }

  private messageContent(payload: GmailPart | undefined): string {
    if (!payload) return '';
    const parts = this.parts(payload);
    const plain = parts.filter(function plainText(part) { return part.mimeType === 'text/plain'; })
      .map(this.decodePart.bind(this)).filter(Boolean).join('\n');
    const html = parts.filter(function htmlText(part) { return part.mimeType === 'text/html'; })
      .map(this.decodePart.bind(this)).filter(Boolean).join('\n');
    const content = plain || this.stripHtml(html);
    return content.replace(/\s+/g, ' ').trim().slice(0, 12000);
  }

  private parts(part: GmailPart): GmailPart[] {
    return [part, ...(part.parts ?? []).flatMap(this.parts.bind(this))];
  }

  private decodePart(part: GmailPart): string {
    return part.body?.data ? Buffer.from(part.body.data, 'base64url').toString('utf8') : '';
  }

  private stripHtml(value: string): string {
    return value.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
  }

  private throwGoogleError(status: number | undefined): never {
    if (status === 401) throw new CalendarError(403, 'GOOGLE_RECONNECT_REQUIRED', 'Acesse /auth/google novamente para autorizar o acesso ao Gmail.');
    if (status === 403) throw new CalendarError(403, 'GMAIL_ACCESS_DENIED', 'Acesso ao Gmail negado. Entre novamente para conceder a permissão de leitura de e-mails.');
    if (status === 400) throw new CalendarError(400, 'INVALID_EMAIL_QUERY', 'A busca de e-mails não é válida.');
    if (status === 429) throw new CalendarError(429, 'GMAIL_RATE_LIMIT', 'Limite de buscas no Gmail atingido. Tente novamente mais tarde.');
    throw new CalendarError(502, 'GMAIL_UNAVAILABLE', 'Não foi possível buscar seus e-mails agora.');
  }
}
