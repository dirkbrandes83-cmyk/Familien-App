// Wochenende: Ideenkiste mit Herzen, Wetter, Vorschläge, „Machen wir!“ und Sterne danach.
// Wird in der Eltern-App (Zuhause → Wochenende) und auf dem Familien-iPad genutzt.
import { useEffect, useRef, useState } from 'react';
import { supabase, run } from '../data.js';
import { Icon } from '../ui.jsx';
import { WD, WDL, shortLabel, weekday } from '../lib/dates.js';
import { wetterInfo, nass, weekendDays, busyOf, rankIdeas, WO, DAUER, KOSTEN } from '../lib/wochenende.js';

// Wetter aus settings lesen; ist es älter als 3 Stunden, einmal neu holen
export function useWetter(ctx) {
  const w = ctx.data.settings.rows.find((r) => r.key === 'wetter')?.value;
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    if (!w?.at || Date.now() - Date.parse(w.at) > 3 * 3600_000 || w.days?.[0]?.tmin === undefined) {
      asked.current = true;
      supabase.functions.invoke('wetter', { body: {} }).then(() => ctx.data.settings.reload?.()).catch(() => {});
    }
  }, [w?.at]);  
  return (date) => w?.days?.find((d) => d.date === date) || null;
}

export async function toggleVote(ctx, idea, member) {
  const has = ctx.data.ideaVotes.rows.some((v) => v.idea_id === idea.id && v.member === member);
  const row = { idea_id: idea.id, member };
  ctx.data.ideaVotes.local((rows) => (has ? rows.filter((v) => !(v.idea_id === idea.id && v.member === member)) : [...rows, row]));
  const ok = has ? await run(supabase.from('idea_votes').delete().match(row), ctx.fail) : await run(supabase.from('idea_votes').insert(row), ctx.fail);
  if (!ok) ctx.data.ideaVotes.reload();
}

const Meta = ({ i }) => (
  <span className="wk-meta">{WO[i.wo][0].map((n) => <Icon key={n} name={n} size={14} />)} {DAUER[i.dauer]} · {KOSTEN[i.kosten]}{i.auto ? <> · <Icon name="car" size={14} /></> : ''}</span>
);

function Hearts({ ctx, idea, me, big }) {
  const voters = ctx.data.ideaVotes.rows.filter((v) => v.idea_id === idea.id).map((v) => ctx.member(v.member)).filter(Boolean);
  const mine = me && voters.some((m) => m.id === me);
  return (
    <span className="wk-hearts">
      {voters.map((m) => <span key={m.id} className="wk-dot" style={{ background: m.color }} title={m.name}>{m.name[0]}</span>)}
      <button className={`wk-heart${mine ? ' on' : ''}${big ? ' big' : ''}`} disabled={!me} aria-pressed={mine}
        aria-label={me ? (mine ? 'Herz zurücknehmen' : 'Herz geben') : 'Erst oben antippen, wer du bist'} onClick={() => me && toggleVote(ctx, idea, me)}>
        <Icon name="heart" size={big ? 24 : 20} fill={mine ? 'currentColor' : 'none'} />
      </button>
    </span>
  );
}

