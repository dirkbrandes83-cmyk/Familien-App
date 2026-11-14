// Wochenplan: freie Tage in vier Abschnitten (Morgens, Vormittag, Nachmittag, Abend).
// Eltern legen Bausteine hinein (Marktbesuch, Auszeit für …), freie Abschnitte füllt man mit einer Idee.
// Auf dem iPad sehen die Kinder, was jetzt dran ist und was danach kommt.
import { useState } from 'react';
import { supabase, run } from '../data.js';
import { Icon, Check } from '../ui.jsx';
import { aufgaben, offen } from '../lib/aufgaben.js';
import { WDL, weekday, shortLabel } from '../lib/dates.js';
import { ABSCHNITTE, BAUSTEINE, bausteinIcon, tagesplan, aktuellerAbschnitt } from '../lib/wochenplan.js';
import { wetterInfo, nass, rankIdeas } from '../lib/wochenende.js';
import { useWetter, Overlay, einplanen } from './Wochenende.jsx';
import { mealOf } from './Zuhause.jsx';

const ICON = { termin: 'cal', aemtchen: 'todo', essen: 'clock' };

export function rahmenOf(ctx) {
  return ctx.data.settings.rows.find((r) => r.key === 'we_rahmen')?.value || [];
}

// Wer ist dabei? „Alle“ oder farbige Kreise mit Anfangsbuchstaben
export function Dabei({ ctx, ids, big, onEdit }) {
  const inner = !ids?.length
    ? (onEdit ? <span className="wp-alle leer">wer?</span> : null)
    : ids.includes('all') ? <span className="wp-alle">Alle</span>
      : <span className="wp-dabei">{ids.map((id) => ctx.member(id)).filter(Boolean).map((m) => (
        <span key={m.id} className={`wp-dot${big ? ' big' : ''}`} style={{ background: m.bg, color: m.color }} title={m.name}>{big ? m.name : m.name[0]}</span>
      ))}</span>;
  if (!inner) return null;
  return onEdit ? <button className="wp-dabeibtn" onClick={onEdit} aria-label="Wer ist dabei? ändern">{inner}</button> : inner;
}

// Wer ist dabei? – Auswahl „Alle“ oder einzelne Personen
export function DabeiWahl({ ctx, value, onChange }) {
  const toggle = (id) => {
    if (id === 'all') return onChange(['all']);
    const x = value.filter((v) => v !== 'all');
    const n = x.includes(id) ? x.filter((v) => v !== id) : [...x, id];
    return onChange(n.length === 0 || n.length === ctx.members.length ? ['all'] : n);
  };
  return (
    <div className="field"><span>Wer ist dabei?</span>
      <div className="chips">
        <button className="chip" aria-pressed={value.includes('all')} style={value.includes('all') ? { background: '#1C1917', borderColor: '#1C1917', color: '#fff' } : undefined} onClick={() => toggle('all')}>Alle</button>
        {ctx.members.map((m) => { const an = value.includes(m.id); return <button key={m.id} className="chip" aria-pressed={an} style={an ? { background: m.color, borderColor: m.color, color: '#fff' } : { borderColor: m.bg, color: m.color }} onClick={() => toggle(m.id)}>{m.name}</button>; })}
      </div>
    </div>
  );
}

// Darf „wer ist dabei“ hier geändert werden? (Abo-Termine kommen aus Klender und würden überschrieben)
const dabeiAenderbar = (i) => !!(i.row || i.rahmen || (i.ev && i.ev.src !== 'abo'));

