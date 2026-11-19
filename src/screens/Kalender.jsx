import { useEffect, useState } from 'react';
import { Icon, Seg, Check } from '../ui.jsx';
import { addDays, expand, mondayOf, longLabel, parse, iso, MONTHS, WD, weekday } from '../lib/dates.js';
import { EventRow } from './common.jsx';
import { supabase, run } from '../data.js';
import { TodoKalender, amText } from './Erinnerungen.jsx';
import { besorgenText } from '../lib/aufgaben.js';
import Betreuung, { ReviewBox, careStatus } from './Betreuung.jsx';

export default function Kalender({ ctx, seg = 'termine', setSeg = () => {} }) {
  const [view, setView] = useState('woche');
  const [who, setWho] = useState('all');
  const [weekStart, setWeekStart] = useState(mondayOf(ctx.day));
  const [month, setMonth] = useState(ctx.day.slice(0, 7));
  const [sel, setSel] = useState(ctx.day);

  const events = who === 'all' ? ctx.data.events.rows : ctx.data.events.rows.filter((e) => e.who.includes('all') || e.who.includes(who));
  // To-dos, die einem Kalendertag zugeordnet sind (gefiltert wie die Termine)
  const todos = [
    ...ctx.data.inbox.rows.filter((t) => t.am && (who === 'all' || t.owner === who || t.for_who === who || (!t.owner && (t.typ ?? 'termin') === 'termin' && who === 'dirk'))),
    ...ctx.data.buy.rows.filter((b) => b.am && (who === 'all' || b.for_who === who)).map((b) => ({ ...b, _art: 'buy', title: besorgenText(b), done_at: b.done ? b.done_at || 'ja' : null })),
  ];
  const people = [{ id: 'all', name: 'Alle', color: '#1C1917', bg: '#E7E1D8' }, ...ctx.members];

  const openCare = ctx.data.care.rows.filter((c) => c.on_date >= ctx.day && careStatus(ctx.data.asks.rows.filter((a) => a.need_id === c.id)) !== 'gesichert').length;
  const bereich = <Seg label="Bereich" value={seg} onPick={setSeg} options={[['termine', 'Termine'], ['betreuung', `Betreuung${openCare ? ` ${openCare}` : ''}`]]} />;
  if (seg === 'betreuung') return <><div className="cal-bar"><div className="cal-row">{bereich}</div></div><Betreuung ctx={ctx} /></>;

  const isThis = weekStart === mondayOf(ctx.day);
  const s = parse(weekStart), e = parse(addDays(weekStart, 6));
  const range = `${s.getDate()}.${s.getMonth() + 1}. – ${e.getDate()}.${e.getMonth() + 1}.`;
  return (
    <>
      <div className="cal-bar">
        <div className="cal-row">
          {bereich}
          <Seg label="Ansicht" value={view} onPick={setView} options={[['woche', 'Woche'], ['monat', 'Monat']]} />
        </div>
        <div className="cal-row">
          <div className="chips scroll cal-chips" role="group" aria-label="Nach Person filtern">
            {people.map((p) => (
              <button key={p.id} className={`chip${who === p.id ? ' on' : ''}`} aria-pressed={who === p.id}
                style={who === p.id ? { background: p.color, borderColor: p.color, color: '#fff' } : { color: p.color, borderColor: p.bg }}
                onClick={() => setWho(p.id)}>{p.name}</button>
            ))}
          </div>
          <button className="icon-btn cal-new" aria-label="Neuer Termin" onClick={() => ctx.openEvent(null, { start_date: view === 'monat' ? sel : ctx.day })}><Icon name="plus" size={18} /></button>
        </div>
        {view === 'woche' && (
          <div className="cal-row cal-week">
            <button className="icon-btn" aria-label="Vorige Woche" onClick={() => setWeekStart(addDays(weekStart, -7))}><Icon name="left" size={18} /></button>
            <button className="cal-range" onClick={() => setWeekStart(mondayOf(ctx.day))} disabled={isThis}>{isThis ? `Diese Woche · ${range}` : `${range} · zu heute`}</button>
            <button className="icon-btn" aria-label="Nächste Woche" onClick={() => setWeekStart(addDays(weekStart, 7))}><Icon name="chev" size={18} /></button>
          </div>
        )}
      </div>
      <ReviewBox ctx={ctx} />

      {view === 'woche' ? <Woche ctx={ctx} events={events} todos={todos} start={weekStart} />
        : <Monat ctx={ctx} events={events} todos={todos} month={month} setMonth={setMonth} sel={sel} setSel={setSel} />}

      <div className="small">Neue Familientermine legt ihr hier an. Kalender.digital und andere Abos richtet ihr unter „Mehr“ ein – sie sind nur lesbar.</div>
    </>
  );
}