// Karte „Unser Wochenende“: Wetter, wie voll die Tage sind, die drei besten Ideen
export function WochenendKarte({ ctx, onOpen, station }) {
  const wetter = useWetter(ctx);
  const days = weekendDays(ctx.day);
  const regen = days.every((d) => nass(wetter(d)));
  const top = rankIdeas(ctx.data.ideas.rows, ctx.data.ideaVotes.rows, { regen }).slice(0, station ? 2 : 3);
  const plan = ctx.data.weekendLog.rows.filter((l) => days.includes(l.on_date));
  return (
    <section className={station ? 'st-card' : 'card'}>
      <div className={station ? 'st-cardhead' : 'card-head'}>
        {station ? <h2>Unser Wochenende</h2> : <div className="card-title">Unser Wochenende</div>}
        <button className={station ? 'btn ghost' : 'btn ghost small'} style={{ width: 'auto' }} onClick={onOpen}>Ideenkiste</button>
      </div>
      <div className="wk-days">
        {days.map((d) => {
          const w = wetter(d);
          const info = w ? wetterInfo(w.code) : null;
          const busy = busyOf(ctx.data.events.rows, d);
          return (
            <div key={d} className="wk-day">
              <b>{WDL[weekday(d)]}</b>
              <span className="wk-weather">{info ? <><Icon name={info.icon} size={22} /> {w.tmax}°</> : '…'}{w && w.regen >= 30 ? <> · <Icon name="drop" size={16} />{w.regen} %</> : ''}</span>
              <span className="small">{busy.length ? `${busy.length} ${busy.length === 1 ? 'Termin' : 'Termine'}` : 'noch frei'}</span>
            </div>
          );
        })}
      </div>
      {plan.length > 0 && (
        <div className="wk-plan">{plan.map((l) => <div key={l.id}><Icon name="balloon" size={16} /> {WD[weekday(l.on_date)]}: <b>{l.title}</b></div>)}</div>
      )}
      <div className={station ? 'h3like' : 'label'}>{regen ? 'Passend bei Regen' : 'Eure Lieblinge'}</div>
      {top.map((i) => (
        <button key={i.id} className="wk-top" onClick={onOpen}>
          <span className="wk-title">{i.title}</span>
          <span className="wk-sub"><Meta i={i} />{i.herzen ? <span className="wk-hz"> · <Icon name="heart" size={13} fill="currentColor" /> {i.herzen}</span> : ''}</span>
        </button>
      ))}
    </section>
  );
}

