import { useState } from 'react';
import { supabase, run } from '../data.js';
import { Icon, Sheet, Seg, ChipPick } from '../ui.jsx';
import { hm, longLabel, weekday } from '../lib/dates.js';

const KIDS = { beide: 'Jonte und Emil', jonte: 'Jonte', emil: 'Emil' };
const PICKUPS = ['', 'Abholen', 'Bringen', 'Abholen & Bringen'];
const NEXT = { undefined: 'angefragt', angefragt: 'zugesagt', zugesagt: 'abgesagt', abgesagt: undefined };

export function careStatus(asks) {
  if (asks.some((a) => a.status === 'zugesagt')) return 'gesichert';
  if (asks.some((a) => a.status === 'angefragt')) return 'angefragt';
  return 'offen';
}

// Braucht ein Termin vermutlich Kinderbetreuung? (abends, Wochenende, beide Eltern)
export function careReason(ev, date) {
  const r = [];
  if (!ev.all_day && ev.from_time && ev.from_time >= '18:00') r.push('abends');
  if (weekday(date || ev.start_date) >= 5) r.push('am Wochenende');
  const w = ev.who || [];
  if (w.includes('all') || (w.includes('dirk') && w.includes('catrin'))) r.push('betrifft beide Eltern');
  return r.join(', ');
}

export async function careFromEvent(ctx, ev) {
  return run(supabase.from('care_needs').insert({
    on_date: ev.start_date, from_time: ev.all_day ? null : ev.from_time, to_time: ev.all_day ? null : ev.to_time,
    kids: 'beide', reason: ev.title.slice(0, 120), event_id: ev.id, created_by: ctx.me.id,
  }), ctx.fail);
}

export default function Betreuung({ ctx }) {
  const [sheet, setSheet] = useState(false);
  const [sitters, setSitters] = useState(false);
  const needs = ctx.data.care.rows.filter((c) => c.on_date >= ctx.day).sort((a, b) => a.on_date.localeCompare(b.on_date) || String(a.from_time).localeCompare(String(b.from_time)));
  const givers = [...ctx.data.caregivers.rows].sort((a, b) => a.sort - b.sort);

  const setAsk = async (need, giver, cur) => {
    const next = NEXT[cur?.status];
    const key = { need_id: need.id, caregiver_id: giver.id };
    const ok = next
      ? await run(supabase.from('care_asks').upsert({ ...key, status: next, asked_at: new Date().toISOString() }), ctx.fail)
      : await run(supabase.from('care_asks').delete().match(key), ctx.fail);
    if (ok && next === 'zugesagt') ctx.say(`${giver.name} hat zugesagt`);
  };
  const del = async (need) => {
    const ok = await run(supabase.from('care_needs').delete().eq('id', need.id), ctx.fail);
    if (ok) ctx.say('Betreuung gelöscht');
  };

  return (
    <>
      <button className="btn" onClick={() => setSheet(true)}><Icon name="plus" size={18} />Betreuung gebraucht</button>
      {needs.length === 0 && <div className="card empty">Keine Betreuung geplant.</div>}
      {needs.map((n) => {
        const asks = ctx.data.asks.rows.filter((a) => a.need_id === n.id);
        const st = careStatus(asks);
        return (
          <section key={n.id} className="card">
            <div className="card-head">
              <span className="row-main">
                <span style={{ fontWeight: 700 }}>{longLabel(n.on_date)}{n.from_time ? ` · ${hm(n.from_time)}${n.to_time ? `–${hm(n.to_time)}` : ''}` : ''}</span>
                <span className="small">{KIDS[n.kids]}{n.reason ? ` · ${n.reason}` : ''}{n.pickup ? ` · ${n.pickup}` : ''}</span>
              </span>
              <span className="tag" style={st === 'offen' ? { background: '#fff', color: '#B45309', border: '1px solid #B45309' } : st === 'gesichert' ? { background: '#CCFBF1', color: '#115E59' } : undefined}>{st}</span>
            </div>
            <div className="small">Antippen: angefragt → zugesagt → abgesagt</div>
            <div className="chips">
              {givers.map((g) => {
                const a = asks.find((x) => x.caregiver_id === g.id);
                const style = a?.status === 'zugesagt' ? { background: '#0F766E', borderColor: '#0F766E', color: '#fff' }
                  : a?.status === 'angefragt' ? { borderColor: '#B45309', color: '#B45309', borderStyle: 'dashed' }
                  : a?.status === 'abgesagt' ? { color: '#78716C', textDecoration: 'line-through' } : {};
                return <button key={g.id} className="chip" style={style} onClick={() => setAsk(n, g, a)} aria-label={`${g.name}: ${a?.status ?? 'nicht gefragt'}`}>{g.name}{a?.status === 'angefragt' ? ' ?' : ''}</button>;
              })}
            </div>
            <button className="btn ghost small" style={{ alignSelf: 'flex-start', color: '#B91C1C' }} onClick={() => del(n)}>Löschen</button>
          </section>
        );
      })}
      <button className="btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={() => setSitters(true)}>Wer kann betreuen? ({givers.length})</button>
      {sheet && <NeedSheet ctx={ctx} onClose={() => setSheet(false)} />}
      {sitters && <SitterSheet ctx={ctx} givers={givers} onClose={() => setSitters(false)} />}
    </>
  );
}

