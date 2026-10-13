import { CalendarDays, Gift, Video } from 'lucide-react';
import type { CalendarEvent } from '@/interfaces/calendar.interface';
import { CalendarDate } from '@/lib/calendar';

export function EventCard({ event, featured = false, onOpen }: { event: CalendarEvent; featured?: boolean; onOpen: (event: CalendarEvent) => void }) {
  const start = CalendarDate.start(event);
  const Icon = /anivers[aá]rio|birthday/i.test(event.summary || '') ? Gift : event.hangoutLink ? Video : CalendarDays;
  return <button onClick={function open() { onOpen(event); }} className={`flex w-full items-center gap-3 py-1 text-left md:gap-4 md:py-2 ${featured ? 'rounded-full bg-[#103e3a] pl-1 pr-4 text-white' : 'rounded-2xl pl-2 pr-4 hover:bg-[#dff7e5]'}`}>
    <span className={`flex size-12 shrink-0 items-center justify-center md:size-14 ${featured ? 'rounded-full bg-mint' : 'rounded-[15px] bg-[#2c99ff]'}`}><Icon size={28} strokeWidth={1.4} className="text-white" /></span>
    <span className="min-w-0 flex-1"><span className={`block truncate text-[13px] font-medium md:text-[15px] ${featured ? 'text-mint' : ''}`}>{event.summary || 'Evento sem título'}</span><span className={`mt-1 block truncate text-[10px] md:text-xs ${featured ? 'text-white' : 'text-[#087fff]'}`}>{CalendarDate.relative(event)} · {CalendarDate.time(event)}</span></span>
    <span className={`flex w-9 shrink-0 flex-col items-center ${featured ? 'text-white' : 'text-[#0782ff]'}`}><span className="text-[9px] leading-3 md:text-[10px]">{CalendarDate.label(start, { month: 'short' }).replace('.', '')}</span><span className="text-[22px] leading-6 font-semibold">{start.getDate()}</span><span className="text-[9px] leading-3">{event.start?.date ? 'dia todo' : CalendarDate.time(event)}</span></span>
  </button>;
}
