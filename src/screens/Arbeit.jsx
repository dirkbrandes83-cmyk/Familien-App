import { useState } from 'react';
import { supabase, run } from '../data.js';
import { Icon, Check, Sheet, Swipe } from '../ui.jsx';
import { UnterrichtHeute, FristenHeute, TeamThemen, besprechungVon, themenVon, istStunde, offeneZahl, BESPRECHUNG } from './ArbeitOrga.jsx';
import { FarbWahl, ABO_FARBEN } from './common.jsx';
import { addDays, mondayOf, parse, shortLabel, longLabel, hm, expand, WD, weekday, MONTHS } from '../lib/dates.js';
import { Seg, useBreit } from '../ui.jsx';

// Arbeitsbereich: private To-dos und Termine (nur ich sehe sie).
// Termine mit „Für die Familie wichtig“ erscheinen zusätzlich im Familienkalender (die Datenbank spiegelt sie).
const familieSetzen = async (ctx, ev, an) => {
  ctx.data.workEvents.local((rows) => rows.map((x) => (x.id === ev.id ? { ...x, familie: an } : x)));
  if (await run(supabase.from('work_events').update({ familie: an }).eq('id', ev.id), ctx.fail)) ctx.say(an ? 'Steht jetzt auch im Familienkalender' : 'Nur noch im Arbeitsbereich');
  else ctx.data.workEvents.reload();
};
const abhakenArbeit = async (ctx, t) => {
  const v = t.done_at ? null : new Date().toISOString();
  ctx.data.workTodos.local((rows) => rows.map((x) => (x.id === t.id ? { ...x, done_at: v } : x)));
  if (!await run(supabase.from('work_todos').update({ done_at: v }).eq('id', t.id), ctx.fail)) ctx.data.workTodos.reload();
  else if (v) ctx.say('Erledigt', () => abhakenArbeit(ctx, { ...t, done_at: v }));
};

// Kalender-Termine ohne Stundenplan (Untis-Stunden stehen unter „Stunden“)
const kalenderTermine = (ctx) => ctx.data.workEvents.rows.filter((e) => !istStunde(ctx, e));
// Ausgeklappte Termine ohne Doppelte (z. B. „Weihnachtsferien“ zweimal im Schulkalender), Ganztägiges zuerst
const termineIm = (ctx, von, bis) => {
  const gesehen = new Set();
  return expand(kalenderTermine(ctx), von, bis).filter((o) => { const k = `${o.date}|${o.ev.title.trim().toLowerCase()}|${o.ev.from_time ?? ''}`; if (gesehen.has(k)) return false; gesehen.add(k); return true; })
    .sort((a, b) => a.date.localeCompare(b.date) || (b.ev.all_day ? 1 : 0) - (a.ev.all_day ? 1 : 0) || String(a.ev.from_time || '').localeCompare(String(b.ev.from_time || '')));
};
const aboFarbeArbeit = (ctx, ev) => (ev.sub_id ? ctx.data.subs.rows.find((x) => x.id === ev.sub_id)?.farbe : null) || null;

// Seiten im Arbeitsmodus
export function ArbeitTodosSeite({ ctx }) {
  return <ArbeitTodos ctx={ctx} />;
}
export function ArbeitKalenderSeite({ ctx }) {
  const [abo, setAbo] = useState(false);
  return (
    <>
      <ArbeitTermine ctx={ctx} />
      <button className="btn ghost" onClick={() => setAbo(!abo)}><Icon name="cal" size={18} />Dienstkalender abonnieren</button>
      {abo && <ArbeitsAbo ctx={ctx} />}
    </>
  );
}

