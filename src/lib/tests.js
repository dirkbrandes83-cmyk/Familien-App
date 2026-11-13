// Tests und Klassenarbeiten der Kinder
import { addDays, diffDays, expand, weekday, WD, parse } from './dates.js';

export const FAECHER = ['Deutsch', 'Mathe', 'Englisch', 'Sachunterricht', 'NaWi', 'GuP', 'Französisch', 'Spanisch', 'Musik', 'Kunst', 'Religion', 'Sport'];
export const TEST_ARTEN = ['Test', 'Klassenarbeit', 'Vokabeltest', 'Lernkontrolle'];

export const testTitle = (art, fach) => `${art} ${fach}`.trim();

// Kommende Tests eines Kindes (oder aller Kinder, wenn kidId fehlt), sortiert nach Datum
export function upcomingTests(events, day, days = 21, kidId = null) {
  return expand(events.filter((e) => e.kind === 'test'), day, addDays(day, days))
    .filter((o) => !kidId || o.ev.who.includes(kidId));
}

// „heute!“, „morgen“, „übermorgen“, „in 5 Tagen“
export function countdown(day, date) {
  const n = diffDays(day, date);
  if (n <= 0) return 'heute!';
  if (n === 1) return 'morgen';
  if (n === 2) return 'übermorgen';
  return `in ${n} Tagen`;
}
// Farbe nach Dringlichkeit
export function urgency(day, date) {
  const n = diffDays(day, date);
  return n <= 1 ? 'hot' : n <= 4 ? 'warm' : 'calm';
}

export function dayChip(day, date) {
  const n = diffDays(day, date);
  const d = parse(date);
  const label = `${d.getDate()}.${d.getMonth() + 1}.`;
  if (n === 0) return { top: 'Heute', sub: label };
  if (n === 1) return { top: 'Morgen', sub: `${WD[weekday(date)]} ${label}` };
  return { top: WD[weekday(date)], sub: label };
}

// Die nächsten Tage für die Auswahl; nur Schultage (Mo–Fr), wenn schoolOnly
export function pickDays(day, n = 14, schoolOnly = false) {
  const out = [];
  for (let i = 0; out.length < n && i < 40; i++) {
    const d = addDays(day, i);
    if (schoolOnly && weekday(d) > 4) continue;
    out.push(d);
  }
  return out;
}

