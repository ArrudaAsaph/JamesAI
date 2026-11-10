export interface EmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  content: string;
  summary?: string;
}

export interface EmailSearchResult {
  messages: EmailMessage[];
  resultSizeEstimate: number;
}

export interface EmailInterpretation {
  intent: 'search';
  query: string;
}
