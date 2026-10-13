import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CommandError } from '../errors/command.error.js';

interface ContextFile {
  id: string;
  keywords: string[];
  content: string;
}

export class ContextService {
  constructor(private readonly directory = path.resolve(process.cwd(), 'src/contexts')) {}

  public async findPrompt(text: string): Promise<{ id: 'calendar'; prompt: string } | null> {
    const context = await this.readCalendarContext();
    const normalized = this.normalize(text);
    if (!context.keywords.some(this.hasKeyword.bind(this, normalized))) return null;
    const currentDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    return { id: 'calendar', prompt: context.content.replaceAll('{{message}}', text).replaceAll('{{current_date}}', currentDate) };
  }

  private async readCalendarContext(): Promise<ContextFile> {
    let content: string;
    try {
      content = await readFile(path.join(this.directory, 'calendar-context.md'), 'utf8');
    } catch {
      throw new CommandError(500, 'COMMAND_CONTEXT_UNAVAILABLE', 'O contexto de comandos não está disponível.');
    }
    const parts = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    const metadata = parts?.[1];
    const body = parts?.[2]?.trim();
    const id = metadata?.match(/^id:\s*(.+)$/m)?.[1]?.trim();
    const keywords = metadata?.match(/^keywords:\s*(.+)$/m)?.[1]?.split(',').map(function keyword(value) { return value.trim(); }).filter(Boolean);
    if (id !== 'calendar' || !keywords?.length || !body) {
      throw new CommandError(500, 'COMMAND_CONTEXT_INVALID', 'O contexto de calendário está inválido.');
    }
    return { id, keywords, content: body };
  }

  private normalize(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }

  private hasKeyword(normalizedText: string, keyword: string): boolean {
    const normalizedKeyword = this.normalize(keyword);
    return ` ${normalizedText} `.includes(` ${normalizedKeyword} `);
  }
}
