// Wochenende: Wetter, freie Zeit, passende Ideen
import { addDays, weekday, expand } from './dates.js';

// WMO-Wettercodes → Symbol und Text
export function wetterInfo(code) {
  if (code === 0) return { icon: '☀️', label: 'sonnig' };
  if (code <= 2) return { icon: '🌤️', label: 'heiter' };
  if (code === 3) return { icon: '☁️', label: 'bewölkt' };
  if (code <= 48) return { icon: '🌫️', label: 'neblig' };
  if (code <= 57) return { icon: '🌦️', label: 'Niesel' };
  if (code <= 67) return { icon: '🌧️', label: 'Regen' };
  if (code <= 77) return { icon: '🌨️', label: 'Schnee' };
  if (code <= 82) return { icon: '🌦️', label: 'Schauer' };
  return { icon: '⛈️', label: 'Gewitter' };
}
export const nass = (w) => !!w && (w.regen >= 50 || (w.code >= 61 && w.code <= 67) || w.code >= 80);

// Das kommende (oder laufende) Wochenende: [Samstag, Sonntag], am Sonntag nur [Sonntag]
export function weekendDays(day) {
  const wd = weekday(day);
  if (wd === 6) return [day];
  if (wd === 5) return [day, addDays(day, 1)];
  const sat = addDays(day, 5 - wd);
  return [sat, addDays(sat, 1)];
}
export const isWeekendSoon = (day) => weekday(day) >= 4; // ab Freitag

// Wie voll ist der Tag? Zahl der festen Termine (ganztägige Abholtermine zählen nicht)
export function busyOf(events, date) {
  return expand(events, date, date).filter((o) => o.ev.kind !== 'geburtstag');
}

export const WO = { drinnen: ['🏠', 'drinnen'], draussen: ['🌳', 'draußen'], beides: ['🏠🌳', 'drinnen & draußen'] };
export const DAUER = { kurz: '1–2 Std.', halb: 'halber Tag', ganz: 'ganzer Tag' };
export const KOSTEN = ['kostenlos', '€', '€€'];

// Ideen nach Herzen sortiert; bei Regen nur Drinnen-Ideen, wenn wetterFilter
export function rankIdeas(ideas, votes, { regen = false } = {}) {
  const n = new Map();
  for (const v of votes) n.set(v.idea_id, (n.get(v.idea_id) || 0) + 1);
  return ideas
    .filter((i) => !i.archived && (!regen || i.wo !== 'draussen'))
    .map((i) => ({ ...i, herzen: n.get(i.id) || 0 }))
    .sort((a, b) => b.herzen - a.herzen || a.title.localeCompare(b.title, 'de'));
}