// Arbeit heute: Termine, fällige To-dos – und was privat heute ansteht (damit nichts kollidiert)
export function ArbeitHeuteSeite({ ctx }) {
  const [todo, setTodo] = useState(null);
  const [termin, setTermin] = useState(null);
  const breit = useBreit();
  const farbe = (ev) => aboFarbeArbeit(ctx, ev);
  const occ = termineIm(ctx, ctx.day, ctx.day);
  const woche = termineIm(ctx, addDays(ctx.day, 1), addDays(ctx.day, 6));
  const faellig = ctx.data.workTodos.rows.filter((t) => !t.done_at && ((t.am && t.am <= ctx.day) || (t.due && t.due <= addDays(ctx.day, 1))));
  const privat = expand(ctx.data.events.rows.filter((e) => e.src !== 'arbeit' && ((e.who || []).includes(ctx.me.id) || (e.who || []).includes('all') || e.bring_by === ctx.me.name || e.pick_by === ctx.me.name)), ctx.day, ctx.day);
  return (
    <div className="ar-dash">
      <div className="ar-col">
      <UnterrichtHeute ctx={ctx} />
      <section className="card tight">
        <div className="h-label" style={{ padding: '12px 0 4px' }}>Termine heute</div>
        {occ.length === 0 && <div className="empty" style={{ padding: '6px 0 12px' }}>Keine Arbeitstermine heute.</div>}
        {occ.map((o) => <TerminZeile key={o.ev.id} ctx={ctx} o={o} onOpen={setTermin} />)}
      </section>
      </div>
      <div className="ar-col">
      <section className="card tight">
        <div className="h-label" style={{ padding: '12px 0 4px' }}>Fällig</div>
        {faellig.length === 0 && <div className="empty" style={{ padding: '6px 0 12px' }}>Nichts fällig.</div>}
        {faellig.map((t) => (
          <div key={t.id} className="row">
            <button className="row-check" aria-label={`${t.title} erledigt`} onClick={() => abhakenArbeit(ctx, t)}><Check on={false} /></button>
            <button className="row-open" onClick={() => setTodo(t)}><span className="row-main"><span className="row-title">{t.title}</span>{(t.due || t.kategorie) && <span className="small">{[t.kategorie, t.due && `bis ${shortLabel(t.due)}`].filter(Boolean).join(' · ')}</span>}</span></button>
          </div>
        ))}
      </section>
      <FristenHeute ctx={ctx} />
      </div>
      <div className="ar-col">
      {woche.length > 0 && (
        <section className="card tight">
          <div className="h-label" style={{ padding: '12px 0 4px' }}>Nächste Tage</div>
          {woche.slice(0, breit ? 12 : 6).map((o) => <div key={o.ev.id + o.date} className="small ar-zeile" style={farbe(o.ev) ? { borderLeft: `3px solid ${farbe(o.ev)}`, paddingLeft: 6 } : undefined}><b>{shortLabel(o.date)} {o.ev.all_day ? '' : hm(o.ev.from_time)}</b> {o.ev.title}</div>)}
          <div style={{ height: 8 }} />
        </section>
      )}
      {privat.length > 0 && (
        <section className="card tight ar-privat">
          <div className="h-label" style={{ padding: '12px 0 4px' }}>Privat heute</div>
          {privat.map((o) => <div key={o.ev.id} className="small ar-zeile"><b>{o.ev.all_day ? 'ganzt.' : hm(o.ev.from_time)}</b> {o.ev.title}</div>)}
          <div style={{ height: 8 }} />
        </section>
      )}
      </div>
      {todo && <TodoSheet ctx={ctx} t={todo} onClose={() => setTodo(null)} />}
      {termin && <TerminSheet ctx={ctx} ev={termin.ev} datum={termin.date} onClose={() => setTermin(null)} />}
    </div>
  );
}

// Kategorien der Arbeits-To-dos (aus den vorhandenen Einträgen, alphabetisch)
export const kategorienVon = (todos) => [...new Set(todos.map((t) => t.kategorie).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'de'));

function ArbeitTodos({ ctx }) {
  const [todo, setTodo] = useState(null);
  const [filter, setFilter] = useState('alle');
  const todos = ctx.data.workTodos.rows;
  const kats = kategorienVon(todos);
  const offen = todos.filter((t) => !t.done_at).sort((a, b) => String(a.am || a.due || '9999').localeCompare(String(b.am || b.due || '9999')) || a.created_at.localeCompare(b.created_at));
  const abhaken = (t) => abhakenArbeit(ctx, t);
  const zeigen = filter === 'alle' ? offen : offen.filter((t) => (t.kategorie || '') === (filter === 'ohne' ? '' : filter));
  // Gruppen: bei „Alle“ nach Kategorie, Einträge ohne Kategorie zum Schluss
  const gruppen = filter === 'alle'
    ? [...kats.map((k) => [k, zeigen.filter((t) => t.kategorie === k)]), ['', zeigen.filter((t) => !t.kategorie)]].filter(([, l]) => l.length)
    : [[filter === 'ohne' ? '' : filter, zeigen]];
  const Zeile = (t) => {
    const faellig = (t.due && t.due <= ctx.day) || (t.am && t.am <= ctx.day);
    return (
      <Swipe key={t.id} onRight={() => abhaken(t)} onLeft={() => loeschen(ctx, t)}>
        <div className="row">
          <button className="row-check" aria-label={`${t.title} erledigt`} onClick={() => abhaken(t)}><Check on={false} /></button>
          <button className="row-open" onClick={() => setTodo(t)}>
            <span className="row-main">
              <span className="row-title">{t.title}</span>
              {(t.am || t.due || t.note) && <span className="small">{[t.am && `${shortLabel(t.am)}${t.um ? ` ${hm(t.um)}` : ''}`, t.due && <b key="d" style={{ color: faellig ? '#B45309' : undefined }}>bis {shortLabel(t.due)}</b>, t.note].filter(Boolean).reduce((acc, x, i) => (i ? [...acc, ' · ', x] : [x]), [])}</span>}
            </span>
          </button>
        </div>
      </Swipe>
    );
  };
  return (
    <>
      {kats.length > 0 && (
        <div className="chips ar-kats" role="group" aria-label="Nach Kategorie filtern">
          {[['alle', `Alle ${offen.length}`], ...kats.map((k) => [k, `${k} ${offen.filter((t) => t.kategorie === k).length}`]), ...(offen.some((t) => !t.kategorie) ? [['ohne', 'Ohne']] : [])].map(([id, l]) => (
            <button key={id} className={`chip${filter === id ? ' on' : ''}`} aria-pressed={filter === id} onClick={() => setFilter(id)}>{l}</button>
          ))}
        </div>
      )}
      <section className="card tight">
        <div className="card-head" style={{ padding: '10px 0 6px' }}>
          <div className="card-title">{filter === 'alle' ? 'To-dos Arbeit' : filter === 'ohne' ? 'Ohne Kategorie' : filter}</div>
          <button className="icon-btn" aria-label="Neues Arbeits-To-do" onClick={() => setTodo({ kategorie: filter !== 'alle' && filter !== 'ohne' ? filter : null })}><Icon name="plus" size={18} /></button>
        </div>
        {zeigen.length === 0 && <div className="empty" style={{ padding: '8px 0' }}>Nichts offen.</div>}
        <div className="ar-gruppen">
        {gruppen.map(([k, l]) => (
          <div key={k || '-'} className="ar-gruppe">
            {filter === 'alle' && kats.length > 0 && <div className="label ar-kat-label">{k || 'Ohne Kategorie'}</div>}
            {l.map(Zeile)}
          </div>
        ))}
        </div>
      </section>
      {todo && <TodoSheet ctx={ctx} t={todo} onClose={() => setTodo(null)} />}
    </>
  );
}

