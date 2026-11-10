import { Icon } from '../ui.jsx';
import { addDays, expand, shortLabel } from '../lib/dates.js';
import { EventRow, packList, packDay } from './common.jsx';
import { mealOf, muellOf, Bin, choresToday, toggleChore } from './Zuhause.jsx';
import { muellStatus, WASH, agoLabel } from '../lib/home.js';
import { Check } from '../ui.jsx';

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

      <ZuhauseHeute ctx={ctx} />
    </>
  );
}

function ZuhauseHeute({ ctx }) {
  const meal = mealOf(ctx, ctx.day);
  const m = muellOf(ctx);
  const st = m ? muellStatus(m, ctx.day) : null;
  const last = {};
  for (const r of ctx.data.laundry.rows) if (!last[r.cat] || r.washed_on > last[r.cat]) last[r.cat] = r.washed_on;
  const oldest = [...WASH].sort((a, b) => String(last[a] || '').localeCompare(String(last[b] || '')))[0];
  const mine = choresToday(ctx, ctx.day).filter((c) => c.who === ctx.me.id);
  const wishes = ctx.data.wishes.rows.filter((w) => !w.done_at).length;
  const line = { display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, background: 'none', border: 'none', borderTop: '1px solid #F0EBE3', padding: 0, textAlign: 'left', fontSize: 14, width: '100%' };
  const lab = { width: 64, fontWeight: 700, color: '#57534E', flex: '0 0 64px' };
  return (
    <section className="card" style={{ padding: '12px 14px', gap: 0, fontSize: 14 }}>
      <div className="label" style={{ paddingBottom: 4 }}>Zuhause heute</div>
      <button style={{ ...line, borderTop: 'none' }} onClick={() => ctx.go('zuhause', 'essen')}>
        <span style={lab}>Essen</span><span style={{ flex: '1 1 auto' }}>{meal.title}</span>
        {wishes > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: '#B45309' }}>{wishes} {wishes === 1 ? 'Wunsch' : 'Wünsche'}</span>}
      </button>
      {st && (
        <button style={line} onClick={() => ctx.go('zuhause', 'haushalt')}>
          <span style={lab}>Müll</span><span style={{ flex: '1 1 auto', fontWeight: st.today ? 700 : 400, color: st.today ? '#B45309' : undefined }}>{st.text}</span>
          {st.bins.map((b) => <Bin key={b} id={b} size={16} />)}
        </button>
      )}
      <button style={line} onClick={() => ctx.go('zuhause', 'haushalt')}>
        <span style={lab}>Wäsche</span><span style={{ flex: '1 1 auto' }}>am längsten her: {oldest} ({agoLabel(last[oldest], ctx.day)})</span>
      </button>
      <div style={{ borderTop: '1px solid #F0EBE3', paddingTop: 6 }}>
        <span style={{ fontWeight: 700, color: '#57534E' }}>Meine Ämtchen</span>
        {mine.length === 0 ? <div className="small" style={{ padding: '4px 0' }}>Heute frei.</div> : mine.map((c) => (
          <button key={c.id} className="row" onClick={() => toggleChore(ctx, c, ctx.day, c.done)} aria-pressed={c.done}>
            <Check on={c.done} /><span className={`row-title${c.done ? ' done' : ''}`}>{c.title}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
