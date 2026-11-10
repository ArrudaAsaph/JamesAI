import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CommandError } from '../errors/command.error.js';

type ContextId = 'calendar' | 'email' | 'web';
interface ContextFile { id: ContextId; keywords: string[]; content: string; }

export class ContextService {
  constructor(private readonly directory = path.resolve(process.cwd(), 'src/contexts')) {}

  public async findPrompt(text: string): Promise<{ id: ContextId; prompt: string } | null> {
    const contexts = await Promise.all([this.readContext('calendar'), this.readContext('email'), this.readContext('web')]);
    const normalized = this.normalize(text);
    const matches = contexts.map(function score(context) {
      return { context, score: context.keywords.filter(function keyword(keyword) {
        return ` ${normalized} `.includes(` ${normalizeKeyword(keyword)} `);
      }).length };
    }).filter(function matched(match) { return match.score > 0; }).sort(function byScore(first, second) { return second.score - first.score; });
    const selected = matches[0]?.context;
    if (!selected) return null;
    const currentDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    return { id: selected.id, prompt: selected.content.replaceAll('{{message}}', text).replaceAll('{{current_date}}', currentDate) };
  }

  private async readContext(id: ContextId): Promise<ContextFile> {
    let content: string;
    try { content = await readFile(path.join(this.directory, `${id}-context.md`), 'utf8'); }
    catch { throw new CommandError(500, 'COMMAND_CONTEXT_UNAVAILABLE', 'O contexto de comandos não está disponível.'); }
    const parts = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    const metadata = parts?.[1];
    const body = parts?.[2]?.trim();
    const parsedId = metadata?.match(/^id:\s*(.+)$/m)?.[1]?.trim();
    const keywords = metadata?.match(/^keywords:\s*(.+)$/m)?.[1]?.split(',').map(function keyword(value) { return value.trim(); }).filter(Boolean);
    if (parsedId !== id || !keywords?.length || !body) {
      throw new CommandError(500, 'COMMAND_CONTEXT_INVALID', `O contexto de ${id} está inválido.`);
    }
    return { id, keywords, content: body };
  }

  private normalize(value: string): string { return normalizeKeyword(value); }
}

function normalizeKeyword(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
