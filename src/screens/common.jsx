import { Icon, PersonChips } from '../ui.jsx';
import { hm, weekday, addDays, expand } from '../lib/dates.js';

export const SRC = {
  fam: 'Familie',
  klender: 'aus Klender',
  inbox: 'aus „Termine vereinbaren“',
  abo: 'Abo',
  scan: 'aus Elternbrief',
  station: 'vom Familien-iPad',
};
export const KINDS = { termin: 'Termin', test: 'Test', frist: 'Frist', geburtstag: 'Geburtstag' };

export function timeLabel(ev, date) {
  if (ev.all_day) {
    if (ev.end_date && ev.end_date !== ev.start_date && date) return date === ev.start_date ? 'ab heute' : 'ganztags';
    return ev.kind === 'frist' ? 'Frist' : 'ganztags';
  }
  return hm(ev.from_time);
}

export function EventRow({ ev, date, ctx, showDate }) {
  const sub = [
    !ev.all_day && ev.to_time ? `bis ${hm(ev.to_time)}` : null,
    ev.kind !== 'termin' && ev.kind !== 'test' ? KINDS[ev.kind] : null,
    ev.rep !== 'keine' ? ev.rep : null,
    ev.src === 'station' && ctx.member(ev.created_by) ? `eingetragen von ${ctx.member(ev.created_by).name}`
      : ev.src === 'abo' ? (ctx.data.subs?.rows.find((x) => x.id === ev.sub_id)?.name ?? 'Abo') : SRC[ev.src] && ev.src !== 'fam' ? SRC[ev.src] : null,
  ].filter(Boolean).join(' · ');
  return (
    <button className="row" onClick={() => ctx.openEvent(ev, { date })}>
      <span className="time" style={ev.all_day ? { fontSize: 12, color: '#57534E' } : undefined}>{showDate || timeLabel(ev, date)}</span>
      <span className="row-main">
        <span className="row-title">{ev.kind === 'test' ? <span className="test-tag">Test</span> : null}{ev.title}</span>
        <PersonChips who={ev.who} members={ctx.members} />
        <BringPick ev={ev} />
        {sub && <span className="small">{sub}</span>}
      </span>
      <Icon name="chev" size={18} className="chev" />
    </button>
  );
}

// Was muss ein Kind an einem Tag mitnehmen? Feste Regeln + einzelne Einträge.
export function packList(ctx, kid, date) {
  const wd = weekday(date);
  const checks = new Set(ctx.data.checks.rows.filter((c) => c.kid === kid && c.on_date === date).map((c) => c.item_key));
  const items = [
    ...ctx.data.rules.rows.filter((r) => r.kid === kid && (r.weekdays || []).includes(wd)).map((r) => ({ key: `r:${r.id}`, text: r.item, rule: r })),
    ...ctx.data.packItems.rows.filter((p) => p.kid === kid && p.on_date === date && p.art === 'mit').map((p) => ({ key: `i:${p.id}`, text: p.text, one: p })),
  ].map((x) => ({ ...x, done: checks.has(x.key) }));
  const notes = ctx.data.packItems.rows.filter((p) => p.kid === kid && p.on_date === date && p.art !== 'mit');
  // Tests: am Tag selbst und am Tag davor als Hinweis
  for (const o of expand(ctx.data.events.rows.filter((e) => e.kind === 'test' && e.who.includes(kid)), date, addDays(date, 1))) {
    notes.push({ id: `test-${o.ev.id}-${o.date}`, art: 'test',
      text: o.date === date ? `${o.ev.title} – du schaffst das!` : `Morgen ${o.ev.title} – heute nochmal üben` });
  }
  return { items, notes };
}

export function packDay(ctx) {
  // Bis zum Mittag zählt heute, danach wird für morgen gepackt
  return new Date().getHours() < 12 ? ctx.day : addDays(ctx.day, 1);
}

// „bringt Dirk · holt Catrin“ – offen wird orange angezeigt, wenn nur eins fehlt
// „nicht nötig“: Kind geht allein hin bzw. kommt allein nach Hause
export { NICHT } from '../lib/aufgaben.js';
import { NICHT } from '../lib/aufgaben.js';
export function fahrtText(ev) {
  return [ev.bring_by && ev.bring_by !== NICHT && `bringt ${ev.bring_by}`, ev.pick_by && ev.pick_by !== NICHT && `holt ${ev.pick_by}`].filter(Boolean).join(' · ');
}
export function BringPick({ ev, big }) {
  if (!ev.bring_by && !ev.pick_by) return null;
  const st = { fontSize: big ? 15 : 12, fontWeight: 600 };
  const part = (v, verb, offen) => (v === NICHT ? null : v ? `${verb} ${v}` : <span style={{ color: '#B45309' }}>{offen}</span>);
  const a = part(ev.bring_by, 'bringt', 'bringen offen');
  const b = part(ev.pick_by, 'holt', 'abholen offen');
  if (!a && !b) return null;
  return <span style={{ ...st, color: '#44403C', display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}><Icon name="car" size={big ? 18 : 14} />{a}{a && b ? ' · ' : ''}{b}</span>;
}
