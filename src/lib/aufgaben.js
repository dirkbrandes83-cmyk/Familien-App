// Ein gemeinsames Modell für alles, was zu tun ist.
// Die Daten bleiben in ihren Tabellen (Erledigen, Besorgen, Ämtchen, Müll, Fahrten);
// diese Schicht macht daraus einheitliche Aufgaben, die alle Ansichten gleich lesen:
//   { key, art, text, due, owner, forWho, done, eventId, erledigen(), zurueck() }
//   art:    'erledigen' | 'besorgen' | 'aemtchen' | 'muell' | 'fahrt'
//   owner:  wer es tun muss (Mitglieds-ID) oder null
//   forWho: wen es betrifft (Mitglieds-ID) oder null
import { addDays, expand, hm, weekday } from './dates.js';
import { muellHeute, BINS } from './home.js';

export const NICHT = 'nicht nötig';
const byDue = (a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999'));
const now = () => new Date().toISOString();
// Datenbank erst beim Abhaken laden – so bleibt das Modell ohne Browser testbar
async function db(ctx, fn) { const { supabase, run } = await import('../data.js'); return run(fn(supabase), ctx.fail); }

// Wer ist für einen Erledigen-Punkt zuständig? Terminvereinbarungen ohne Zuständigen landen bei Dirk.
const ownerOf = (r) => r.owner ?? ((r.typ ?? 'termin') === 'termin' ? 'dirk' : null);
export const besorgenText = (b) => (b.typ === 'kleidung' ? `${b.art}${b.size ? ` (${b.size})` : ''} besorgen` : b.art);

/* ---------- Fahrten: bringt/holt sauber gelesen ---------- */
// Wert in bring_by/pick_by → { id, name, nicht, offen }
export function fahrer(ctx, value) {
  if (value === NICHT) return { nicht: true };
  if (!value) return { offen: true };
  const m = ctx.members.find((x) => x.id === value || x.name === value);
  return { id: m?.id ?? null, name: m?.name ?? value };
}
// Speicherwert für eine Person (Familie: Name wie bisher, damit Widget und Kalender-Abo passen)
export const fahrerWert = (ctx, idOderName) => (idOderName === NICHT ? NICHT : ctx.members.find((m) => m.id === idOderName)?.name ?? idOderName);

const istKindertermin = (ctx, ev) => ev.kind === 'termin' && !ev.all_day && ev.who.some((w) => ctx.members.find((m) => m.id === w)?.kid);

/* ---------- alle Aufgaben ---------- */
export function aufgaben(ctx, { day = ctx.day, kommend = 3 } = {}) {
  const out = [];
  const events = new Map(ctx.data.events.rows.map((e) => [e.id, e]));

  for (const r of ctx.data.inbox.rows) {
    out.push({
      key: `t${r.id}`, art: 'erledigen', text: r.title, due: r.due, owner: ownerOf(r), forWho: r.for_who ?? null, done: !!r.done_at, typ: r.typ ?? 'termin',
      erledigen: () => db(ctx, (sb) => sb.from('todo_inbox').update({ done_at: now() }).eq('id', r.id)),
      zurueck: () => db(ctx, (sb) => sb.from('todo_inbox').update({ done_at: null }).eq('id', r.id)),
    });
  }
  for (const b of ctx.data.buy.rows) {
    const ev = b.event_id && events.get(b.event_id);
    // Geschenk zu einem Kindertermin betrifft das Kind, auch wenn es nicht eingetragen ist
    const kidOfEvent = ev && ev.kind !== 'geburtstag' ? ev.who.find((w) => ctx.members.find((m) => m.id === w)?.kid) : null;
    out.push({
      key: `b${b.id}`, art: 'besorgen', text: besorgenText(b), due: b.due,
      // Geschenk zu einem Kindertermin: gehört dem Kind und Dirk (kümmert sich ums Besorgen)
      owner: kidOfEvent || (b.event_id && (b.for_who && ctx.members.find((m) => m.id === b.for_who)?.kid)) ? 'dirk' : null,
      forWho: b.for_who ?? kidOfEvent ?? null,
      done: !!b.done, eventId: b.event_id ?? null, typ: b.typ,
      erledigen: () => db(ctx, (sb) => sb.from('buy_items').update({ done: true, done_at: now() }).eq('id', b.id)),
      zurueck: () => db(ctx, (sb) => sb.from('buy_items').update({ done: false, done_at: null }).eq('id', b.id)),
    });
  }
  // Ämtchen des Tages
  const wd = weekday(day);
  const checks = new Set(ctx.data.choreChecks.rows.filter((c) => c.on_date === day).map((c) => c.chore_id));
  for (const c of ctx.data.chores.rows.filter((x) => (x.weekdays || []).includes(wd)).sort((a, b) => a.sort - b.sort)) {
    const row = { chore_id: c.id, on_date: day };
    out.push({
      key: `c${c.id}`, art: 'aemtchen', text: c.title, due: day, owner: c.who, forWho: c.who, done: checks.has(c.id), chore: c,
      erledigen: () => db(ctx, (sb) => sb.from('chore_checks').upsert(row)),
      zurueck: () => db(ctx, (sb) => sb.from('chore_checks').delete().match(row)),
    });
  }
  // Müll am Rausstell-Tag
  const m = ctx.data.settings.rows.find((r) => r.key === 'muell')?.value;
  const st = muellHeute(m, day);
  if (st) out.push({ key: 'muell', art: 'muell', text: `Müll raus: ${st.bins.map((x) => BINS[x]?.label).join(' + ')}`, due: day, owner: m.out_by ?? null, forWho: null, done: false });

  // Fahrten der nächsten Tage (offen oder vergeben)
  for (const o of expand(ctx.data.events.rows, day, addDays(day, kommend))) {
    if (!istKindertermin(ctx, o.ev)) continue;
    for (const field of ['bring_by', 'pick_by']) {
      const f = fahrer(ctx, o.ev[field]);
      if (f.nicht) continue;
      out.push({
        key: `f${field[0]}${o.ev.id}${o.date}`, art: 'fahrt', feld: field, date: o.date, ev: o.ev,
        zeit: hm(field === 'pick_by' ? o.ev.to_time || o.ev.from_time : o.ev.from_time),
        text: `${ctx.kids.filter((k) => o.ev.who.includes(k.id)).map((k) => k.name).join(' und ')} ${field === 'bring_by' ? 'hinbringen' : 'abholen'}`,
        due: o.date, owner: f.id ?? null, offen: !!f.offen, forWho: null, done: false, eventId: o.ev.id,
      });
    }
  }
  return out.sort(byDue);
}

/* ---------- häufige Auswahlen ---------- */
export const offen = (list) => list.filter((a) => !a.done);
export const vonPerson = (list, id) => list.filter((a) => a.owner === id);
export const fuerPerson = (list, id) => list.filter((a) => a.forWho === id);
export const bis = (list, date) => list.filter((a) => a.due && a.due <= date);

export async function fahrtSetzen(ctx, ev, feld, wert) {
  const v = fahrerWert(ctx, wert);
  ctx.data.events.local((rows) => rows.map((e) => (e.id === ev.id ? { ...e, [feld]: v } : e)));
  const ok = await db(ctx, (sb) => sb.from('events').update({ [feld]: v }).eq('id', ev.id));
  if (!ok) ctx.data.events.reload();
  return ok;
}
