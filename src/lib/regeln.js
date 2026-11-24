// Gemeinsame Regeln der Familien-App – an einer Stelle, damit Kalender, Heute, Station und Check-in
// dasselbe meinen. Alles rein (ohne Supabase/React), damit es getestet werden kann.
import { weekday, addDays } from './dates.js';

export const NICHT = 'nicht nötig'; // Wert in bring_by/pick_by: „Bringen/Abholen nicht nötig“

const istKind = (members, id) => !!members.find((m) => m.id === id)?.kid;

// Kindertermin = Termin mit Uhrzeit, an dem ein Kind beteiligt ist (nur dann gibt es Bringen/Abholen)
export function istKindertermin(ev, members) {
  return !!ev && ev.kind === 'termin' && !ev.all_day && (ev.who || []).some((w) => istKind(members, w));
}

// Welche Fahrten übernimmt jemand bei diesem Termin? → ['bringt', 'holt'] (leer = keine)
export function fahrtenVon(ev, id) {
  if (!ev || !id) return [];
  return [ev.bring_by === id && 'bringt', ev.pick_by === id && 'holt'].filter(Boolean);
}

// Betrifft ein Termin diese Person? Beteiligt, „Alle“ – oder sie fährt.
export function terminBetrifft(ev, id) {
  if (id === 'all') return true;
  const who = ev.who || [];
  return who.includes('all') || who.includes(id) || fahrtenVon(ev, id).length > 0;
}

// Betrifft ein To-do (todo_inbox) diese Person? Termin-Vereinbaren ohne Zuständigen landet bei Dirk.
export function todoBetrifft(row, id) {
  if (id === 'all') return true;
  return row.owner === id || row.for_who === id || (!row.owner && (row.typ ?? 'termin') === 'termin' && id === 'dirk');
}

// Betrifft ein Besorgen-Eintrag (buy_items) diese Person?
export function besorgenBetrifft(row, id) {
  if (id === 'all') return true;
  return row.for_who === id || row.owner === id;
}

// Ämtchen einer Person an einem Tag (weekdays: 0 = Mo … 6 = So)
export function aemtchenAm(chores, id, date) {
  const wd = weekday(date);
  return chores.filter((c) => (id === 'all' || c.who === id) && (c.weekdays || []).includes(wd));
}

// Wer ist bei einem Eintrag „dabei“? Zuständige und Betroffene, sonst alle.
export function dabeiVon(owner, forWho) {
  const d = [...new Set([owner, forWho].filter(Boolean))];
  return d.length ? d : ['all'];
}

// Ämtchen-Fortschritt einer Person in der laufenden Woche (Montag bis einschließlich „bis“)
// → { soll, geschafft } – zählt jedes Ämtchen an jedem fälligen Tag einmal
export function aemtchenWoche(chores, checks, id, bis) {
  const wd = weekday(bis);
  const tage = Array.from({ length: wd + 1 }, (_, i) => addDays(bis, i - wd));
  const erledigt = new Set(checks.map((c) => `${c.chore_id}|${c.on_date}`));
  let soll = 0, geschafft = 0;
  for (const d of tage) {
    for (const c of aemtchenAm(chores, id, d)) { soll += 1; if (erledigt.has(`${c.id}|${d}`)) geschafft += 1; }
  }
  return { soll, geschafft };
}
