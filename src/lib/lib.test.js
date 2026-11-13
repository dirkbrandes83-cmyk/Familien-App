import test from 'node:test';
import assert from 'node:assert/strict';
import { occurrences, weekday, addDays, mondayOf } from './dates.js';
import { parseIcs } from './ics.js';
import { sectionOf, splitNames } from './shop.js';
import { binsForWeek, muellStatus, agoLabel, weekdaysLabel } from './home.js';

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

test('UTC-Zeiten werden Bremer Zeit, unabhängig von der Zeitzone des Geräts', () => {
  const { events } = parseIcs('BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:s1\nSUMMARY:Sommer\nDTSTART:20260710T170000Z\nEND:VEVENT\nBEGIN:VEVENT\nUID:s2\nSUMMARY:Spät\nDTSTART:20261110T233000Z\nEND:VEVENT\nEND:VCALENDAR');
  assert.equal(events[0].from_time, '19:00');
  assert.equal(events[1].start_date, '2026-11-11');
  assert.equal(events[1].from_time, '00:30');
});

test('Einkauf', () => {
  assert.equal(sectionOf('Vollmilch'), 'Kühlregale');
  assert.equal(sectionOf('Reis'), 'Konserven etc.');
  assert.equal(sectionOf('Eis'), 'TK');
  assert.equal(sectionOf('Bananen'), 'Obst und Gemüse');
  assert.equal(sectionOf('Müsli'), 'Backwaren, Müsli etc.');
  assert.equal(sectionOf('Gummibärchen'), 'Süßes');
  assert.equal(sectionOf('Zahnpasta'), 'Rossmann DM');
  assert.equal(sectionOf('Hafermilch', { hafermilch: 'Konserven etc.' }), 'Konserven etc.'); // gelernt
  assert.deepEqual(splitNames('milch, 2 Brot und bananen'), ['Milch', '2 Brot', 'Bananen']);
});

test('Müll', () => {
  const m = { ref_monday: '2026-11-09', pickup_weekday: 2, out_weekday: 1, week_a: ['papier', 'gelb'], week_b: ['bio', 'rest'] };
  assert.deepEqual(binsForWeek(m, '2026-11-11'), ['papier', 'gelb']); // KW 46 = A
  assert.deepEqual(binsForWeek(m, '2026-11-18'), ['bio', 'rest']);   // KW 47 = B
  assert.deepEqual(binsForWeek(m, '2026-11-04'), ['bio', 'rest']);   // KW 45 = B
  assert.equal(muellStatus(m, '2026-11-10').text, 'Heute Abend raus');
  assert.equal(muellStatus(m, '2026-11-11').text, 'Heute ist Abholung');
  const th = muellStatus(m, '2026-11-12');
  assert.equal(th.text, 'Dienstag abends raus');
  assert.deepEqual(th.bins, ['bio', 'rest']);
  assert.equal(muellStatus(m, '2026-11-16').text, 'Morgen Abend raus');
});

test('Haushalt-Texte', () => {
  assert.equal(agoLabel('2026-11-08', '2026-11-10'), 'vor 2 Tagen');
  assert.equal(agoLabel(null, '2026-11-10'), 'noch nie');
  assert.equal(weekdaysLabel([5, 6]), 'am Wochenende');
  assert.equal(weekdaysLabel([0, 2, 4]), 'Mo, Mi, Fr');
});

test('Müll nur am Rausstell-Tag', async () => {
  const { muellHeute } = await import('./home.js');
  const m = { ref_monday: '2026-11-09', pickup_weekday: 2, out_weekday: 1, week_a: ['papier'], week_b: ['bio'] };
  assert.equal(muellHeute(m, '2026-11-10').text, 'Heute Abend raus');
  assert.equal(muellHeute(m, '2026-11-11'), null);
  assert.equal(muellHeute(m, '2026-11-16'), null);
  assert.equal(muellHeute(null, '2026-11-10'), null);
});

test('Aufgaben-Modell: Quellen, Zuständige, Fahrten', async () => {
  const { aufgaben, offen, vonPerson, fuerPerson, fahrer } = await import('./aufgaben.js');
  const members = [{ id: 'dirk', name: 'Dirk' }, { id: 'catrin', name: 'Catrin' }, { id: 'jonte', name: 'Jonte', kid: true }, { id: 'emil', name: 'Emil', kid: true }];
  const T = (rows) => ({ rows });
  const ctx = {
    day: '2026-11-17', members, kids: members.filter((m) => m.kid), fail: () => {},
    data: {
      inbox: T([{ id: 1, title: 'Zahnarzt anrufen', typ: 'termin', owner: null, due: '2026-11-20' }, { id: 2, title: 'Formular', typ: 'ausfuellen', owner: 'catrin', for_who: 'emil', done_at: '2026-11-16T10:00:00Z' }]),
      buy: T([{ id: 3, typ: 'sonstiges', art: 'Geschenk: Party Paul', due: '2026-11-18', event_id: 'e1', done: false }]),
      chores: T([{ id: 4, title: 'Tisch decken', who: 'jonte', weekdays: [1], sort: 1 }]),
      choreChecks: T([{ chore_id: 4, on_date: '2026-11-17' }]),
      settings: T([{ key: 'muell', value: { ref_monday: '2026-11-16', out_weekday: 1, pickup_weekday: 2, week_a: ['bio'], week_b: [], out_by: 'dirk' } }]),
      events: T([{ id: 'e1', title: 'Party Paul', kind: 'termin', who: ['emil'], start_date: '2026-11-18', all_day: false, from_time: '15:00', to_time: '17:00', rep: 'keine', exdates: [], bring_by: 'nicht nötig', pick_by: null }]),
    },
  };
  const a = aufgaben(ctx);
  assert.deepEqual(vonPerson(offen(a), 'dirk').map((x) => x.art).sort(), ['erledigen', 'muell']); // Terminvereinbarung → Dirk
  assert.equal(fuerPerson(a, 'emil').filter((x) => x.art === 'besorgen').length, 1);                 // Geschenk zum Kindertermin
  assert.equal(a.find((x) => x.art === 'aemtchen').done, true);
  const f = a.filter((x) => x.art === 'fahrt');
  assert.equal(f.length, 1); assert.equal(f[0].feld, 'pick_by'); assert.equal(f[0].offen, true);   // Bringen „nicht nötig“ fällt weg
  assert.deepEqual(fahrer(ctx, 'Catrin'), { id: 'catrin', name: 'Catrin' });
});

test('Anzieh-Empfehlung', async () => {
  const { anziehen } = await import('./wochenende.js');
  assert.equal(anziehen({ code: 61, tmax: 9, tmin: 4, regen: 80 }).text, 'Warme Regenjacke, Mütze und Gummistiefel');
  assert.equal(anziehen({ code: 0, tmax: 27, tmin: 17, regen: 0 }).text, 'T-Shirt, Sonnencreme und Kappe');
  assert.equal(anziehen({ code: 3, tmax: 2, tmin: -3, regen: 10 }).text, 'Winterjacke, Mütze, Handschuhe und Schal');
  assert.equal(anziehen(null), null);
});
