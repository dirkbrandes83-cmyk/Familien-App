import { useState } from 'react';
import { Icon, Seg } from '../ui.jsx';
import { addDays, expand, mondayOf, longLabel, parse, iso, MONTHS, WD, weekday } from '../lib/dates.js';
import { EventRow } from './common.jsx';
import Betreuung, { ReviewBox, careStatus } from './Betreuung.jsx';

export default function Kalender({ ctx, seg = 'termine', setSeg = () => {} }) {
  const [view, setView] = useState('woche');
  const [who, setWho] = useState('all');
  const [weekStart, setWeekStart] = useState(mondayOf(ctx.day));
  const [month, setMonth] = useState(ctx.day.slice(0, 7));
  const [sel, setSel] = useState(ctx.day);

  const events = who === 'all' ? ctx.data.events.rows : ctx.data.events.rows.filter((e) => e.who.includes('all') || e.who.includes(who));
  const people = [{ id: 'all', name: 'Alle', color: '#1C1917', bg: '#E7E1D8' }, ...ctx.members];

  const openCare = ctx.data.care.rows.filter((c) => c.on_date >= ctx.day && careStatus(ctx.data.asks.rows.filter((a) => a.need_id === c.id)) !== 'gesichert').length;
  const top = (
    <Seg label="Bereich" value={seg} onPick={setSeg} options={[['termine', 'Termine'], ['betreuung', `Betreuung${openCare ? ` ${openCare} offen` : ''}`]]} />
  );
  if (seg === 'betreuung') return <>{top}<Betreuung ctx={ctx} /></>;

  return (
    <>
      {top}
      <ReviewBox ctx={ctx} />
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: '1 1 auto' }}>
          <Seg label="Ansicht" value={view} onPick={setView} options={[['woche', 'Woche'], ['monat', 'Monat']]} />
        </div>
        <button className="btn dark" onClick={() => ctx.openEvent(null, { start_date: view === 'monat' ? sel : ctx.day })}><Icon name="plus" size={18} />Neu</button>
      </div>
      <div className="chips scroll" role="group" aria-label="Nach Person filtern">
        {people.map((p) => (
          <button key={p.id} className={`chip${who === p.id ? ' on' : ''}`} aria-pressed={who === p.id}
            style={who === p.id ? { background: p.color, borderColor: p.color } : { color: p.color, borderColor: p.bg }}
            onClick={() => setWho(p.id)}>{p.name}</button>
        ))}
      </div>

      {view === 'woche' ? <Woche ctx={ctx} events={events} start={weekStart} setStart={setWeekStart} />
        : <Monat ctx={ctx} events={events} month={month} setMonth={setMonth} sel={sel} setSel={setSel} />}

      <div className="small">Neue Familientermine legt ihr hier an. Kalender.digital und andere Abos richtet ihr unter „Mehr“ ein – sie sind nur lesbar.</div>
    </>
  );
}

function Woche({ ctx, events, start, setStart }) {
  const end = addDays(start, 6);
  const occ = expand(events, start, end);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const s = parse(start), e = parse(end);
  const range = `${s.getDate()}. ${s.getMonth() !== e.getMonth() ? MONTHS[s.getMonth()] + ' ' : ''}– ${e.getDate()}. ${MONTHS[e.getMonth()]}`;
  const isThis = start === mondayOf(ctx.day);
  return (
    <>
      <div className="card-head">
        <button className="icon-btn" aria-label="Vorige Woche" onClick={() => setStart(addDays(start, -7))}><Icon name="left" /></button>
        <button className="btn ghost small" onClick={() => setStart(mondayOf(ctx.day))} disabled={isThis} style={{ flex: '1 1 auto' }}>{isThis ? `Diese Woche · ${range}` : `${range} · zu heute`}</button>
        <button className="icon-btn" aria-label="Nächste Woche" onClick={() => setStart(addDays(start, 7))}><Icon name="chev" /></button>
      </div>
      {days.map((d) => {
        const list = occ.filter((o) => o.date === d);
        const isToday = d === ctx.day;
        return (
          <section key={d} className="card" style={{ padding: list.length ? '12px 16px 4px' : '10px 16px', gap: 2, opacity: d < ctx.day ? 0.6 : 1 }}>
            <div className="card-head">
              <span className="label" style={isToday ? { color: '#0F766E' } : undefined}>{isToday ? 'Heute · ' : ''}{longLabel(d)}</span>
              <button className="icon-btn" style={{ width: 36, height: 36, border: 'none' }} aria-label={`Termin am ${longLabel(d)} anlegen`} onClick={() => ctx.openEvent(null, { start_date: d })}><Icon name="plus" size={16} /></button>
            </div>
            {list.length === 0 ? null : list.map((o) => <EventRow key={o.ev.id + o.date} ev={o.ev} date={o.date} ctx={ctx} />)}
          </section>
        );
      })}
    </>
  );
}

