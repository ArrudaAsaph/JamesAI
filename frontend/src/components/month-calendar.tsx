import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import type { CalendarEvent } from '@/interfaces/calendar.interface';
import { CalendarDate } from '@/lib/calendar';

export function MonthCalendar({ month, selected, events, loading, onMonthChange, onSelect, onToday }: {
  month: Date; selected: Date | null; events: CalendarEvent[]; loading: boolean;
  onMonthChange: (month: Date) => void; onSelect: (day: Date) => void; onToday: () => void;
}) {
  const today = new Date();
  const days = CalendarDate.grid(month);
  const offset = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const visibleDays = days.slice(0, Math.ceil((offset + count) / 7) * 7);
  const months = Array.from({ length: 12 }, function monthName(_, i) { return CalendarDate.label(new Date(2026, i, 1), { month: 'long' }); });
  const years = Array.from({ length: 21 }, function year(_, i) { return today.getFullYear() - 10 + i; });
  if (!years.includes(month.getFullYear())) years.push(month.getFullYear());
  return <section aria-label="Calendário mensal">
    <div className="grid grid-cols-[40px_1fr_40px] items-center">
      <button aria-label="Mês anterior" onClick={function previous() { onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1)); }} className="flex size-10 items-center justify-center rounded-full text-ink/50 hover:bg-[#dff7e5]"><ChevronLeft size={18} strokeWidth={1.5} /></button>
      <h2 className="text-center text-[15px] font-medium text-[#0782ff] md:text-lg">Meu calendário</h2>
      <button aria-label="Próximo mês" onClick={function next() { onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1)); }} className="flex size-10 items-center justify-center rounded-full text-ink/50 hover:bg-[#dff7e5]"><ChevronRight size={18} strokeWidth={1.5} /></button>
    </div>
    <div className="mb-4 mt-2 flex items-center justify-between px-3 md:mb-5 md:mt-4 md:px-5">
      <label className="relative flex items-center"><span className="sr-only">Mês</span><select aria-label="Mês" value={month.getMonth()} onChange={function changeMonth(e) { onMonthChange(new Date(month.getFullYear(), Number(e.target.value), 1)); }} className="appearance-none bg-transparent py-2 pr-6 text-[15px] capitalize text-[#009c79] md:text-base">{months.map(function option(name, i) { return <option key={name} value={i}>{name}</option>; })}</select><ChevronDown size={15} className="pointer-events-none absolute right-0 text-[#009c79]" /></label>
      <button onClick={onToday} className="px-4 py-2 text-xs text-muted hover:text-ink">Hoje</button>
      <label className="relative flex items-center"><span className="sr-only">Ano</span><select aria-label="Ano" value={month.getFullYear()} onChange={function changeYear(e) { onMonthChange(new Date(Number(e.target.value), month.getMonth(), 1)); }} className="appearance-none bg-transparent py-2 pr-6 text-[15px] text-[#009c79] md:text-base">{years.map(function option(year) { return <option key={year}>{year}</option>; })}</select><ChevronDown size={15} className="pointer-events-none absolute right-0 text-[#009c79]" /></label>
    </div>
    <div className="grid grid-cols-7" role="group" aria-label={CalendarDate.label(month, { month: 'long', year: 'numeric' })} aria-busy={loading}>
      {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(function weekday(day) { return <div key={day} className="pb-2 text-center text-xs text-[#278dff] md:pb-3 md:text-sm">{day}</div>; })}
      {visibleDays.map(function renderDay(day) {
        const currentMonth = day.getMonth() === month.getMonth();
        const isToday = CalendarDate.key(day) === CalendarDate.key(today);
        const isSelected = selected && CalendarDate.key(day) === CalendarDate.key(selected);
        const dayEvents = events.filter(function occurs(event) { return CalendarDate.occursOn(event, day); });
        return <button key={CalendarDate.key(day)} onClick={function selectDay() { onSelect(day); }} aria-pressed={Boolean(isSelected)} aria-label={`${CalendarDate.label(day, { day: 'numeric', month: 'long', year: 'numeric' })}, ${dayEvents.length} eventos${isToday ? ', hoje' : ''}`} className={`relative flex h-10 min-w-0 flex-col items-center justify-center rounded-lg md:h-[54px] ${currentMonth ? '' : 'text-[#a4bdad]'}`}>
          <span className={`flex size-8 items-center justify-center rounded-full text-[13px] hover:bg-mint/15 md:size-10 md:text-[15px] ${isSelected ? 'bg-ink text-white hover:bg-ink' : isToday ? 'bg-mint font-medium' : ''}`}>{day.getDate()}</span>
          {dayEvents.length > 0 && <span className={`absolute bottom-0.5 size-[3px] rounded-full md:bottom-1 ${isSelected ? 'bg-ink' : 'bg-[#00b98e]'}`} />}
        </button>;
      })}
    </div>
  </section>;
}