function ArbeitTermine({ ctx }) {
  const [ansicht, setAnsichtRaw] = useState(() => { try { return localStorage.getItem('arbeit-ansicht') || 'woche'; } catch { return 'woche'; } });
  const setAnsicht = (v) => { setAnsichtRaw(v); try { localStorage.setItem('arbeit-ansicht', v); } catch { /* egal */ } };
  const umschalter = <div className="li-seg"><Seg label="Ansicht" value={ansicht} onPick={setAnsicht} options={[['woche', 'Woche', 'Woche'], ['monat', 'Monat', 'Monat']]} /></div>;
  if (ansicht === 'monat') return <>{umschalter}<ArbeitMonat ctx={ctx} /></>;
  return <>{umschalter}<ArbeitWoche ctx={ctx} /></>;
}

// Zeile eines Arbeitstermins (Woche, Monat): antippen öffnet Termin mit Erinnerungen
function TerminZeile({ ctx, o, onOpen }) {
  const farbe = aboFarbeArbeit(ctx, o.ev);
  const erin = ctx.data.workTodos.rows.filter((t) => t.termin_id === o.ev.id && (!t.termin_am || t.termin_am === o.date));
  const offen = erin.filter((t) => !t.done_at).length;
  const art = besprechungVon(o.ev);
  const themen = art ? themenVon(ctx, o.ev, o.date).filter((t) => !t.besprochen_at).length + (o.date >= ctx.day ? offeneZahl(ctx, art) : 0) : 0;
  return (
    <div className={`row ar-ev${farbe ? ' abo-farbig' : ''}`} style={farbe ? { '--abo': farbe } : undefined}>
      <span className="time">{o.ev.all_day ? 'ganzt.' : hm(o.ev.from_time)}</span>
      <button className="row-open" onClick={() => onOpen(o)}>
        <span className="row-main"><span className="row-title">{o.ev.title}</span>
          {(o.ev.to_time || o.ev.note || erin.length > 0 || art) && <span className="small">{[o.ev.to_time && `bis ${hm(o.ev.to_time)}`, art && `🗣 ${BESPRECHUNG[art].label}${themen ? ` · ${themen} Themen` : ''}`, erin.length > 0 && (offen ? `🔔 ${offen} offen` : '🔔 erledigt'), o.ev.note].filter(Boolean).join(' · ')}</span>}</span>
      </button>
      <button className={`ar-fam mini${o.ev.familie ? ' an' : ''}`} aria-pressed={o.ev.familie} aria-label={o.ev.familie ? 'Aus dem Familienkalender nehmen' : 'Auch im Familienkalender zeigen'} title={o.ev.familie ? 'Steht im Familienkalender' : 'Im Familienkalender zeigen'} onClick={() => familieSetzen(ctx, o.ev, !o.ev.familie)}>
        <Icon name="users" size={16} />
      </button>
    </div>
  );
}