// Die Ideenkiste: filtern, Herzen geben, neue Idee, Überrasch uns, Machen wir, Sterne
export default function Ideenkiste({ ctx, station }) {
  const [me, setMe] = useState(station ? null : ctx.me.id);
  const [filter, setFilter] = useState('alle');
  const [add, setAdd] = useState(false);
  const [plan, setPlan] = useState(null); // Idee, die eingeplant wird
  const [los, setLos] = useState(null);
  const wetter = useWetter(ctx);
  const days = weekendDays(ctx.day);
  const regen = days.every((d) => nass(wetter(d)));
  const all = rankIdeas(ctx.data.ideas.rows, ctx.data.ideaVotes.rows);
  const list = all.filter((i) => filter === 'alle' ? true : filter === 'drinnen' ? i.wo !== 'draussen' : filter === 'draussen' ? i.wo !== 'drinnen' : filter === 'kurz' ? i.dauer === 'kurz' : i.kosten === 0);
  const toRate = ctx.data.weekendLog.rows.filter((l) => l.on_date < ctx.day && me && !(l.sterne || {})[me]).slice(0, 3);

  const surprise = () => {
    const pool = all.filter((i) => !regen || i.wo !== 'draussen');
    // Ideen mit Herzen kommen öfter dran
    const bag = pool.flatMap((i) => Array(1 + i.herzen * 2).fill(i));
    setLos(bag[Math.floor(Math.random() * bag.length)] || null);
  };
  const rate = async (l, n) => {
    const sterne = { ...(l.sterne || {}), [me]: n };
    ctx.data.weekendLog.local((rows) => rows.map((x) => (x.id === l.id ? { ...x, sterne } : x)));
    await run(supabase.from('weekend_log').update({ sterne }).eq('id', l.id), ctx.fail);
  };

  const chip = (on, m) => (on ? { background: m?.color || '#1C1917', borderColor: m?.color || '#1C1917', color: '#fff' } : m ? { borderColor: m.bg, color: m.color } : undefined);
  return (
    <div className={`wk${station ? ' wk-station' : ''}`}>
      {station && (
        <div className="field"><span>Wer bist du?</span>
          <div className="chips">{ctx.members.map((m) => <button key={m.id} className="chip st-chip" style={chip(me === m.id, m)} aria-pressed={me === m.id} onClick={() => setMe(m.id)}>{m.name}</button>)}</div>
        </div>
      )}

      {toRate.map((l) => (
        <div key={l.id} className="wk-rate">
          <span>Wie war <b>{l.title}</b> am {shortLabel(l.on_date)}?</span>
          <span className="wk-stars">{[1, 2, 3, 4, 5].map((n) => <button key={n} aria-label={`${n} Sterne`} onClick={() => rate(l, n)}>⭐</button>)}</span>
        </div>
      ))}

      <div className="wk-actions">
        <button className="btn" onClick={surprise}><Icon name="dice" size={20} />Überrasch uns!</button>
        <button className="btn ghost" onClick={() => setAdd(true)}><Icon name="plus" size={18} />Neue Idee</button>
      </div>
      {los && (
        <div className="wk-los">
          <div className="small">Das Los sagt:</div>
          <div className="wk-lostitle">{los.title}</div>
          <Meta i={los} />
          <div className="wk-actions">
            <button className="btn" onClick={() => setPlan(los)}>Machen wir!</button>
            <button className="btn ghost" onClick={surprise}>Nochmal</button>
          </div>
        </div>
      )}

      <div className="chips">
        {[['alle', 'Alle'], ['drinnen', <><Icon name="house" size={15} /> Drinnen</>], ['draussen', <><Icon name="tree" size={15} /> Draußen</>], ['kurz', <><Icon name="clock" size={15} /> Kurz</>], ['gratis', 'Kostenlos']].map(([id, l]) => (
          <button key={id} className={`chip${station ? ' st-chip' : ''}`} style={{ ...chip(filter === id), display: 'inline-flex', alignItems: 'center', gap: 4 }} aria-pressed={filter === id} onClick={() => setFilter(id)}>{l}</button>
        ))}
      </div>
      {!me && station && <div className="st-empty">Tippe oben auf deinen Namen, dann kannst du Herzen verteilen.</div>}

      <div className="wk-list">
        {list.map((i) => (
          <div key={i.id} className="wk-row">
            <div className="wk-main">
              <span className="wk-title">{i.title}</span>
              <span className="wk-sub"><Meta i={i} />{i.note ? ` · ${i.note}` : ''}</span>
            </div>
            <Hearts ctx={ctx} idea={i} me={me} big={station} />
            <button className="btn ghost wk-go" onClick={() => setPlan(i)}>Machen wir!</button>
          </div>
        ))}
      </div>

      {add && <NeueIdee ctx={ctx} me={me} station={station} onClose={() => setAdd(false)} />}
      {plan && <MachenWir ctx={ctx} idea={plan} station={station} days={days} wetter={wetter} onClose={() => { setPlan(null); setLos(null); }} />}
    </div>
  );
}

export function Overlay({ title, onClose, children, station }) {
  return (
    <div className="sheet-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`sheet${station ? ' st-sheet' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head"><h2>{title}</h2><button className={`icon-btn${station ? ' st-icon' : ''}`} onClick={onClose} aria-label="Schließen"><Icon name="x" /></button></div>
        {children}
      </div>
    </div>
  );
}

