// Haushalt: Müll-Rhythmus und Wäsche.
import { addDays, diffDays, mondayOf, weekday, WD, WDL } from './dates.js';

export const BINS = {
  papier: { label: 'Papier', color: '#2563EB' },
  gelb: { label: 'Gelber Sack', color: '#EAB308' },
  bio: { label: 'Bio', color: '#92400E' },
  rest: { label: 'Restmüll', color: '#44403C' },
};

export const WASH = ['bunt', '60 Grad', 'weiß', 'fein', 'Wolle', 'Jeans'];

// Welche Tonnen werden in der Woche von "date" abgeholt?
export function binsForWeek(m, date) {
  const weeks = Math.floor(diffDays(m.ref_monday, mondayOf(date)) / 7);
  const a = ((weeks % 2) + 2) % 2 === 0;
  return (a ? m.week_a : m.week_b) || [];
}

// Was ist heute beim Müll zu tun? → { text, bins, today: bool, when }
export function muellStatus(m, date) {
  const wd = weekday(date);
  const pick = m.pickup_weekday ?? 2;
  const out = m.out_weekday ?? 1;
  if (wd === out) return { today: true, text: 'Heute Abend raus', bins: binsForWeek(m, date) };
  if (wd === pick) return { today: true, text: 'Heute ist Abholung', bins: binsForWeek(m, date) };
  // nächste Abholung
  const next = wd < pick ? addDays(date, pick - wd) : addDays(date, 7 - wd + pick);
  const outDay = addDays(next, out - pick);
  const n = diffDays(date, outDay);
  const when = n === 1 ? 'Morgen Abend raus' : `${WDL[weekday(outDay)]} abends raus`;
  return { today: false, text: when, bins: binsForWeek(m, next), next };
}

// Nur am Rausstell-Tag (z. B. Dienstag) anzeigen – sonst null
export function muellHeute(m, date) {
  if (!m) return null;
  const st = muellStatus(m, date);
  return weekday(date) === (m.out_weekday ?? 1) ? st : null;
}

export function nextCleaning(m, date) {
  return (m.cleaning_dates || []).filter((d) => d >= date).sort()[0] || null;
}

// "vor 3 Tagen" usw.
export function agoLabel(from, to) {
  if (!from) return 'noch nie';
  const n = diffDays(from, to);
  if (n <= 0) return 'heute';
  if (n === 1) return 'gestern';
  if (n < 14) return `vor ${n} Tagen`;
  return `vor ${Math.round(n / 7)} Wochen`;
}

export function weekdaysLabel(days) {
  const d = [...days].sort((a, b) => a - b);
  if (d.length === 7) return 'täglich';
  if (d.length === 0) return 'kein Tag';
  if (d.join() === '0,1,2,3,4') return 'Mo–Fr';
  if (d.join() === '5,6') return 'am Wochenende';
  return d.map((i) => WD[i]).join(', ');
}
