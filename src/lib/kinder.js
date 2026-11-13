// Kleine Freuden für die Kinderseiten: Tier, Begrüßung, Countdowns
import { addDays, diffDays, expand } from './dates.js';

export const TIERE = ['🦊', '🐉', '🦁', '🐼', '🐯', '🦄', '🐸', '🐙', '🦖', '🐬', '🦉', '🐻', '🐱', '🐶', '🐰', '🦈'];

export function begruessung(name, tier, hour = new Date().getHours()) {
  const g = hour < 11 ? 'Guten Morgen' : hour < 17 ? 'Hallo' : hour < 20 ? 'Guten Abend' : 'Schlaf gut';
  return `${g}, ${name}${tier ? ` ${tier}` : ''}`;
}

// Worauf man sich freuen kann – aus dem Kalender, ohne Extra-Pflege
const FREUDE = /ferien|feier|party|geburtstag|ausflug|urlaub|reise|fest|kino|zoo|schwimmbad|übernacht|🎈/i;
const ICON = (ev) => (ev.kind === 'geburtstag' || /geburtstag/i.test(ev.title) ? '🎂' : /ferien|urlaub|reise/i.test(ev.title) ? '🏖️' : /🎈/.test(ev.title) ? '' : '🎉');

export function countdowns(events, kidId, day, n = 2) {
  const out = [];
  const seen = new Set();
  const until = addDays(day, 60);
  for (const o of expand(events, addDays(day, 1), until)) {
    const ev = o.ev;
    const fuerMich = ev.who.includes('all') || ev.who.includes(kidId) || ev.kind === 'geburtstag';
    if (!fuerMich || ev.kind === 'test' || ev.kind === 'frist') continue;
    if (ev.kind !== 'geburtstag' && !FREUDE.test(ev.title)) continue;
    if (seen.has(ev.title)) continue;
    seen.add(ev.title);
    out.push({ date: o.date, title: ev.title.replace(/^🎈\s*/, ''), icon: ICON(ev) || '🎈' });
  }
  // Feste Freudentage
  const y = Number(day.slice(0, 4));
  for (const [md, t, ic] of [['12-24', 'Heiligabend', '🎄'], ['12-31', 'Silvester', '🎆']]) {
    for (const yy of [y, y + 1]) {
      const d = `${yy}-${md}`;
      if (d > day && d <= until && !seen.has(t)) { out.push({ date: d, title: t, icon: ic }); seen.add(t); }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, n)
    .map((c) => ({ ...c, n: diffDays(day, c.date) }));
}

export const schlafen = (n) => (n === 1 ? 'Morgen ist' : `Noch ${n}× schlafen bis`);