function NeueIdee({ ctx, me, station, onClose }) {
  const [f, setF] = useState({ title: '', wo: 'draussen', dauer: 'halb', kosten: 0, auto: false });
  const save = async () => {
    if (!f.title.trim()) return;
    const ok = await run(supabase.from('ideas').insert({ ...f, title: f.title.trim(), by_who: me }), ctx.fail);
    if (ok) { ctx.say('Idee ist in der Kiste'); onClose(); }
  };
  const c = station ? 'chip st-chip' : 'chip';
  const on = (x) => (x ? { background: '#1C1917', borderColor: '#1C1917', color: '#fff' } : undefined);
  return (
    <Overlay title="Neue Idee" onClose={onClose} station={station}>
      <label className="field"><span>Was wollen wir machen?</span>
        <input className={`input${station ? ' st-input' : ''}`} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="z. B. Drachen steigen lassen" maxLength={120} autoFocus />
      </label>
      <div className="field"><span>Wo?</span><div className="chips">{Object.entries(WO).map(([k, [ic, l]]) => <button key={k} className={c} style={{ ...on(f.wo === k), display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={() => setF({ ...f, wo: k })}>{ic.map((n) => <Icon key={n} name={n} size={16} />)} {l}</button>)}</div></div>
      <div className="field"><span>Wie lange?</span><div className="chips">{Object.entries(DAUER).map(([k, l]) => <button key={k} className={c} style={on(f.dauer === k)} onClick={() => setF({ ...f, dauer: k })}>{l}</button>)}</div></div>
      <div className="field"><span>Was kostet es?</span><div className="chips">{KOSTEN.map((l, k) => <button key={k} className={c} style={on(f.kosten === k)} onClick={() => setF({ ...f, kosten: k })}>{l}</button>)}</div></div>
      <div className="field"><span>Brauchen wir das Auto?</span><div className="chips">{[[false, 'Nein'], [true, 'Ja']].map(([v, l]) => <button key={l} className={c} style={on(f.auto === v)} onClick={() => setF({ ...f, auto: v })}>{l}</button>)}</div></div>
      <button className={`btn${station ? ' st-big' : ''}`} disabled={!f.title.trim()} onClick={save}>In die Ideenkiste</button>
    </Overlay>
  );
}

// Idee als Termin eintragen und fürs spätere Bewerten merken
export async function einplanen(ctx, idea, day, zeit, station) {
  const ev = await run(supabase.from('events').insert({
    title: `🎈 ${idea.title}`, kind: 'termin', who: ['all'], start_date: day, all_day: !zeit, from_time: zeit || null,
    note: idea.note || '', src: station ? 'station' : 'fam', created_by: station ? null : ctx.me?.id,
  }).select('id').single(), ctx.fail);
  if (!ev) return false;
  await run(supabase.from('weekend_log').insert({ idea_id: idea.id, title: idea.title, on_date: day, event_id: ev.id }), ctx.fail);
  ctx.data.events.reload?.(); ctx.data.weekendLog.reload?.();
  ctx.say(`${idea.title} steht am ${WDL[weekday(day)]} im Kalender`);
  return true;
}

const ZEITEN = [['', 'Ganzer Tag / offen'], ['10:00', 'Vormittag (10 Uhr)'], ['14:00', 'Nachmittag (14 Uhr)'], ['18:00', 'Abend (18 Uhr)']];
function MachenWir({ ctx, idea, station, days, wetter, onClose }) {
  const [day, setDay] = useState(days[0]);
  const [zeit, setZeit] = useState(idea.dauer === 'ganz' ? '' : '14:00');
  const [busy, setBusy] = useState(false);
  const c = station ? 'chip st-chip' : 'chip';
  const on = (x) => (x ? { background: '#0F766E', borderColor: '#0F766E', color: '#fff' } : undefined);
  const save = async () => {
    setBusy(true);
    const ok = await einplanen(ctx, idea, day, zeit, station);
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Overlay title="Machen wir!" onClose={onClose} station={station}>
      <div className="wk-lostitle">{idea.title}</div>
      <div className="field"><span>Wann?</span>
        <div className="chips">{days.map((d) => { const w = wetter(d); return <button key={d} className={c} style={on(day === d)} onClick={() => setDay(d)}>{WDL[weekday(d)]}{w ? <> <Icon name={wetterInfo(w.code).icon} size={16} /> {w.tmax}°</> : ''}</button>; })}</div>
      </div>
      <div className="field"><span>Tageszeit</span>
        <div className="chips">{ZEITEN.map(([z, l]) => <button key={l} className={c} style={on(zeit === z)} onClick={() => setZeit(z)}>{l}</button>)}</div>
      </div>
      {idea.wo === 'draussen' && nass(wetter(day)) && <div className="ci-note"><Icon name="rain" size={18} /> Laut Vorhersage wird es an dem Tag nass.</div>}
      <button className={`btn${station ? ' st-big' : ''}`} disabled={busy} onClick={save}>In den Kalender</button>
    </Overlay>
  );
}
