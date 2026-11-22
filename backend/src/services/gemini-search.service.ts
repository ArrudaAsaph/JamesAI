import axios from 'axios';
import { CommandError } from '../errors/command.error.js';

interface Citation { type?: string; url?: string; title?: string; }
interface TextBlock { type?: string; text?: string; annotations?: Citation[]; }
interface InteractionStep { type?: string; content?: TextBlock[]; }
interface GeminiInteractionResponse { steps?: InteractionStep[]; output_text?: string; }

export interface WebSearchResult {
  answer: string;
  sources: Array<{ title: string; url: string }>;
}

export class GeminiSearchService {
  constructor(private readonly apiKey: string, private readonly model: string) {}

  public async search(prompt: string): Promise<WebSearchResult> {
    if (!this.apiKey) {
      throw new CommandError(503, 'GEMINI_NOT_CONFIGURED', 'Configure GEMINI_API_KEY no backend para pesquisar na web.');
    }
    try {
      const response = await axios.post<GeminiInteractionResponse>(
        'https://generativelanguage.googleapis.com/v1beta/interactions', {
          model: this.model,
          input: `Pesquise na web com a Busca Google e responda em português do Brasil. ` +
            `Resuma os principais pontos de forma clara, diferencie fatos de incertezas e não invente dados.\n\nPedido: ${prompt}`,
          tools: [{ type: 'google_search' }],
        }, { headers: { 'x-goog-api-key': this.apiKey, 'Content-Type': 'application/json' }, timeout: 60000 });
      return this.parse(response.data);
    } catch (error) {
      if (error instanceof CommandError) throw error;
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 429) {
          throw new CommandError(429, 'GEMINI_RATE_LIMITED',
            'O Gemini recusou a busca por limite de cota. Confira os limites e o faturamento do projeto no Google AI Studio.');
        }
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
          throw new CommandError(504, 'GEMINI_TIMEOUT', 'A busca demorou demais para responder. Tente novamente.');
        }
      }
      throw new CommandError(502, 'GEMINI_SEARCH_UNAVAILABLE', 'Não foi possível pesquisar na web com o Google agora.');
    }
  }

  private parse(response: GeminiInteractionResponse): WebSearchResult {
    const blocks = (response.steps ?? []).filter(function output(step) { return step.type === 'model_output'; })
      .flatMap(function content(step) { return step.content ?? []; });
    const answer = blocks.filter(function text(block) { return block.type === 'text' && typeof block.text === 'string'; })
      .map(function getText(block) { return block.text as string; }).join('\n\n').trim() || response.output_text?.trim() || '';
    if (!answer) throw new CommandError(502, 'GEMINI_EMPTY_RESPONSE', 'O Gemini não retornou uma resposta de busca.');
    const sources = new Map<string, { title: string; url: string }>();
    for (const block of blocks) {
      for (const citation of block.annotations ?? []) {
        if (citation.type !== 'url_citation' || !citation.url) continue;
        try {
          const url = new URL(citation.url);
          if (!['http:', 'https:'].includes(url.protocol) || sources.has(url.href)) continue;
          sources.set(url.href, { title: citation.title?.trim() || url.hostname, url: url.href });
        } catch { /* Ignore malformed citation URLs. */ }
      }
    }
    const citations = Array.from(sources.values()).slice(0, 6);
    if (!citations.length) throw new CommandError(502, 'GEMINI_NO_SOURCES',
      'A busca não retornou fontes verificáveis. Tente novamente.');
    return { answer, sources: citations };
  }
}