function ArbeitMonat({ ctx }) {
  const [month, setMonth] = useState(ctx.day.slice(0, 7));
  const [sel, setSel] = useState(ctx.day);
  const [termin, setTermin] = useState(null);
  const [todo, setTodo] = useState(null);
  const first = `${month}-01`;
  const gridStart = mondayOf(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const shown = cells.slice(35).some((d) => d.slice(0, 7) === month) ? cells : cells.slice(0, 35);
  const occ = termineIm(ctx, shown[0], shown[shown.length - 1]);
  const byDay = {};
  for (const o of occ) (byDay[o.date] ||= []).push(o);
  const todos = ctx.data.workTodos.rows;
  const todoTage = new Set(todos.filter((t) => !t.done_at && t.am).map((t) => t.am));
  const fristTage = new Set(ctx.data.workFristen.rows.filter((x) => !x.erledigt_at).map((x) => x.datum));
  const m = parse(first);
  const shift = (n) => { const d = new Date(m.getFullYear(), m.getMonth() + n, 1, 12); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); };
  const sortiert = (l) => [...l].sort((a, b) => (b.ev.all_day ? 1 : 0) - (a.ev.all_day ? 1 : 0) || String(a.ev.from_time || '').localeCompare(String(b.ev.from_time || '')));
  const selList = sortiert(byDay[sel] || []);
  const selTodos = todos.filter((t) => t.am === sel);
  const selFristen = ctx.data.workFristen.rows.filter((x) => x.datum === sel);
  return (
    <div className="ar-split">
      <section className="card" style={{ padding: '10px 8px' }}>
        <div className="card-head" style={{ padding: '0 4px 6px' }}>
          <button className="icon-btn" aria-label="Voriger Monat" onClick={() => shift(-1)}><Icon name="left" /></button>
          <button className="cal-range" style={{ fontWeight: 700 }} onClick={() => { setMonth(ctx.day.slice(0, 7)); setSel(ctx.day); }}>{MONTHS[m.getMonth()]} {m.getFullYear()}</button>
          <button className="icon-btn" aria-label="Nächster Monat" onClick={() => shift(1)}><Icon name="chev" /></button>
        </div>
        <div className="month mtext">
          {WD.map((w) => <span key={w} className="wd">{w}</span>)}
          {shown.map((d) => {
            const list = sortiert(byDay[d] || []);
            const cls = ['mcell', d.slice(0, 7) !== month && 'out', d === ctx.day && 'today', d === sel && 'sel'].filter(Boolean).join(' ');
            return (
              <button key={d} className={cls} onClick={() => setSel(d)} aria-label={`${longLabel(d)}, ${list.length} Termine`} aria-pressed={d === sel}>
                <span className="mnum">{parse(d).getDate()}</span>
                <span className="mevs">
                  {fristTage.has(d) && <span className="mev"><i><b style={{ background: '#B91C1C' }} /></i>Frist</span>}
                  {list.slice(0, 4).map((o) => <span key={o.ev.id} className={`mev${o.ev.end_date && o.date !== o.ev.start_date && weekday(o.date) !== 0 ? ' weiter' : ''}`}><i><b style={{ background: aboFarbeArbeit(ctx, o.ev) || '#4338CA' }} /></i>{o.ev.title}</span>)}
                  {list.length > 4 && <span className="mev more">+{list.length - 4}</span>}
                  {todoTage.has(d) && <span className="mev todo"><i><b style={{ background: '#B45309' }} /></i>To-do</span>}
                </span>
              </button>
            );
          })}
        </div>
      </section>
      <section className="card tight">
        <div className="card-head" style={{ padding: '10px 0 6px' }}>
          <span className="label">{sel === ctx.day ? 'Heute · ' : ''}{longLabel(sel)}</span>
          <button className="icon-btn" aria-label="Arbeitstermin an diesem Tag" onClick={() => setTermin({ ev: { start_date: sel }, date: sel })}><Icon name="plus" size={18} /></button>
        </div>
        {selFristen.map((x) => <div key={x.id} className="small ar-zeile" style={{ color: '#B91C1C' }}><b>Frist:</b> {x.titel}</div>)}
        {selList.map((o) => <TerminZeile key={o.ev.id} ctx={ctx} o={o} onOpen={(x) => setTermin(x)} />)}
        {selTodos.map((t) => (
          <div key={t.id} className="row ar-ev" style={{ opacity: t.done_at ? 0.55 : 1 }}>
            <button className="row-check" onClick={() => abhakenArbeit(ctx, t)} aria-label={`${t.title} erledigt`}><Check on={!!t.done_at} /></button>
            <button className="row-open" onClick={() => setTodo(t)}><span className="row-main"><span className="row-title">{t.title}</span><span className="small">To-do{t.um ? ` · ${hm(t.um)}` : ''}</span></span></button>
          </div>
        ))}
        {!selList.length && !selTodos.length && !selFristen.length && <div className="empty" style={{ padding: '6px 0 12px' }}>Nichts eingetragen.</div>}
      </section>
      {termin && <TerminSheet ctx={ctx} ev={termin.ev} datum={termin.date} onClose={() => setTermin(null)} />}
      {todo && <TodoSheet ctx={ctx} t={todo} onClose={() => setTodo(null)} />}
    </div>
  );
}

