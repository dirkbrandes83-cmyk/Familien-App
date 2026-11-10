import { Icon } from '../ui.jsx';
import { addDays, expand, shortLabel } from '../lib/dates.js';
import { EventRow, packList, packDay } from './common.jsx';

export default function Heute({ ctx }) {
  const { day, data } = ctx;
  const tomorrow = addDays(day, 1);
  const occ = expand(data.events.rows, day, tomorrow);
  const todayEv = occ.filter((o) => o.date === day);
  const tomEv = occ.filter((o) => o.date === tomorrow);

  const pd = packDay(ctx);
  const perKid = ctx.kids.map((k) => ({ k, open: packList(ctx, k.id, pd).items.filter((i) => !i.done) }));
  const packOpen = perKid.reduce((n, x) => n + x.open.length, 0);
  const inbox = data.inbox.rows.filter((r) => !r.done_at);
  const buy = data.buy.rows.filter((r) => !r.done);
  const shop = data.shop.rows.filter((r) => !r.done);

  const rem = [
    {
      label: pd === day ? 'Heute mitnehmen' : 'Morgen mitnehmen',
      sub: packOpen ? perKid.filter((x) => x.open.length).map((x) => `${x.k.name}: ${x.open.map((i) => i.text).join(', ')}`).join(' · ') : 'Alles eingepackt oder nichts nötig.',
      n: packOpen, seg: 'mitnehmen',
    },
    {
      label: 'Termine vereinbaren',
      sub: inbox.length ? inbox.slice(0, 3).map((i) => i.title).join(', ') + (inbox.length > 3 ? ' …' : '') : 'Nichts offen.',
      n: inbox.length, seg: 'vereinbaren',
    },
    {
      label: 'Besorgen',
      sub: buy.length ? buy.slice(0, 3).map((b) => `${b.art}${b.size ? ` ${b.size}` : ''} (${ctx.member(b.for_who)?.name ?? ''})`).join(', ') : 'Keine Kleidung offen.',
      n: buy.length, seg: 'besorgen',
    },
  ];

  return (
    <>
      <section className="card" aria-labelledby="h-termine">
        <div className="card-head">
          <div className="card-title" id="h-termine">Termine</div>
          <button className="icon-btn" aria-label="Neuer Termin" onClick={() => ctx.openEvent(null, { start_date: day })}><Icon name="plus" size={18} /></button>
        </div>
        <div className="label">Heute</div>
        {todayEv.length === 0 ? <div className="empty">Nichts geplant.</div>
          : <div>{todayEv.map((o) => <EventRow key={o.ev.id + o.date} ev={o.ev} date={o.date} ctx={ctx} />)}</div>}
        <div className="label divider" style={{ paddingTop: 8 }}>Morgen · {shortLabel(tomorrow)}</div>
        {tomEv.length === 0 ? <div className="empty">Nichts geplant.</div>
          : <div>{tomEv.map((o) => <EventRow key={o.ev.id + o.date} ev={o.ev} date={o.date} ctx={ctx} />)}</div>}
      </section>

      <section className="card tight" aria-label="Erinnerungen">
        <div className="card-title" style={{ padding: '10px 0 4px' }}>Erinnerungen</div>
        {rem.map((r) => (
          <button key={r.seg} className="row" style={{ minHeight: 60 }} onClick={() => ctx.go('erinn', r.seg)}>
            <span className="row-main">
              <span style={{ fontWeight: 700 }}>{r.label}</span>
              <span className="sub">{r.sub}</span>
            </span>
            {r.n > 0 && <span className="badge">{r.n}</span>}
            <Icon name="chev" size={18} className="chev" />
          </button>
        ))}
      </section>

      <button className="card" style={{ flexDirection: 'row', alignItems: 'center', textAlign: 'left' }} onClick={() => ctx.go('einkauf')}>
        <span className="row-main">
          <span className="card-title">Einkauf</span>
          <span className="sub">{shop.length ? shop.slice(0, 5).map((s) => s.name).join(', ') + (shop.length > 5 ? ' …' : '') : 'Die Liste ist leer.'}</span>
        </span>
        {shop.length > 0 && <span className="badge">{shop.length}</span>}
        <Icon name="chev" size={18} className="chev" />
      </button>
    </>
  );
}