function NeedSheet({ ctx, onClose }) {
  const [f, setF] = useState({ on_date: ctx.day, from_time: '', to_time: '', kids: 'beide', reason: '', pickup: '' });
  const save = async () => {
    const ok = await run(supabase.from('care_needs').insert({ ...f, from_time: f.from_time || null, to_time: f.to_time || null, reason: f.reason.trim(), created_by: ctx.me.id }), ctx.fail);
    if (ok) { ctx.say('Betreuung eingetragen'); onClose(); }
  };
  return (
    <Sheet title="Betreuung gebraucht" onClose={onClose} actions={<button className="btn" onClick={save}>Eintragen</button>}>
      <label className="field"><span>Wann?</span><input className="input" type="date" value={f.on_date} min={ctx.day} onChange={(e) => setF({ ...f, on_date: e.target.value })} /></label>
      <div className="two">
        <label className="field"><span>Von</span><input className="input" type="time" value={f.from_time} onChange={(e) => setF({ ...f, from_time: e.target.value })} /></label>
        <label className="field"><span>Bis</span><input className="input" type="time" value={f.to_time} onChange={(e) => setF({ ...f, to_time: e.target.value })} /></label>
      </div>
      <div className="field"><span>Für wen?</span><Seg label="Kinder" value={f.kids} onPick={(k) => setF({ ...f, kids: k })} options={[['beide', 'Beide'], ['jonte', 'Jonte'], ['emil', 'Emil']]} /></div>
      <label className="field"><span>Warum?</span><input className="input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="z. B. Elternabend" maxLength={120} /></label>
      <div className="field"><span>Abholen oder bringen?</span>
        <ChipPick options={PICKUPS.map((p) => ({ id: p, label: p || 'nein' }))} value={f.pickup} onPick={(p) => setF({ ...f, pickup: p })} />
      </div>
    </Sheet>
  );
}

function SitterSheet({ ctx, givers, onClose }) {
  const [name, setName] = useState('');
  const add = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    const ok = await run(supabase.from('caregivers').insert({ name: name.trim(), sort: givers.length + 1 }), ctx.fail);
    if (ok) setName('');
  };
  return (
    <Sheet title="Wer kann betreuen?" onClose={onClose}>
      <div className="card tight">
        {givers.map((g) => (
          <div key={g.id} className="row">
            <span className="row-main">{g.name}</span>
            <button className="icon-btn" style={{ border: 'none' }} aria-label={`${g.name} entfernen`} onClick={() => run(supabase.from('caregivers').delete().eq('id', g.id), ctx.fail)}><Icon name="trash" size={18} /></button>
          </div>
        ))}
      </div>
      <form className="add-row" onSubmit={add}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Neue Person" />
        <button className="btn" aria-label="Hinzufügen"><Icon name="plus" /></button>
      </form>
    </Sheet>
  );
}

// „Neue Termine prüfen“ – neue Termine aus Abos, mit Frage nach Betreuung
export function ReviewBox({ ctx }) {
  const [open, setOpen] = useState(false);
  const list = ctx.data.events.rows.filter((e) => e.review).sort((a, b) => a.start_date.localeCompare(b.start_date));
  if (!list.length) return null;
  const seen = (ev) => run(supabase.from('events').update({ review: false }).eq('id', ev.id), ctx.fail);
  const yes = async (ev) => {
    const ok = await careFromEvent(ctx, ev);
    if (ok) { await seen(ev); ctx.say('Betreuung angelegt – unter „Betreuung“ anfragen'); }
  };
  const sub = (ev) => ctx.data.subs.rows.find((s) => s.id === ev.sub_id)?.name ?? 'Abo';
  return (
    <section className="card" style={{ padding: '4px 14px' }}>
      <button className="row" style={{ borderTop: 'none' }} onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="row-main"><span style={{ fontWeight: 600 }}>Neue Termine prüfen <span style={{ color: '#B45309' }}>({list.length})</span></span></span>
        <Icon name="down" size={18} style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && list.map((ev) => {
        const why = careReason(ev, ev.start_date);
        return (
          <div key={ev.id} style={{ borderTop: '1px solid #F0EBE3', padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="row-main">
              <span style={{ fontWeight: 600 }}>{ev.title}</span>
              <span className="small">{longLabel(ev.start_date)}{ev.from_time ? ` · ${hm(ev.from_time)}` : ''} · {sub(ev)}</span>
            </span>
            {why ? (
              <>
                <span className="small" style={{ fontWeight: 700, color: '#B45309' }}>Kinderbetreuung nötig? <span style={{ fontWeight: 500, color: '#57534E' }}>({why})</span></span>
                <div className="two" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                  <button className="btn small" onClick={() => yes(ev)}>Ja</button>
                  <button className="btn ghost small" onClick={() => seen(ev)}>Nein</button>
                  <button className="btn ghost small" onClick={() => setOpen(false)}>Später</button>
                </div>
              </>
            ) : <button className="btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={() => seen(ev)}>Gesehen</button>}
          </div>
        );
      })}
    </section>
  );
}