function Woche({ ctx, events, todos, start }) {
  const end = addDays(start, 6);
  const occ = expand(events, start, end);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const isThis = start === mondayOf(ctx.day);
  // Beim Öffnen (und bei „zu heute“) bis zum heutigen Tag scrollen
  useEffect(() => {
    if (!isThis || ctx.day === start) return;
    const el = document.getElementById(`tag-${ctx.day}`);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
  }, [isThis, start, ctx.day]);
  return (
    <>
      {days.map((d) => {
        const list = occ.filter((o) => o.date === d);
        const tl = todos.filter((t) => t.am === d);
        const isToday = d === ctx.day;
        return (
          <section key={d} id={`tag-${d}`} className="card cal-day" style={{ padding: list.length || tl.length ? '12px 16px 4px' : '10px 16px', gap: 2, opacity: d < ctx.day ? 0.6 : 1 }}>
            <div className="card-head">
              <span className="label" style={isToday ? { color: '#0F766E' } : undefined}>{isToday ? 'Heute · ' : ''}{longLabel(d)}</span>
              <button className="icon-btn" style={{ width: 36, height: 36, border: 'none' }} aria-label={`Termin am ${longLabel(d)} anlegen`} onClick={() => ctx.openEvent(null, { start_date: d })}><Icon name="plus" size={16} /></button>
            </div>
            <TagListe ctx={ctx} occ={list} todos={tl} />
          </section>
        );
      })}
    </>
  );
}

function Monat({ ctx, events, todos, month, setMonth, sel, setSel }) {
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
  const selTodos = todos.filter((t) => t.am === sel);
  const todoTage = new Set(todos.filter((t) => !t.done_at).map((t) => t.am));
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
                <span className="mdots">{dotColors(list).map((c, i) => <span key={i} style={{ background: c }} />)}{todoTage.has(d) && <span className="mdot-todo" />}</span>
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
        {selList.length === 0 && selTodos.length === 0 ? <div className="empty">Nichts geplant.</div> : <TagListe ctx={ctx} occ={selList} todos={selTodos} />}
      </section>
    </>
  );
}

// Termine und To-dos eines Tages nach Uhrzeit gemischt (Ganztägiges zuerst, To-dos ohne Zeit am Ende)
function TagListe({ ctx, occ, todos }) {
  const items = [
    ...occ.map((o) => ({ t: o.ev.all_day ? '00' : String(o.ev.from_time || '00'), el: <EventRow key={o.ev.id + o.date} ev={o.ev} date={o.date} ctx={ctx} /> })),
    ...todos.map((t) => ({ t: t.um ? String(t.um) : '99', el: <TodoRows key={(t._art || 't') + t.id} ctx={ctx} list={[t]} /> })),
  ].sort((a, b) => a.t.localeCompare(b.t));
  return <>{items.map((x) => x.el)}</>;
}

// To-dos im Kalender: abhaken direkt, antippen zum Verschieben
function TodoRows({ ctx, list }) {
  const [kal, setKal] = useState(null);
  if (!list.length) return null;
  const toggle = async (t) => {
    const v = t.done_at ? null : new Date().toISOString();
    const buy = t._art === 'buy';
    const data = buy ? ctx.data.buy : ctx.data.inbox;
    const patch = buy ? { done: !!v, done_at: v } : { done_at: v };
    data.local((rows) => rows.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    const ok = await run(supabase.from(buy ? 'buy_items' : 'todo_inbox').update(patch).eq('id', t.id), ctx.fail);
    if (!ok) data.reload();
  };
  const sorted = [...list].sort((a, b) => String(a.um || '99').localeCompare(String(b.um || '99')));
  return (
    <>
      {sorted.map((t) => {
        const owner = ctx.member(t.owner);
        const fuer = ctx.member(t.for_who);
        return (
          <div key={t.id} className="row cal-todo" style={{ opacity: t.done_at ? 0.55 : 1 }}>
            <span className="time">{t.um ? t.um.slice(0, 5) : <button className="cal-todo-check" aria-label={t.done_at ? 'Wieder öffnen' : 'Erledigt'} onClick={() => toggle(t)}><Check on={!!t.done_at} /></button>}</span>
            {t.um && <button className="cal-todo-check" aria-label={t.done_at ? 'Wieder öffnen' : 'Erledigt'} onClick={() => toggle(t)}><Check on={!!t.done_at} /></button>}
            <button className="cal-todo-main" onClick={() => setKal(t)}>
              <span className="row-main">
                <span className="row-title" style={t.done_at ? { textDecoration: 'line-through' } : undefined}>{t.title}</span>
                <span className="small">{[t._art === 'buy' && 'Besorgen', owner && `${owner.name} kümmert sich`, fuer && `für ${fuer.name}`, t.due && t.due !== t.am && `Frist ${amText({ am: t.due })}`].filter(Boolean).join(' · ') || 'To-do'}</span>
              </span>
              <Icon name="chev" size={18} className="chev" />
            </button>
          </div>
        );
      })}
      {kal && <TodoKalender ctx={ctx} todo={kal} onClose={() => setKal(null)} />}
    </>
  );
}

export { weekday };
