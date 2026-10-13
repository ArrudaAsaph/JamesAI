'use client';
import { useEffect, useRef } from 'react';
import { X, CalendarDays, Clock3, MapPin, ExternalLink, Video } from 'lucide-react';
import type { CalendarEvent } from '@/interfaces/calendar.interface';
import { CalendarDate } from '@/lib/calendar';

function safeUrl(value?: string): string | undefined {
  if (!value) return;
  try { const url = new URL(value); if (url.protocol === 'https:') return url.toString(); } catch { return; }
}

export function EventDetails({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(function showDialog() { dialog.current?.showModal(); }, []);
  const meeting = safeUrl(event.hangoutLink);
  const calendar = safeUrl(event.htmlLink);
  return <dialog ref={dialog} onCancel={onClose} onClick={function backdrop(e) { if (e.target === e.currentTarget) onClose(); }} aria-labelledby="event-title" className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-32px)] max-w-lg overflow-auto rounded-[28px] border-0 bg-paper p-0 text-ink backdrop:bg-[#082a25]/40">
    <div className="p-6 sm:p-8"><div className="flex items-center justify-between"><span className="flex size-12 items-center justify-center rounded-2xl bg-mint"><CalendarDays size={24} /></span><button autoFocus onClick={onClose} aria-label="Fechar detalhes" className="rounded-full p-2 hover:bg-line"><X size={20} /></button></div>
      <h2 id="event-title" className="mt-6 text-xl font-medium">{event.summary || 'Evento sem título'}</h2>
      <div className="mt-6 space-y-4 text-sm"><p className="flex items-center gap-3"><CalendarDays size={17} className="shrink-0 text-[#00a780]" />{CalendarDate.label(CalendarDate.start(event), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p><p className="flex items-center gap-3"><Clock3 size={17} className="text-[#00a780]" />{CalendarDate.time(event)}{event.end?.dateTime && ` — ${new Date(event.end.dateTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}</p>{event.location && <p className="flex items-start gap-3"><MapPin size={17} className="shrink-0 text-[#00a780]" />{event.location}</p>}</div>
      {event.description && <p className="mt-6 max-h-44 overflow-auto whitespace-pre-wrap break-words border-t border-line pt-5 text-sm leading-6 text-muted">{event.description.replace(/<[^>]*>/g, '')}</p>}
      <div className="mt-7 flex flex-wrap gap-3">{meeting && <a href={meeting} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-xl bg-mint px-4 py-3 text-sm font-bold"><Video size={16} /> Entrar na reunião</a>}{calendar && <a href={calendar} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-xl border border-line px-4 py-3 text-sm font-semibold">Abrir no Google <ExternalLink size={14} /></a>}</div>
    </div>
  </dialog>;
}