// kompakt: nur heute, ohne Vergangenes · ohneListen: ohne Ämtchen und Essen (stehen daneben) · nebeneinander: Tage in Spalten
export default function Wochenplan({ ctx, days, station, onKiste, kompakt, ohneListen, nebeneinander }) {
  const [tag, setTag] = useState(days[0]);
  const [add, setAdd] = useState(null);   // { date, slot }
  const [idee, setIdee] = useState(null); // { date, slot }
  const [move, setMove] = useState(null); // { item, date, slot }
  const wetter = useWetter(ctx);
  const edit = !station;
  const zeigen = station && !nebeneinander ? [days.includes(tag) ? tag : days[0]] : days;
  const jetzt = aktuellerAbschnitt(new Date().getHours());
  const todos = new Map(aufgaben(ctx).filter((a) => a.art === 'erledigen' || a.art === 'besorgen').map((a) => [a.key, a]));

  return (
    <section className={`${station ? 'st-card' : 'card'} wp`}>
      <div className={station ? 'st-cardhead' : 'card-head'}>
        {station ? <h2>Unser Wochenende</h2> : <div className="card-title">So sieht unser Wochenende aus</div>}
        {onKiste && <button className={station ? 'btn ghost' : 'btn ghost small'} style={{ width: 'auto' }} onClick={onKiste}>Ideenkiste</button>}
      </div>
      {station && !kompakt && !nebeneinander && days.length > 1 && (
        <div className="seg st-seg">{days.map((d) => (
          <button key={d} className={d === zeigen[0] ? 'on' : ''} onClick={() => setTag(d)}>{d === ctx.day ? 'Heute' : WDL[weekday(d)]}</button>
        ))}</div>
      )}
      {edit && <div className="small">„+“ legt Bausteine, To-dos oder Ideen in einen Abschnitt. Unterstrichenes oder die Namen antippen, um zu verschieben oder zu ändern, wer dabei ist.</div>}
      <div className={station && !nebeneinander ? '' : 'wp-days'}>
        {zeigen.map((d) => {
          const p = tagesplan({
            date: d, events: ctx.data.events.rows, plan: ctx.data.wePlan.rows, rahmen: rahmenOf(ctx),
            chores: ctx.data.chores.rows, meal: mealOf(ctx, d).title, members: ctx.members, todos,
          });
          const w = wetter(d);
          return (
            <div key={d} className="wp-day">
              {(!station || nebeneinander) && <div className="wp-dayhead"><b>{d === ctx.day ? `Heute · ${WDL[weekday(d)]}` : WDL[weekday(d)]}</b>{w && <span className="small"><Icon name={wetterInfo(w.code).icon} size={18} /> {w.tmax}°</span>}</div>}
              {p.geburtstage.map((g) => <div key={g} className="wp-bday"><Icon name="cake" size={18} /> {g}</div>)}
              {p.ganztags.map((i) => <div key={i.ev.id} className="wp-allday"><Icon name="cal" size={16} /> {i.text} <Dabei ctx={ctx} ids={i.dabei} big={station} /></div>)}
              {ABSCHNITTE.map((a) => {
                const now = d === ctx.day && a.id === jetzt;
                const vorbei = d === ctx.day && ABSCHNITTE.findIndex((x) => x.id === a.id) < ABSCHNITTE.findIndex((x) => x.id === jetzt);
                const items = kompakt || ohneListen ? p.slots[a.id].filter((i) => i.art !== 'aemtchen' && i.art !== 'essen') : p.slots[a.id];
                if (kompakt && vorbei) return null;
                return (
                  <div key={a.id} className={`wp-slot${now ? ' now' : ''}${vorbei ? ' past' : ''}`}>
                    <div className="wp-label"><b>{a.label}</b><span>{now ? 'jetzt' : a.zeit}</span></div>
                    <div className="wp-items">
                      {items.map((i, n) => (
                        i.art === 'todo' ? (
                          <div key={n} className={`wp-item todo${i.done ? ' done' : ''}`}>
                            {edit
                              ? <button className="wp-check" aria-pressed={i.done} aria-label={i.done ? 'Wieder offen' : 'Erledigt'} onClick={() => (i.done ? i.aufgabe.zurueck() : i.aufgabe.erledigen())}><Check on={i.done} /></button>
                              : <Icon name={i.aufgabe.art === 'besorgen' ? 'bag' : 'todo'} size={18} />}
                            {edit ? <button className="wp-txt" onClick={() => setMove({ item: i, date: d, slot: a.id })}>{i.text}</button> : <span>{i.text}</span>}
                            <Dabei ctx={ctx} ids={i.dabei} big={station} onEdit={edit ? () => setMove({ item: i, date: d, slot: a.id }) : null} />
                            {edit && <button className="wp-x" aria-label={`${i.text} aus dem Plan nehmen`} onClick={() => entfernen(ctx, i.row, i.text)}><Icon name="x" size={14} /></button>}
                          </div>
                        ) : (
                        <div key={n} className={`wp-item ${i.art}${i.idee ? ' idee' : ''}`}>
                          <Icon name={i.idee ? 'balloon' : i.art === 'baustein' ? bausteinIcon(i.text) : ICON[i.art]} size={station ? 18 : 16} />
                          {edit && (i.row || i.rahmen || (i.ev && i.ev.src !== 'abo'))
                            ? <button className="wp-txt" onClick={() => setMove({ item: i, date: d, slot: a.id })}>{i.time ? <b>{i.time} </b> : null}{i.text}</button>
                            : <span>{i.time ? <b>{i.time} </b> : null}{i.art === 'essen' ? `Abendessen: ${i.text}` : i.text}{i.art === 'aemtchen' && ctx.member(i.who) ? <span className="wp-who"> · {ctx.member(i.who).name}</span> : null}</span>}
                          {i.art !== 'aemtchen' && <Dabei ctx={ctx} ids={i.dabei} big={station} onEdit={edit && dabeiAenderbar(i) ? () => setMove({ item: i, date: d, slot: a.id }) : null} />}
                          {edit && i.row && <button className="wp-x" aria-label={`${i.text} entfernen`} onClick={() => entfernen(ctx, i.row)}><Icon name="x" size={14} /></button>}
                          {edit && i.rahmen && <button className="wp-x" aria-label={`${i.text} nicht mehr jede Woche`} title="jede Woche – entfernen" onClick={() => rahmenWeg(ctx, i.rahmen)}><Icon name="repeat" size={14} /><Icon name="x" size={14} /></button>}
                        </div>
                        )
                      ))}
                      {/* ein Knopf pro Abschnitt: Eltern planen alles (Baustein, To-do, Idee), Kinder wählen eine Idee */}
                      {edit
                        ? <button className={p.frei.includes(a.id) && !vorbei ? 'wp-frei' : 'wp-add'} onClick={() => setAdd({ date: d, slot: a.id })} aria-label={`${a.label} planen`}><Icon name="plus" size={14} /> {p.frei.includes(a.id) && !vorbei ? 'frei – planen' : 'Hinzufügen'}</button>
                        : p.frei.includes(a.id) && !vorbei && <button className="wp-frei" onClick={() => setIdee({ date: d, slot: a.id })}><Icon name="dice" size={16} /> frei – Idee wählen</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      {move && <Verschieben ctx={ctx} days={days} {...move} onClose={() => setMove(null)} />}
      {add && <BausteinSheet ctx={ctx} {...add} onClose={() => setAdd(null)} />}
      {idee && <IdeeWaehlen ctx={ctx} station={station} {...idee} regen={nass(wetter(idee.date))} onClose={() => setIdee(null)} />}
    </section>
  );
}

async function entfernen(ctx, row, text = row.text) {
  ctx.data.wePlan.local((rows) => rows.filter((x) => x.id !== row.id));
  const ok = await run(supabase.from('we_plan').delete().eq('id', row.id), ctx.fail);
  if (ok) ctx.say(`${text} entfernt`, () => run(supabase.from('we_plan').insert(row), ctx.fail).then(() => ctx.data.wePlan.reload()));
  else ctx.data.wePlan.reload();
}

// Baustein, To-do, feste Bausteine und eingeplante Ideen in einen anderen Abschnitt oder Tag schieben
function Verschieben({ ctx, days, item, date, slot, onClose }) {
  const [d, setD] = useState(date);
  const [sl, setSl] = useState(slot);
  const start = item.dabei?.length ? item.dabei : ['all'];
  const [dabei, setDabei] = useState(start);
  const dabeiNeu = [...dabei].sort().join() !== [...start].sort().join();
  const ort = d !== date || sl !== slot;
  const zeitFest = item.art === 'termin' && !item.idee; // normale Termine behalten ihre Uhrzeit
  const fest = !!item.rahmen;
  const ziele = fest ? days.filter((x) => weekday(x) >= 5) : days;
  const save = async () => {
    const a = ABSCHNITTE.find((x) => x.id === sl);
    let ok = true;
    if (item.row) {
      const upd = { on_date: d, slot: sl, dabei };
      ctx.data.wePlan.local((rows) => rows.map((x) => (x.id === item.row.id ? { ...x, ...upd } : x)));
      ok = await run(supabase.from('we_plan').update(upd).eq('id', item.row.id), ctx.fail);
      if (!ok) ctx.data.wePlan.reload();
    } else if (fest) {
      ok = await rahmenSetzen(ctx, rahmenOf(ctx).map((x) => (x === item.rahmen ? { ...x, tag: weekday(d), slot: sl, dabei } : x)));
    } else if (item.ev) {
      // eingeplante Idee: Termin verlegen (Uhrzeit = Beginn des Abschnitts); bei allen Terminen: wer ist dabei
      const upd = { who: dabei };
      if (ort && !zeitFest) Object.assign(upd, { start_date: d, from_time: a.start || (sl === 'morgens' ? '09:00' : '18:00'), all_day: false });
      ctx.data.events.local?.((rows) => rows.map((x) => (x.id === item.ev.id ? { ...x, ...upd } : x)));
      ok = await run(supabase.from('events').update(upd).eq('id', item.ev.id), ctx.fail);
      ctx.data.events.reload?.();
    }
    if (ok) { ctx.say(ort ? `${item.text} → ${WDL[weekday(d)]} ${a.label}` : `${item.text}: gespeichert`); onClose(); }
  };
  const on = (x) => (x ? { background: '#0F766E', borderColor: '#0F766E', color: '#fff' } : undefined);
  return (
    <Overlay title={`„${item.text}“`} onClose={onClose}>
      <DabeiWahl ctx={ctx} value={dabei} onChange={setDabei} />
      {!zeitFest && ziele.length > 1 && <div className="field"><span>Tag</span><div className="chips">{ziele.map((x) => <button key={x} className="chip" style={on(d === x)} onClick={() => setD(x)}>{WDL[weekday(x)]}</button>)}</div></div>}
      {!zeitFest && <div className="field"><span>Abschnitt</span><div className="chips">{ABSCHNITTE.map((x) => <button key={x.id} className="chip" style={on(sl === x.id)} onClick={() => setSl(x.id)}>{x.label}</button>)}</div></div>}
      {fest && <div className="small" style={{ marginBottom: 10 }}>Das ist ein fester Baustein – Änderungen gelten für jedes Wochenende.</div>}
      {zeitFest && <div className="small" style={{ marginBottom: 10 }}>Uhrzeit und Tag änderst du im Kalender.</div>}
      <button className="btn" disabled={!ort && !dabeiNeu} onClick={save}>Speichern</button>
    </Overlay>
  );
}

async function rahmenSetzen(ctx, rahmen) {
  ctx.data.settings.local((rows) => rows.map((r) => (r.key === 'we_rahmen' ? { ...r, value: rahmen } : r)));
  const ok = await run(supabase.from('settings').upsert({ key: 'we_rahmen', value: rahmen }), ctx.fail);
  if (!ok) ctx.data.settings.reload();
  return ok;
}
async function rahmenWeg(ctx, r) {
  const alt = rahmenOf(ctx);
  if (await rahmenSetzen(ctx, alt.filter((x) => x !== r))) ctx.say(`${r.text} steht nicht mehr jede Woche drin`, () => rahmenSetzen(ctx, alt));
}

// Baustein in einen Abschnitt legen – nur an diesem Tag oder jedes Wochenende
function BausteinSheet({ ctx, date, slot, onClose }) {
  const [b, setB] = useState(null);
  const [text, setText] = useState('');
  const [who, setWho] = useState(null);
  const [immer, setImmer] = useState(false);
  const [dabei, setDabei] = useState(['all']);
  const label = ABSCHNITTE.find((a) => a.id === slot).label;
  const wd = weekday(date);
  const geplant = new Set(ctx.data.wePlan.rows.map((r) => r.todo_ref).filter(Boolean));
  const todos = offen(aufgaben(ctx)).filter((a) => (a.art === 'erledigen' || a.art === 'besorgen') && !geplant.has(a.key))
    .sort((a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999')));
  const regen = nass(useWetter(ctx)(date));
  const ideen = ['vormittag', 'nachmittag'].includes(slot) ? rankIdeas(ctx.data.ideas.rows, ctx.data.ideaVotes.rows, { regen }).filter((i) => !regen || i.wo !== 'draussen').slice(0, 5) : [];
  const ideeRein = async (i) => { if (await einplanen(ctx, i, date, ABSCHNITTE.find((x) => x.id === slot).start, false)) onClose(); };
  const schieben = async (a) => {
    const ok = await run(supabase.from('we_plan').insert({ on_date: date, slot, text: a.text.slice(0, 120), todo_ref: a.key, dabei: a.owner ? [a.owner] : ['all'], created_by: ctx.me.id }), ctx.fail);
    if (ok) { ctx.data.wePlan.reload(); ctx.say(`${a.text} liegt jetzt am ${WDL[wd]} ${label}`); onClose(); }
  };
  const t = (b ? b.text : text).trim();
  const ok = t && (!b?.person || who);
  const save = async () => {
    if (immer && wd >= 5) {
      await rahmenSetzen(ctx, [...rahmenOf(ctx), { tag: wd, slot, text: t, who, dabei }]);
    } else {
      const done = await run(supabase.from('we_plan').insert({ on_date: date, slot, text: t, who, dabei, created_by: ctx.me.id }), ctx.fail);
      if (done) ctx.data.wePlan.reload();
    }
    onClose();
  };
  const on = (x) => (x ? { background: '#1C1917', borderColor: '#1C1917', color: '#fff' } : undefined);
  return (
    <Overlay title={`${WDL[wd]} · ${label}`} onClose={onClose}>
      <div className="field"><span>Was ist dran?</span>
        <div className="chips">{BAUSTEINE.map((x) => (
          <button key={x.text} className="chip" style={{ ...on(b === x), display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={() => { setB(x); setText(''); }}>
            <Icon name={x.icon} size={15} /> {x.person ? 'Auszeit für …' : x.text}
          </button>
        ))}</div>
      </div>
      {b?.person && (
        <div className="field"><span>Für wen?</span>
          <div className="chips">{ctx.members.filter((m) => !m.kid).map((m) => <button key={m.id} className="chip" style={who === m.id ? { background: m.color, borderColor: m.color, color: '#fff' } : { borderColor: m.bg, color: m.color }} onClick={() => { setWho(m.id); setDabei([m.id]); }}>{m.name}</button>)}</div>
        </div>
      )}
      {ideen.length > 0 && (
        <div className="field"><span>Oder eine Idee aus der Kiste{regen ? ' (bei Regen: drinnen)' : ''}</span>
          <div className="wp-todos">{ideen.map((i) => (
            <button key={i.id} className="wp-todo" onClick={() => ideeRein(i)}>
              <Icon name="balloon" size={16} /><span>{i.title}</span>
              {i.herzen ? <span className="small"><Icon name="heart" size={12} fill="currentColor" /> {i.herzen}</span> : null}
            </button>
          ))}</div>
        </div>
      )}
      {todos.length > 0 && (
        <div className="field"><span>Oder ein To-do hineinschieben</span>
          <div className="wp-todos">{todos.map((a) => (
            <button key={a.key} className="wp-todo" onClick={() => schieben(a)}>
              <Icon name={a.art === 'besorgen' ? 'bag' : 'todo'} size={16} />
              <span>{a.text}</span>
              {a.due && <span className="small">bis {shortLabel(a.due)}</span>}
            </button>
          ))}</div>
        </div>
      )}
      <label className="field"><span>Oder eigener Text</span>
        <input className="input" value={text} onChange={(e) => { setText(e.target.value); setB(null); setWho(null); }} placeholder="z. B. Oma besuchen" maxLength={80} />
      </label>
      <DabeiWahl ctx={ctx} value={dabei} onChange={setDabei} />
      {wd >= 5 && (
        <label className="wp-immer"><input type="checkbox" checked={immer} onChange={(e) => setImmer(e.target.checked)} /> Jeden {WDL[wd]} so</label>
      )}
      <button className="btn" disabled={!ok} onClick={save}>Eintragen</button>
    </Overlay>
  );
}

// Freier Abschnitt: Idee aus der Kiste wählen (Lieblinge zuerst, bei Regen nichts für draußen)
function IdeeWaehlen({ ctx, station, date, slot, regen, onClose }) {
  const [busy, setBusy] = useState(false);
  const list = rankIdeas(ctx.data.ideas.rows, ctx.data.ideaVotes.rows, { regen }).filter((i) => !regen || i.wo !== 'draussen').slice(0, 8);
  const a = ABSCHNITTE.find((x) => x.id === slot);
  const pick = async (i) => {
    setBusy(true);
    const ok = await einplanen(ctx, i, date, a.start, station);
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Overlay title={`${WDL[weekday(date)]} ${a.label}: Was machen wir?`} onClose={onClose} station={station}>
      {regen && <div className="ci-note"><Icon name="rain" size={18} /> Es soll nass werden – hier nur Ideen für drinnen.</div>}
      {list.length === 0 && <div className="empty">Die Ideenkiste ist noch leer.</div>}
      <div className="wk-list">
        {list.map((i) => (
          <button key={i.id} className={`wk-top${station ? ' st-big' : ''}`} disabled={busy} onClick={() => pick(i)}>
            <span className="wk-title">{i.title}</span>
            {i.herzen ? <span className="wk-sub"><Icon name="heart" size={13} fill="currentColor" /> {i.herzen}</span> : null}
          </button>
        ))}
      </div>
    </Overlay>
  );
}