function ArbeitWoche({ ctx }) {
  const breit = useBreit();
  const [start, setStart] = useState(mondayOf(ctx.day));
  const [termin, setTermin] = useState(null);
  const [todo, setTodo] = useState(null);
  const todos = ctx.data.workTodos.rows;
  const occ = termineIm(ctx, start, addDays(start, 6));
  const tage = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const isThis = start === mondayOf(ctx.day);
  const s = parse(start), e = parse(addDays(start, 6));
  const abhaken = (t) => abhakenArbeit(ctx, t);
  return (
    <>
      <section className="card tight">
        <div className="card-head" style={{ padding: '10px 0 6px' }}>
          <div className="card-title">Termine Arbeit</div>
          <button className="icon-btn" aria-label="Neuer Arbeitstermin" onClick={() => setTermin({ ev: { start_date: ctx.day }, date: ctx.day })}><Icon name="plus" size={18} /></button>
        </div>
        <div className="cal-row cal-week" style={{ padding: '0 0 6px' }}>
          <button className="icon-btn" aria-label="Vorige Woche" onClick={() => setStart(addDays(start, -7))}><Icon name="left" size={18} /></button>
          <button className="cal-range" onClick={() => setStart(mondayOf(ctx.day))} disabled={isThis}>{isThis ? 'Diese Woche' : `${s.getDate()}.${s.getMonth() + 1}. – ${e.getDate()}.${e.getMonth() + 1}. · zu heute`}</button>
          <button className="icon-btn" aria-label="Nächste Woche" onClick={() => setStart(addDays(start, 7))}><Icon name="chev" size={18} /></button>
        </div>
        <div className="ar-woche">
        {tage.map((d) => {
          const list = occ.filter((o) => o.date === d);
          const tt = todos.filter((t) => t.am === d);
          if (!list.length && !tt.length && !breit) return null;
          return (
            <div key={d} className="ar-tag">
              <div className={`label${d === ctx.day ? ' heute' : ''}`}>{d === ctx.day ? 'Heute' : `${WD[weekday(d)]} ${parse(d).getDate()}.`}</div>
              {list.map((o) => <TerminZeile key={o.ev.id + d} ctx={ctx} o={o} onOpen={(x) => setTermin(x)} />)}
              {tt.map((t) => (
                <div key={t.id} className="row ar-ev" style={{ opacity: t.done_at ? 0.55 : 1 }}>
                  <button className="row-check" onClick={() => abhaken(t)} aria-label={`${t.title} erledigt`}><Check on={!!t.done_at} /></button>
                  <button className="row-open" onClick={() => setTodo(t)}><span className="row-main"><span className="row-title">{t.title}</span><span className="small">To-do{t.um ? ` · ${hm(t.um)}` : ''}</span></span></button>
                </div>
              ))}
            </div>
          );
        })}
        </div>
        {occ.length === 0 && !todos.some((t) => t.am && t.am >= start && t.am <= addDays(start, 6)) && <div className="empty" style={{ padding: '8px 0' }}>Keine Arbeitstermine in dieser Woche.</div>}
      </section>
      {termin && <TerminSheet ctx={ctx} ev={termin.ev} datum={termin.date} onClose={() => setTermin(null)} />}
      {todo && <TodoSheet ctx={ctx} t={todo} onClose={() => setTodo(null)} />}
    </>
  );
}

async function loeschen(ctx, t) {
  ctx.data.workTodos.local((rows) => rows.filter((x) => x.id !== t.id));
  if (await run(supabase.from('work_todos').delete().eq('id', t.id), ctx.fail)) ctx.say('Gelöscht', () => run(supabase.from('work_todos').insert(t), ctx.fail).then(() => ctx.data.workTodos.reload()));
  else ctx.data.workTodos.reload();
}

export function TodoSheet({ ctx, t, onClose }) {
  const neu = !t.id;
  const [f, setF] = useState({ title: t.title ?? '', am: t.am ?? '', um: t.um ? hm(t.um) : '', due: t.due ?? '', note: t.note ?? '', kategorie: t.kategorie ?? '' });
  const kats = kategorienVon(ctx.data.workTodos.rows);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const speichern = async () => {
    if (!f.title.trim()) return;
    const row = { title: f.title.trim().slice(0, 160), am: f.am || null, um: f.am && f.um ? f.um : null, due: f.due || null, note: f.note.trim() || null, kategorie: f.kategorie.trim().slice(0, 40) || null };
    const ok = neu ? await run(supabase.from('work_todos').insert({ ...row, owner: ctx.me.id }), ctx.fail) : await run(supabase.from('work_todos').update(row).eq('id', t.id), ctx.fail);
    if (ok) { ctx.data.workTodos.reload(); onClose(); }
  };
  return (
    <Sheet title={neu ? 'To-do Arbeit' : 'To-do bearbeiten'} onClose={onClose}
      actions={<>
        <button className="btn" disabled={!f.title.trim()} onClick={speichern}>{neu ? 'Eintragen' : 'Speichern'}</button>
        {!neu && <button className="ein-del" onClick={() => { loeschen(ctx, t); onClose(); }}><Icon name="trash" size={16} />Löschen</button>}
      </>}>
      <label className="field"><span>Was?</span><input className="input" value={f.title} onChange={(e) => set({ title: e.target.value })} autoFocus={neu} maxLength={160} placeholder="z. B. LEBs Klasse 6b korrigieren" /></label>
      <div className="field"><span>Kategorie</span>
        {kats.length > 0 && (
          <div className="chips">
            {kats.map((k) => <button key={k} type="button" className={`chip${f.kategorie === k ? ' on' : ''}`} aria-pressed={f.kategorie === k} onClick={() => set({ kategorie: f.kategorie === k ? '' : k })}>{k}</button>)}
          </div>
        )}
        <input className="input" value={f.kategorie} onChange={(e) => set({ kategorie: e.target.value })} maxLength={40} placeholder={kats.length ? 'oder neue Kategorie' : 'z. B. Jahrgang 6, Deutsch, Schulentwicklung'} style={{ marginTop: kats.length ? 8 : 0 }} />
      </div>
      <div className="two">
        <label className="field"><span>An welchem Tag? (optional)</span><input className="input" type="date" value={f.am} onChange={(e) => set({ am: e.target.value })} /></label>
        <label className="field"><span>Uhrzeit</span><input className="input" type="time" value={f.um} disabled={!f.am} onChange={(e) => set({ um: e.target.value })} /></label>
      </div>
      <label className="field"><span>Frist (spätestens bis)</span><input className="input" type="date" value={f.due} onChange={(e) => set({ due: e.target.value })} /></label>
      <label className="field"><span>Notiz</span><textarea className="input" rows={2} value={f.note} onChange={(e) => set({ note: e.target.value })} maxLength={500} /></label>
    </Sheet>
  );
}

