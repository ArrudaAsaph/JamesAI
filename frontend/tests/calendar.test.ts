import test from 'node:test';
import assert from 'node:assert/strict';
import { CalendarDate } from '../src/lib/calendar';

test('calendário começa na segunda-feira e inclui fevereiro bissexto', function leapYear() {
  const days = CalendarDate.grid(new Date(2028, 1, 1));
  assert.equal(days.length, 42);
  assert.equal(days[0].getDay(), 1);
  assert.ok(days.some(function leap(day) { return CalendarDate.key(day) === '2028-02-29'; }));
  assert.equal(days[41].getDay(), 0);
});

test('evento de dia inteiro respeita o fim exclusivo e o fuso local', function allDay() {
  const event = { id: '1', start: { date: '2026-09-27' }, end: { date: '2026-09-29' } };
  assert.equal(CalendarDate.key(CalendarDate.start(event)), '2026-09-27');
  assert.equal(CalendarDate.occursOn(event, new Date(2026, 8, 27)), true);
  assert.equal(CalendarDate.occursOn(event, new Date(2026, 8, 28)), true);
  assert.equal(CalendarDate.occursOn(event, new Date(2026, 8, 29)), false);
});

test('evento que atravessa meia-noite aparece nos dois dias', function overnight() {
  const event = { id: '2', start: { dateTime: new Date(2026, 8, 27, 23).toISOString() }, end: { dateTime: new Date(2026, 8, 28, 1).toISOString() } };
  assert.equal(CalendarDate.occursOn(event, new Date(2026, 8, 27)), true);
  assert.equal(CalendarDate.occursOn(event, new Date(2026, 8, 28)), true);
  assert.equal(CalendarDate.occursOn(event, new Date(2026, 8, 29)), false);
});
