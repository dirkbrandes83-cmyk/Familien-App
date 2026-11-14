// Datums-Helfer. Alle Daten sind lokale Kalendertage als "YYYY-MM-DD".
// Wochentage wie im Prototyp: 0 = Montag … 6 = Sonntag.

export const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const WDL = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

const pad = (n) => String(n).padStart(2, '0');

export function iso(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parse(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12); // Mittag: keine Sommerzeit-Sprünge
}
export function today() {
  return iso(new Date());
}
export function addDays(s, n) {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}
export function weekday(s) {
  return (parse(s).getDay() + 6) % 7;
}
export function diffDays(a, b) {
  return Math.round((parse(b) - parse(a)) / 86400000);
}
export function mondayOf(s) {
  return addDays(s, -weekday(s));
}
export function longLabel(s) {
  const d = parse(s);
  return `${WDL[weekday(s)]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}
export function shortLabel(s) {
  const d = parse(s);
  return `${WD[weekday(s)]} ${d.getDate()}.${d.getMonth() + 1}.`;
}
export function hm(t) {
  return t ? t.slice(0, 5) : '';
}

function addMonths(s, n) {
  const d = parse(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  if (day > last) return null; // 31. gibt es in diesem Monat nicht
  d.setDate(day);
  return iso(d);
}

// Alle Tage im Bereich [from, to], an denen der Termin stattfindet.
export function occurrences(ev, from, to) {
  const out = [];
  const start = ev.start_date;
  const until = ev.rep_until && ev.rep_until < to ? ev.rep_until : to;
  const ex = new Set(ev.exdates || []);
  const push = (d) => { if (d >= from && d <= until && !ex.has(d)) out.push(d); };
  const span = ev.end_date ? Math.max(0, diffDays(start, ev.end_date)) : 0;
  const pushSpan = (d) => {
    // mehrtägige Termine erscheinen an jedem Tag
    for (let i = 0; i <= span; i++) {
      const x = addDays(d, i);
      if (x >= from && x <= to && !ex.has(d)) out.push(x);
    }
  };
  const step = { 'täglich': 1, 'wöchentlich': 7, 'alle 2 Wochen': 14 }[ev.rep];
  if (!ev.rep || ev.rep === 'keine') {
    if (span) pushSpan(start); else push(start);
  } else if (step) {
    let d = start;
    const gap = diffDays(start, from);
    if (gap > 0) d = addDays(start, Math.floor(gap / step) * step);
    for (; d <= until; d = addDays(d, step)) if (d >= start) push(d);
  } else if (ev.rep === 'monatlich' || ev.rep === 'jährlich') {
    const m = ev.rep === 'monatlich' ? 1 : 12;
    for (let i = 0; i < 2400; i++) {
      const d = addMonths(start, i * m);
      if (d === null) continue;
      if (d > until) break;
      push(d);
    }
  }
  return [...new Set(out)].sort();
}

// Termine eines Zeitraums als Liste von {date, ev}, sortiert nach Tag und Uhrzeit.
export function expand(events, from, to) {
  const out = [];
  for (const ev of events) for (const d of occurrences(ev, from, to)) out.push({ date: d, ev });
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || (a.ev.all_day === b.ev.all_day ? 0 : a.ev.all_day ? -1 : 1) || String(a.ev.from_time || '').localeCompare(String(b.ev.from_time || '')));
  return out;
}

// Anzeige-Titel an einem Tag: Geburtstage mit Alter („Rosa wird 41“), wenn das Geburtsjahr bekannt ist
export function titelAm(ev, date) {
  if (ev.kind !== 'geburtstag') return ev.title;
  const alter = Number(date.slice(0, 4)) - Number(ev.start_date.slice(0, 4));
  return alter > 0 && alter < 120 && !/geburtstag/i.test(ev.title) ? `${ev.title} wird ${alter}` : ev.title;
}