// Typische Erinnerungen zu einem Termin: Text und wie viele Tage vorher fällig
export const ERINNERUNGEN = [
  ['Elternbrief schreiben', 7],
  ['Untis-Nachricht formulieren', 2],
  ['Antrag stellen', 14],
  ['Material vorbereiten', 1],
];
const faelligAb = (ctx, datum, tage) => { const d = addDays(datum, -tage); return d < ctx.day ? ctx.day : d; };

function TerminErinnerungen({ ctx, ev, datum }) {
  const [eigen, setEigen] = useState('');
  const [tage, setTage] = useState(1);
  const liste = ctx.data.workTodos.rows.filter((t) => t.termin_id === ev.id && (!t.termin_am || t.termin_am === datum)).sort((a, b) => String(a.due).localeCompare(String(b.due)));
  const hat = (text) => liste.some((t) => t.title.startsWith(text));
  const anlegen = async (text, n) => {
    const row = { owner: ctx.me.id, title: `${text} – ${ev.title}`.slice(0, 160), due: faelligAb(ctx, datum, n), termin_id: ev.id, termin_am: datum, note: `Zum Termin am ${shortLabel(datum)}` };
    if (await run(supabase.from('work_todos').insert(row), ctx.fail)) { ctx.data.workTodos.reload(); ctx.say(`Erinnerung bis ${shortLabel(row.due)}`); }
  };
  return (
    <div className="field"><span>Erinnerungen dazu</span>
      {liste.map((t) => (
        <div key={t.id} className="row" style={{ minHeight: 42 }}>
          <button className="row-check" aria-label={`${t.title} erledigt`} onClick={() => abhakenArbeit(ctx, t)}><Check on={!!t.done_at} /></button>
          <span className="row-main"><span className="row-title" style={{ textDecoration: t.done_at ? 'line-through' : undefined }}>{t.title.replace(` – ${ev.title}`, '')}</span><span className="small">bis {shortLabel(t.due)}</span></span>
          <button className="icon-btn" aria-label="Erinnerung löschen" onClick={() => loeschen(ctx, t)}><Icon name="x" size={16} /></button>
        </div>
      ))}
      <div className="chips" style={{ marginTop: 6 }}>
        {ERINNERUNGEN.filter(([text]) => !hat(text)).map(([text, n]) => (
          <button key={text} type="button" className="chip" onClick={() => anlegen(text, n)}>+ {text} <span className="small">({n === 1 ? '1 Tag' : `${n} Tage`} vorher)</span></button>
        ))}
      </div>
      <form className="frist-schritt" style={{ marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); if (eigen.trim()) { anlegen(eigen.trim(), Number(tage) || 0); setEigen(''); } }}>
        <input className="input" value={eigen} onChange={(e) => setEigen(e.target.value)} placeholder="Eigene Erinnerung" maxLength={120} />
        <input className="input" type="number" min="0" max="365" inputMode="numeric" value={tage} onChange={(e) => setTage(e.target.value)} aria-label="Tage vorher" />
        <span className="small">T. vorher</span>
        <button className="icon-btn" aria-label="Erinnerung anlegen" disabled={!eigen.trim()}><Icon name="plus" size={16} /></button>
      </form>
    </div>
  );
}

