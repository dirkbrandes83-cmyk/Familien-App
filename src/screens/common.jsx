import { Icon, PersonChips } from '../ui.jsx';
import { hm, weekday, addDays } from '../lib/dates.js';

export const SRC = {
  fam: 'Familie',
  klender: 'aus Klender',
  inbox: 'aus „Termine vereinbaren“',
  abo: 'Abo',
  scan: 'aus Elternbrief',
};
export const KINDS = { termin: 'Termin', frist: 'Frist', geburtstag: 'Geburtstag' };

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
    ev.kind !== 'termin' ? KINDS[ev.kind] : null,
    ev.rep !== 'keine' ? ev.rep : null,
    ev.src === 'abo' ? (ctx.data.subs?.rows.find((x) => x.id === ev.sub_id)?.name ?? 'Abo') : SRC[ev.src] && ev.src !== 'fam' ? SRC[ev.src] : null,
  ].filter(Boolean).join(' · ');
  return (
    <button className="row" onClick={() => ctx.openEvent(ev, { date })}>
      <span className="time" style={ev.all_day ? { fontSize: 12, color: '#57534E' } : undefined}>{showDate || timeLabel(ev, date)}</span>
      <span className="row-main">
        <span className="row-title">{ev.title}</span>
        <PersonChips who={ev.who} members={ctx.members} />
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
  return { items, notes };
}

export function packDay(ctx) {
  // Bis zum Mittag zählt heute, danach wird für morgen gepackt
  return new Date().getHours() < 12 ? ctx.day : addDays(ctx.day, 1);
}
