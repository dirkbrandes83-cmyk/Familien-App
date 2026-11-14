// Wochenend-Struktur: jeder freie Tag in vier Abschnitte geteilt.
// Hier nur reine Logik (testbar); die Anzeige steckt in screens/Wochenplan.jsx.
import { expand, hm, weekday, titelAm } from './dates.js';

export const ABSCHNITTE = [
  { id: 'morgens', label: 'Morgens', zeit: 'bis 10 Uhr', bis: 10 },
  { id: 'vormittag', label: 'Vormittag', zeit: '10–13 Uhr', bis: 13, start: '10:00' },
  { id: 'nachmittag', label: 'Nachmittag', zeit: '13–18 Uhr', bis: 18, start: '14:00' },
  { id: 'abend', label: 'Abend', zeit: 'ab 18 Uhr', bis: 24 },
];

// Bausteine, die Eltern in einen Abschnitt legen können. „Auszeit für“ braucht eine Person.
export const BAUSTEINE = [
  { text: 'Marktbesuch', icon: 'bag', slot: 'vormittag' },
  { text: 'Auszeit für', icon: 'heart', person: true },
  { text: 'Mittagessen', icon: 'clock', slot: 'nachmittag' },
  { text: 'Medienzeit', icon: 'phone', slot: 'nachmittag' },
  { text: 'Familienzeit', icon: 'house' },
  { text: 'Besuch', icon: 'party' },
  { text: 'Sport', icon: 'tree' },
  { text: 'Aufräumen', icon: 'todo', slot: 'morgens' },
];
export const bausteinIcon = (text) => BAUSTEINE.find((b) => text.startsWith(b.text))?.icon ?? 'star';

export function slotOf(time) {
  const h = Number(String(time).slice(0, 2));
  return ABSCHNITTE.find((a) => h < a.bis).id;
}

export const aktuellerAbschnitt = (stunde) => ABSCHNITTE.find((a) => stunde < a.bis).id;

// Was steht an einem Tag in welchem Abschnitt?
// rahmen: feste Bausteine jedes Wochenende [{ tag: 5|6, slot, text, who }]
// todos: Map Aufgaben-Schlüssel → { text, done } (für ins Wochenende geschobene To-dos)
export function tagesplan({ date, events, plan, rahmen = [], chores = [], meal, members = [], todos = new Map() }) {
  const name = (id) => members.find((m) => m.id === id)?.name;
  const slots = Object.fromEntries(ABSCHNITTE.map((a) => [a.id, []]));
  const geburtstage = [];
  const ganztags = [];
  for (const o of expand(events, date, date)) {
    if (o.ev.kind === 'geburtstag') geburtstage.push(titelAm(o.ev, date));
    else if (o.ev.all_day || !o.ev.from_time) ganztags.push({ art: 'termin', text: o.ev.title.replace(/^🎈\s*/, ''), ev: o.ev, dabei: o.ev.who });
    else slots[slotOf(o.ev.from_time)].push({ art: 'termin', text: o.ev.title.replace(/^🎈\s*/, ''), time: hm(o.ev.from_time), ev: o.ev, idee: o.ev.title.startsWith('🎈'), dabei: o.ev.who });
  }
  const wd = weekday(date);
  for (const r of rahmen.filter((x) => x.tag === wd)) {
    slots[r.slot].push({ art: 'baustein', text: r.who ? `${r.text} ${name(r.who) ?? ''}`.trim() : r.text, fest: true, rahmen: r, dabei: r.dabei ?? (r.who ? [r.who] : ['all']) });
  }
  for (const p of plan.filter((x) => x.on_date === date)) {
    if (p.todo_ref) {
      const t = todos.get(p.todo_ref);
      if (t) slots[p.slot].push({ art: 'todo', text: t.text, done: t.done, aufgabe: t, row: p, dabei: p.dabei?.length ? p.dabei : t.owner ? [t.owner] : ['all'] });
      continue;
    }
    slots[p.slot].push({ art: 'baustein', text: p.who ? `${p.text} ${name(p.who) ?? ''}`.trim() : p.text, row: p, dabei: p.dabei ?? ['all'] });
  }
  for (const c of chores.filter((x) => (x.weekdays || []).includes(wd))) {
    slots.morgens.push({ art: 'aemtchen', text: c.title, who: c.who, dabei: [c.who] });
  }
  if (meal) slots.abend.push({ art: 'essen', text: meal });
  for (const a of ABSCHNITTE) slots[a.id].sort((x, y) => String(x.time ?? '').localeCompare(String(y.time ?? '')));
  // Vormittag/Nachmittag ohne Termin oder Baustein: frei für eine Idee
  const frei = ['vormittag', 'nachmittag'].filter((s) => !slots[s].some((i) => i.art === 'termin' || i.art === 'baustein'));
  return { geburtstage, ganztags, slots, frei };
}