function Monat({ ctx, events, month, setMonth, sel, setSel }) {
  const first = `${month}-01`;
  const gridStart = mondayOf(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const lastRowNeeded = cells.slice(35).some((d) => d.slice(0, 7) === month);
  const shown = lastRowNeeded ? cells : cells.slice(0, 35);
  const occ = expand(events, shown[0], shown[shown.length - 1]);
  const byDay = {};
  for (const o of occ) (byDay[o.date] ||= []).push(o);
  const dotColors = (list) => {
    const ids = new Set();
    for (const o of list) for (const w of o.ev.who) ids.add(w);
    if (ids.has('all')) return ['#0F766E'];
    return [...ids].slice(0, 3).map((id) => ctx.member(id)?.color || '#57534E');
  };
  const m = parse(first);
  const shiftMonth = (n) => { const d = new Date(m.getFullYear(), m.getMonth() + n, 1, 12); setMonth(iso(d).slice(0, 7)); };
  const selList = byDay[sel] || [];
  return (
    <>
      <section className="card" style={{ padding: '10px 8px' }}>
        <div className="card-head" style={{ padding: '0 4px 6px' }}>
          <button className="icon-btn" aria-label="Voriger Monat" onClick={() => shiftMonth(-1)}><Icon name="left" /></button>
          <span style={{ fontWeight: 700 }}>{MONTHS[m.getMonth()]} {m.getFullYear()}</span>
          <button className="icon-btn" aria-label="Nächster Monat" onClick={() => shiftMonth(1)}><Icon name="chev" /></button>
        </div>
        <div className="month">
          {WD.map((w) => <span key={w} className="wd">{w}</span>)}
          {shown.map((d) => {
            const list = byDay[d] || [];
            const cls = ['mcell', d.slice(0, 7) !== month && 'out', d === ctx.day && 'today', d === sel && 'sel'].filter(Boolean).join(' ');
            return (
              <button key={d} className={cls} onClick={() => setSel(d)} aria-label={`${longLabel(d)}, ${list.length} Termine`} aria-pressed={d === sel}>
                <span>{parse(d).getDate()}</span>
                <span className="mdots">{dotColors(list).map((c, i) => <span key={i} style={{ background: c }} />)}</span>
              </button>
            );
          })}
        </div>
      </section>
      <section className="card" style={{ paddingBottom: 4 }}>
        <div className="card-head">
          <span className="label">{sel === ctx.day ? 'Heute · ' : ''}{longLabel(sel)}</span>
          <button className="icon-btn" aria-label="Termin an diesem Tag anlegen" onClick={() => ctx.openEvent(null, { start_date: sel })}><Icon name="plus" size={18} /></button>
        </div>
        {selList.length === 0 ? <div className="empty">Nichts geplant.</div> : selList.map((o) => <EventRow key={o.ev.id} ev={o.ev} date={o.date} ctx={ctx} />)}
      </section>
    </>
  );
}

export { weekday };
