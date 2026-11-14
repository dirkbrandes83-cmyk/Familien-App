// Familien-Station: gemeinsame Bausteine (Terminliste, Feiern, Abhaken, Tageszeit, Nacht)
import { useEffect, useState } from 'react';
import { supabase, run } from '../../data.js';
import { choresToday, toggleChore } from '../Zuhause.jsx';
import { Icon, PersonChips } from '../../ui.jsx';
import { istSchultag, naechsterSchultag } from '../../lib/stundenplan.js';
import { addDays, expand, hm, WDL, weekday } from '../../lib/dates.js';
import { packList, BringPick } from '../common.jsx';


export function timeOf(ev) {
  if (ev.kind === 'test') return ev.all_day ? <Icon name="pencil" size={20} /> : hm(ev.from_time);
  if (ev.all_day) return ev.kind === 'geburtstag' ? <Icon name="cake" size={20} /> : ev.kind === 'frist' ? 'Frist' : 'ganzt.';
  return hm(ev.from_time);
}

export function EvList({ list: all, ctx, empty = 'Nichts geplant.' }) {
  const list = all.filter((o) => o.ev.kind !== 'test'); // Tests stehen im Stundenplan
  if (!list.length) return <div className="st-empty">{empty}</div>;
  return list.map((o) => (
    <div key={o.ev.id + o.date} className="st-ev">
      <span className="st-evtime">{timeOf(o.ev)}{!o.ev.all_day && o.ev.to_time && <span className="st-evend">bis {hm(o.ev.to_time)}</span>}</span>
      <span className="st-evmain">
        <span className="st-evtitle">{o.ev.kind === 'test' && <span className="test-tag">Test</span>}{o.ev.title}</span>
        <PersonChips who={o.ev.who} members={ctx.members} />
        <BringPick ev={o.ev} big />
      </span>
    </div>
  ));
}

// Kleines Fest, wenn ein Kind das Letzte abhakt
const LOB = ['Stark', 'Super', 'Klasse', 'Spitze', 'Toll gemacht', 'Bravo'];
export function feiern(name) {
  window.dispatchEvent(new CustomEvent('feiern', { detail: `${LOB[Math.floor(Math.random() * LOB.length)]}, ${name}!` }));
}
export function Konfetti() {
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    let t;
    const on = (e) => { setMsg({ text: e.detail, key: Date.now() }); clearTimeout(t); t = setTimeout(() => setMsg(null), 2600); };
    window.addEventListener('feiern', on);
    return () => { window.removeEventListener('feiern', on); clearTimeout(t); };
  }, []);
  if (!msg) return null;
  const colors = ['#F59E0B', '#0F766E', '#E11D48', '#2563EB', '#7C3AED', '#16A34A'];
  return (
    <div className="konfetti" key={msg.key} aria-live="polite">
      {Array.from({ length: 70 }, (_, i) => (
        <span key={i} style={{ left: `${Math.random() * 100}%`, background: colors[i % colors.length], animationDelay: `${Math.random() * 0.4}s`, animationDuration: `${1.6 + Math.random() * 1}s`, transform: `rotate(${Math.random() * 360}deg)` }} />
      ))}
      <div className="konfetti-msg"><Icon name="party" size={38} /> {msg.text}</div>
    </div>
  );
}
export async function toggleChoreFeier(ctx, c) {
  const last = !c.done && choresToday(ctx, ctx.day).filter((x) => x.who === c.who && !x.done).length === 1;
  await toggleChore(ctx, c, ctx.day, c.done);
  if (last && ctx.member(c.who)?.kid) feiern(ctx.member(c.who).name);
}

export async function togglePack(ctx, kid, date, item, last = false) {
  if (last && !item.done) feiern(ctx.member(kid)?.name ?? '');
  const row = { kid, on_date: date, item_key: item.key };
  ctx.data.checks.local((rows) => (item.done ? rows.filter((r) => !(r.kid === kid && r.on_date === date && r.item_key === item.key)) : [...rows, row]));
  const ok = item.done
    ? await run(supabase.from('pack_checks').delete().match(row), ctx.fail)
    : await run(supabase.from('pack_checks').upsert(row), ctx.fail);
  if (!ok) ctx.data.checks.reload();
}

// Nachtmodus 21–7 Uhr und Ruhebildschirm tagsüber: schwarz, nur Uhr und das Wichtigste. Antippen weckt.
export function Nacht({ ctx, clock, onWake }) {
  const h = new Date().getHours();
  const morgen = h >= 21 ? addDays(ctx.day, 1) : ctx.day;
  const ev = expand(ctx.data.events.rows, morgen, morgen).filter((o) => o.ev.kind !== 'frist').slice(0, 4);
  const pack = ctx.kids.reduce((n, k) => n + packList(ctx, k.id, morgen).items.filter((i) => !i.done).length, 0);
  return (
    <button className="st-night" onClick={onWake} aria-label="Bildschirm aufwecken">
      <span className="st-night-time">{clock}</span>
      <span className="st-night-sub">{h >= 21 ? 'Morgen' : 'Heute'} · {WDL[weekday(morgen)]}</span>
      <span className="st-night-list">
        {ev.map((o) => <span key={o.ev.id}>{o.ev.all_day ? '' : `${hm(o.ev.from_time)}  `}{o.ev.title}</span>)}
        {pack > 0 && <span>Noch {pack} {pack === 1 ? 'Sache' : 'Sachen'} einpacken</span>}
      </span>
      <span className="st-night-hint">Antippen zum Aufwecken</span>
    </button>
  );
}

// Schultags bis 15 Uhr: heute mitnehmen, danach und am Wochenende: für den nächsten Schultag packen
export function packDate(ctx) {
  return istSchultag(ctx.day) && new Date().getHours() < 15 ? ctx.day : naechsterSchultag(ctx.day);
}
export const morgens = () => { const h = new Date().getHours(); return h >= 7 && h < 9; };
export const nachts = (d = new Date()) => d.getHours() >= 21 || d.getHours() < 7; // 21–7 Uhr

export function SpeakIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="M16.5 8.5a5 5 0 0 1 0 7" /><path d="M19 6a8.5 8.5 0 0 1 0 12" />
    </svg>
  );
}
