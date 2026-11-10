import test from 'node:test';
import assert from 'node:assert/strict';
import { occurrences, weekday, addDays, mondayOf } from './dates.js';
import { parseIcs } from './ics.js';
import { sectionOf, splitNames } from './shop.js';

test('Wochentage', () => {
  assert.equal(weekday('2026-11-09'), 0); // Montag
  assert.equal(weekday('2026-11-15'), 6);
  assert.equal(mondayOf('2026-11-12'), '2026-11-09');
  assert.equal(addDays('2026-10-24', 2), '2026-10-26'); // über die Zeitumstellung
});

test('Wiederholungen', () => {
  const w = { start_date: '2026-11-02', rep: 'wöchentlich', exdates: ['2026-11-16'] };
  assert.deepEqual(occurrences(w, '2026-11-09', '2026-11-30'), ['2026-11-09', '2026-11-23', '2026-11-30']);
  const b = { start_date: '2026-11-04', rep: 'alle 2 Wochen' };
  assert.deepEqual(occurrences(b, '2026-11-10', '2026-12-05'), ['2026-11-18', '2026-12-02']);
  const y = { start_date: '2019-03-12', rep: 'jährlich' };
  assert.deepEqual(occurrences(y, '2026-01-01', '2026-12-31'), ['2026-03-12']);
  const m = { start_date: '2026-01-31', rep: 'monatlich' };
  assert.deepEqual(occurrences(m, '2026-02-01', '2026-05-31'), ['2026-03-31', '2026-05-31']);
  const span = { start_date: '2026-11-13', end_date: '2026-11-15', rep: 'keine', all_day: true };
  assert.deepEqual(occurrences(span, '2026-11-14', '2026-11-20'), ['2026-11-14', '2026-11-15']);
  const until = { start_date: '2026-11-02', rep: 'wöchentlich', rep_until: '2026-11-16' };
  assert.deepEqual(occurrences(until, '2026-11-01', '2026-12-31'), ['2026-11-02', '2026-11-09', '2026-11-16']);
});

test('ICS lesen', () => {
  const ics = [
    'BEGIN:VCALENDAR', 'X-WR-CALNAME:Familie',
    'BEGIN:VEVENT', 'UID:a1', 'SUMMARY:Elternabend\\, 6a', 'DTSTART;TZID=Europe/Berlin:20261111T193000', 'DTEND;TZID=Europe/Berlin:20261111T210000', 'CATEGORIES:Catrin', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:a2', 'SUMMARY:Geburtstag Oma', 'DTSTART;VALUE=DATE:19500312', 'DTEND;VALUE=DATE:19500313', 'RRULE:FREQ=YEARLY', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:a3', 'SUMMARY:Fußball', 'DTSTART:20261102T153000Z', 'DTEND:20261102T170000Z', 'RRULE:FREQ=WEEKLY;BYDAY=MO,FR', 'EXDATE:20261109T153000Z', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:a4', 'SUMMARY:Urlaub', 'DTSTART;VALUE=DATE:20261228', 'DTEND;VALUE=DATE:20270102', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:a5', 'SUMMARY:Ab', 'DTSTART:20261101T100000', 'STATUS:CANCELLED', 'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const { events, calName } = parseIcs(ics);
  assert.equal(calName, 'Familie');
  assert.equal(events.length, 5); // Fußball wird zu Mo + Fr, Abgesagtes fällt weg
  const e1 = events[0];
  assert.equal(e1.title, 'Elternabend, 6a');
  assert.equal(e1.from_time, '19:30');
  assert.equal(e1.to_time, '21:00');
  assert.deepEqual(e1.groups, ['Catrin', 'Familie']);
  assert.equal(events[1].kind, 'geburtstag');
  assert.equal(events[1].rep, 'jährlich');
  assert.equal(events[1].all_day, true);
  const fb = events.filter((e) => e.title === 'Fußball');
  assert.deepEqual(fb.map((e) => e.start_date), ['2026-11-02', '2026-11-06']);
  assert.equal(fb[0].from_time, '16:30'); // 15:30 UTC = 16:30 in Berlin (Winterzeit)
  assert.equal(fb[0].ext_uid, 'a3#0');
  const u = events.find((e) => e.title === 'Urlaub');
  assert.equal(u.end_date, '2027-01-01');
});

test('Einkauf', () => {
  assert.equal(sectionOf('Vollmilch'), 'Kühlregal');
  assert.equal(sectionOf('Reis'), 'Vorrat');
  assert.equal(sectionOf('Eis'), 'Tiefkühl');
  assert.equal(sectionOf('Bananen'), 'Obst & Gemüse');
  assert.deepEqual(splitNames('milch, 2 Brot und bananen'), ['Milch', '2 Brot', 'Bananen']);
});
