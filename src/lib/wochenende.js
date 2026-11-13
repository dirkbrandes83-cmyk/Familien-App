// Wochenende: Wetter, freie Zeit, passende Ideen
import { addDays, weekday, expand } from './dates.js';

// WMO-Wettercodes → Symbol und Text
export function wetterInfo(code) {
  if (code === 0) return { icon: 'sun', label: 'sonnig' };
  if (code <= 2) return { icon: 'partsun', label: 'heiter' };
  if (code === 3) return { icon: 'cloud', label: 'bewölkt' };
  if (code <= 48) return { icon: 'fog', label: 'neblig' };
  if (code <= 57) return { icon: 'rain', label: 'Niesel' };
  if (code <= 67) return { icon: 'rain', label: 'Regen' };
  if (code <= 77) return { icon: 'snow', label: 'Schnee' };
  if (code <= 82) return { icon: 'rain', label: 'Schauer' };
  return { icon: 'storm', label: 'Gewitter' };
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

export const WO = { drinnen: [['house'], 'drinnen'], draussen: [['tree'], 'draußen'], beides: [['house', 'tree'], 'drinnen & draußen'] };
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

// Anzieh-Empfehlung für den Schulweg (morgens zählt die Tiefsttemperatur)
export function anziehen(w) {
  if (!w) return null;
  const t = w.tmin ?? w.tmax - 5;
  const regen = nass(w);
  const schnee = w.code >= 71 && w.code <= 77;
  const teile = [];
  if (t <= 0) teile.push('Winterjacke', 'Mütze', 'Handschuhe', 'Schal');
  else if (t <= 6) teile.push(regen ? 'warme Regenjacke' : 'warme Jacke', 'Mütze');
  else if (t <= 11) teile.push(regen ? 'Regenjacke' : 'Jacke');
  else if (t <= 16) teile.push(regen ? 'Regenjacke' : 'leichte Jacke oder Pulli');
  else if (w.tmax <= 21) teile.push(regen ? 'Regenjacke' : 'Pulli');
  else teile.push('T-Shirt', ...(regen ? ['Regenjacke'] : []));
  if (schnee) teile.push('Winterstiefel');
  if ((w.wind ?? 0) >= 40 && t > 6) teile.push('Mütze');
  if (w.tmax >= 25 && !regen) teile.push('Sonnencreme', 'Kappe');
  const liste = [...new Set(teile)];
  const text = liste.length > 1 ? `${liste.slice(0, -1).join(', ')} und ${liste[liste.length - 1]}` : liste[0];
  return { icon: wetterInfo(w.code).icon, label: wetterInfo(w.code).label, temp: w.tmin !== undefined ? `${w.tmin}–${w.tmax}°` : `${w.tmax}°`, text: text[0].toUpperCase() + text.slice(1) };
}
