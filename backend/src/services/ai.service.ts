import axios from 'axios';
import type { CalendarInterpretation } from '../interfaces/command.interface.js';
import { CommandError } from '../errors/command.error.js';

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export class AiService {
  constructor(private readonly apiKey: string, private readonly model: string, private readonly url: string) {}

  public async interpretCalendar(prompt: string): Promise<CalendarInterpretation> {
    if (!this.apiKey) throw new CommandError(503, 'AI_NOT_CONFIGURED', 'A interpretação por IA não está configurada.');
    try {
      console.log(prompt)
      const response = await axios.post<OpenRouterResponse>(this.url, {
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        reasoning: {
          "enabled": false
        },
        max_tokens: 350,
      }, { headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }, timeout: 30000 });
      const content = response.data.choices?.[0]?.message?.content;
      console.log(response.data.choices?.[0]?.message)
      if (!content) throw new CommandError(502, 'AI_INVALID_RESPONSE', 'A IA não retornou uma interpretação.');
      return this.parseCalendarInterpretation(content);
    } catch (error) {
      if (error instanceof CommandError) throw error;
      throw new CommandError(502, 'AI_UNAVAILABLE', 'Não foi possível interpretar o comando agora.');
    }
  }

  private parseCalendarInterpretation(content: string): CalendarInterpretation {
    let value: unknown;
    try {
      value = JSON.parse(content.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, ''));
    } catch {
      throw new CommandError(502, 'AI_INVALID_RESPONSE', 'A IA retornou um formato inválido.');
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new CommandError(502, 'AI_INVALID_RESPONSE', 'A IA retornou um formato inválido.');
    }
    const interpretation = value as Record<string, unknown>;
    const intent = interpretation.intent;
    if (!['create', 'update', 'query', 'cancel', 'unknown'].includes(String(intent))) {
      throw new CommandError(502, 'AI_INVALID_RESPONSE', 'A IA retornou uma intenção inválida.');
    }
    return {
      intent: intent as CalendarInterpretation['intent'],
      event: this.optionalText(interpretation.event), date: this.optionalText(interpretation.date),
      time: this.optionalText(interpretation.time), description: this.optionalText(interpretation.description),
      location: this.optionalText(interpretation.location), duration_minutes: this.optionalNumber(interpretation.duration_minutes),
    };
  }

  private optionalText(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim().slice(0, 2048) : null;
  }

  private optionalNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isInteger(value) ? value : null;
  }
}