export function TerminSheet({ ctx, ev: ev0, datum: datum0, onClose }) {
  const neu = !ev0.id;
  // aktuelle Fassung aus den Daten (z. B. nach Umschalten „Teamsitzung“)
  const ev = (ev0.id && ctx.data.workEvents.rows.find((x) => x.id === ev0.id)) || ev0;
  const datum = datum0 || ev.start_date || ctx.day;
  const abo = !!ev.sub_id;
  const [f, setF] = useState({ title: ev.title ?? '', start_date: ev.start_date ?? ctx.day, all_day: !!ev.all_day, from_time: ev.from_time ? hm(ev.from_time) : '', to_time: ev.to_time ? hm(ev.to_time) : '', note: ev.note ?? '', familie: !!ev.familie, art: neu ? null : besprechungVon(ev) });
  const [vorab, setVorab] = useState([]); // bei neuen Terminen: Erinnerungen, die beim Speichern angelegt werden
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const ok = f.title.trim() && f.start_date && (f.all_day || f.from_time);
  const artSetzen = async (art) => {
    set({ art });
    if (neu) return;
    const wert = art || 'keine';
    ctx.data.workEvents.local((rows) => rows.map((x) => (x.id === ev.id ? { ...x, besprechung: wert } : x)));
    if (!await run(supabase.from('work_events').update({ besprechung: wert }).eq('id', ev.id), ctx.fail)) ctx.data.workEvents.reload();
  };
  const speichern = async () => {
    if (abo) { onClose(); return; }
    if (!ok) return;
    const row = { title: f.title.trim().slice(0, 200), start_date: f.start_date, all_day: f.all_day, from_time: f.all_day ? null : f.from_time, to_time: f.all_day || !f.to_time ? null : f.to_time, note: f.note.trim(), familie: f.familie, besprechung: f.art || (neu ? null : 'keine') };
    const res = neu ? await run(supabase.from('work_events').insert({ ...row, owner: ctx.me.id }).select('id').single(), ctx.fail) : await run(supabase.from('work_events').update(row).eq('id', ev.id), ctx.fail);
    if (!res) return;
    if (neu && vorab.length) {
      await run(supabase.from('work_todos').insert(vorab.map(([text, n]) => ({ owner: ctx.me.id, title: `${text} – ${row.title}`.slice(0, 160), due: faelligAb(ctx, row.start_date, n), termin_id: res.id, termin_am: row.start_date, note: `Zum Termin am ${shortLabel(row.start_date)}` }))), ctx.fail);
      ctx.data.workTodos.reload();
    }
    ctx.data.workEvents.reload(); ctx.data.events.reload(); onClose();
  };
  const loesch = async () => {
    if (await run(supabase.from('work_events').delete().eq('id', ev.id), ctx.fail)) { ctx.data.workEvents.reload(); ctx.data.events.reload(); ctx.say('Termin gelöscht'); onClose(); }
  };
  return (
    <Sheet title={neu ? 'Arbeitstermin' : abo ? ev.title : longLabel(datum)} onClose={onClose}
      actions={<>
        {abo ? <button className="btn" onClick={onClose}>Fertig</button> : <button className="btn" disabled={!ok} onClick={speichern}>{neu ? 'Eintragen' : 'Speichern'}</button>}
        {!neu && !abo && <button className="ein-del" onClick={loesch}><Icon name="trash" size={16} />Löschen</button>}
      </>}>
      {abo ? (
        <div className="small" style={{ fontSize: 15 }}>
          <b>{longLabel(datum)}</b>{ev.all_day ? ' · ganztägig' : ` · ${hm(ev.from_time)}${ev.to_time ? `–${hm(ev.to_time)}` : ''}`}
          {ev.note && <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{ev.note}</div>}
          <div style={{ marginTop: 4 }}>Aus dem Abo „{ctx.data.subs.rows.find((x) => x.id === ev.sub_id)?.name ?? 'Dienstkalender'}“ – nur lesbar.</div>
        </div>
      ) : (
        <>
          <label className="field"><span>Was?</span><input className="input" value={f.title} onChange={(e) => set({ title: e.target.value })} autoFocus={neu} maxLength={200} placeholder="z. B. Zeugniskonferenz" /></label>
          <label className="field"><span>Tag</span><input className="input" type="date" value={f.start_date} onChange={(e) => set({ start_date: e.target.value })} /></label>
          <label className="gift-privat"><input type="checkbox" checked={f.all_day} onChange={(e) => set({ all_day: e.target.checked })} /> ganztägig</label>
          {!f.all_day && (
            <div className="two">
              <label className="field"><span>Von</span><input className="input" type="time" value={f.from_time} onChange={(e) => set({ from_time: e.target.value })} /></label>
              <label className="field"><span>Bis</span><input className="input" type="time" value={f.to_time} onChange={(e) => set({ to_time: e.target.value })} /></label>
            </div>
          )}
          <label className="toggle-row">
            <span><span style={{ fontWeight: 600 }}>Für die Familie wichtig</span><span className="small" style={{ display: 'block' }}>Erscheint dann auch im Familienkalender (bei dir)</span></span>
            <input type="checkbox" checked={f.familie} onChange={(e) => set({ familie: e.target.checked })} style={{ width: 24, height: 24 }} />
          </label>
        </>
      )}
      <div className="field"><span>Besprechung mit Themenliste</span>
        <div className="chips">{[[null, 'Keine'], ['team', 'Teamsitzung'], ['esl', 'ESL']].map(([k, l]) => (
          <button key={l} type="button" className={`chip${f.art === k ? ' on' : ''}`} aria-pressed={f.art === k} onClick={() => artSetzen(k)}>{l}</button>
        ))}</div>
      </div>
      {f.art && !neu && <TeamThemen ctx={ctx} ev={{ ...ev, besprechung: f.art }} datum={datum} />}
      {!neu && <TerminErinnerungen ctx={ctx} ev={ev} datum={datum} />}
      {neu && (
        <div className="field"><span>Erinnerungen dazu</span>
          <div className="chips">{ERINNERUNGEN.map(([text, n]) => {
            const on = vorab.some((v) => v[0] === text);
            return <button key={text} type="button" className={`chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => setVorab(on ? vorab.filter((v) => v[0] !== text) : [...vorab, [text, n]])}>{text}</button>;
          })}</div>
        </div>
      )}
      {!abo && <label className="field"><span>Notiz / Ort</span><textarea className="input" rows={2} value={f.note} onChange={(e) => set({ note: e.target.value })} maxLength={1000} /></label>}
    </Sheet>
  );
}

// Privates Kalender-Abo (z. B. Schulkalender): Termine landen nur im Arbeitsbereich
function ArbeitsAbo({ ctx }) {
  const meine = ctx.data.subs.rows.filter((x) => x.arbeit_von === ctx.me.id);
  const [f, setF] = useState({ name: 'Schulkalender', url: '' });
  const [busy, setBusy] = useState(false);
  const sync = async (id) => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('abo-sync', { body: { sub_id: id } });
    setBusy(false);
    const r = Object.values(data?.ergebnis || {})[0];
    if (error || r?.fehler) ctx.fail(r?.fehler || 'Abgleich fehlgeschlagen');
    else if (r) { ctx.say(`Abgeglichen: ${r.neu} neu, ${r.geaendert} geändert, ${r.entfernt} entfernt`); ctx.data.workEvents.reload(); }
  };
  const add = async (e) => {
    e.preventDefault();
    if (!f.name.trim() || !/^(https?|webcal):\/\//i.test(f.url.trim())) { ctx.fail('Bitte einen Link mit https:// oder webcal:// einfügen'); return; }
    const res = await run(supabase.from('calendar_subscriptions').insert({ name: f.name.trim(), url: f.url.trim(), who: [ctx.me.id], arbeit_von: ctx.me.id, farbe: ABO_FARBEN.find((c) => !ctx.data.subs.rows.some((r) => r.farbe === c)) ?? null }).select('id').single(), ctx.fail);
    if (res) { setF({ name: '', url: '' }); ctx.data.subs.reload(); await sync(res.id); }
  };
  return (
    <section className="card">
      <div className="card-title">Dienstkalender</div>
      <div className="sub">Termine aus dem Abo sind nur für dich sichtbar und werden stündlich aktualisiert. Mit „Familie“ zeigst du einzelne Termine auch im Familienkalender.</div>
      {meine.map((x) => (
        <div key={x.id} style={{ borderTop: '1px solid var(--line)', padding: '6px 0' }}>
        <div className="row" style={{ gap: 8 }}>
          <span className="row-main"><span className="row-title" style={x.farbe ? { color: x.farbe } : undefined}>{x.name}</span>{x.last_error && <span className="small" style={{ color: '#B91C1C' }}>Fehler: {x.last_error}</span>}</span>
          <button className="btn small" disabled={busy} onClick={() => sync(x.id)}>{busy ? '…' : 'Abgleichen'}</button>
          <button className="btn ghost small" style={{ color: '#B91C1C' }} onClick={async () => { if (window.confirm(`Abo „${x.name}“ und seine Termine entfernen?`) && await run(supabase.from('calendar_subscriptions').delete().eq('id', x.id), ctx.fail)) { ctx.data.subs.reload(); ctx.data.workEvents.reload(); } }}>Entfernen</button>
        </div>
        <label className="gift-privat" style={{ margin: '2px 0 4px' }}><input type="checkbox" checked={x.art === 'stundenplan'} onChange={async (e) => { const art = e.target.checked ? 'stundenplan' : 'termine'; ctx.data.subs.local((rows) => rows.map((r) => (r.id === x.id ? { ...r, art } : r))); if (!await run(supabase.from('calendar_subscriptions').update({ art }).eq('id', x.id), ctx.fail)) ctx.data.subs.reload(); else ctx.say(art === 'stundenplan' ? 'Erscheint jetzt unter „Stunden“' : 'Erscheint jetzt im Kalender'); }} /> Ist ein Stundenplan (z. B. Untis) – unter „Stunden“ statt im Kalender zeigen</label>
        <FarbWahl value={x.farbe} onPick={async (c) => { ctx.data.subs.local((rows) => rows.map((r) => (r.id === x.id ? { ...r, farbe: c } : r))); if (!await run(supabase.from('calendar_subscriptions').update({ farbe: c }).eq('id', x.id), ctx.fail)) ctx.data.subs.reload(); }} />
        </div>
      ))}
      <form onSubmit={add} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
        <label className="field"><span>Name</span><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={80} /></label>
        <label className="field"><span>Abo-Link (.ics oder webcal://)</span>
          <input className="input" type="url" inputMode="url" autoCapitalize="off" spellCheck={false} value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://… oder webcal://…" />
        </label>
        <button className="btn" disabled={!f.url.trim() || !f.name.trim() || busy}>Abonnieren und abgleichen</button>
      </form>
    </section>
  );
}

