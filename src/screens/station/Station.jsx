import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, useTable, useHomeTables } from '../../data.js';
import { begruessung } from '../../lib/kinder.js';
import CheckIn from '../CheckIn.jsx';
import Ideenkiste from '../Wochenende.jsx';
import { Icon, Toast } from '../../ui.jsx';
import { longLabel, today, weekday } from '../../lib/dates.js';

import { Konfetti, Nacht, nachts } from './teile.jsx';
import { Alle } from './Alle.jsx';
import { Kind, TierWahl } from './Kind.jsx';
import { Eintragen } from './Eintragen.jsx';

// Familien-Station: gemeinsames iPad. Eigenes Konto mit wenigen Rechten
// (lesen, eintragen, abhaken – nichts löschen, keine Termine ändern).

const IDLE_MS = 120000;

export default function Station({ members, reloadMembers }) {
  const kids = members.filter((m) => m.kid);
  const [view, setView] = useState('alle');
  const [day, setDay] = useState(today());
  const [now, setNow] = useState(new Date());
  const [sheet, setSheet] = useState(null);
  const [checkin, setCheckin] = useState(false);
  const [kiste, setKiste] = useState(false);
  const [tierWahl, setTierWahl] = useState(false);
  const [toast, setToast] = useState(null);
  const [wach, setWach] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [stand, setStand] = useState(new Date());
  const idle = useRef(null);
  const hold = useRef(null);

  const data = {
    events: useTable('events'),
    shop: useTable('shopping_items'),
    freq: useTable('frequent_items'),
    rules: useTable('pack_rules'),
    packItems: useTable('pack_items'),
    checks: useTable('pack_checks'),
    inbox: useTable('todo_inbox'),
    buy: useTable('buy_items'),
    ...useHomeTables(),
  };
  const say = useCallback((text) => setToast({ text, k: Math.random() }), []);
  const fail = useCallback((m) => setToast({ text: `Nicht gespeichert: ${m}` }), []);
  const ctx = { members, kids, data, day, say, fail, reloadMembers, member: (id) => members.find((m) => m.id === id) };

  // Uhr und Datum
  useEffect(() => {
    const t = setInterval(() => { setNow(new Date()); setDay(today()); }, 15000);
    return () => clearInterval(t);
  }, []);

  // Verbindung beobachten; „Stand“ = letzte Zeit mit Verbindung
  useEffect(() => {
    const on = () => { setOnline(true); setStand(new Date()); };
    const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    const t = setInterval(() => { if (navigator.onLine) setStand(new Date()); }, 60000);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); clearInterval(t); };
  }, []);

  // Nachts um 3 Uhr einmal neu laden, damit neue App-Versionen ankommen
  useEffect(() => {
    const t = setInterval(() => {
      const d = new Date();
      const key = `reload-${today()}`;
      if (d.getHours() === 3 && !sessionStorage.getItem(key)) { sessionStorage.setItem(key, '1'); window.location.reload(); }
    }, 5 * 60000);
    return () => clearInterval(t);
  }, []);

  // Bildschirm anlassen (Safari ab iOS 16.4)
  useEffect(() => {
    let lock = null;
    const get = async () => { try { lock = await navigator.wakeLock?.request('screen'); } catch { /* nicht unterstützt */ } };
    get();
    const onVis = () => { if (document.visibilityState === 'visible') get(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); lock?.release?.(); };
  }, []);

  // Nach 2 Minuten ohne Berührung zurück zu „Alle“
  useEffect(() => {
    const reset = () => {
      clearTimeout(idle.current);
      idle.current = setTimeout(() => { setView('alle'); setSheet(null); setKiste(false); setWach(false); }, IDLE_MS);
    };
    reset();
    window.addEventListener('pointerdown', reset);
    return () => { clearTimeout(idle.current); window.removeEventListener('pointerdown', reset); };
  }, []);

  const faces = [{ id: 'alle', name: 'Alle', color: '#0F766E', bg: '#CCFBF1' }, ...kids];
  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  if (nachts(now) && !wach && !checkin) return <Nacht ctx={ctx} clock={clock} onWake={() => setWach(true)} />;

  return (
    <div className="st">
      {!online && <div className="st-offline"><Icon name="x" size={18} />Keine Verbindung – Stand {String(stand.getHours()).padStart(2, '0')}:{String(stand.getMinutes()).padStart(2, '0')} Uhr</div>}
      <header className="st-head">
        <div className="st-clock" onPointerDown={() => { hold.current = setTimeout(() => { if (window.confirm('Station abmelden?')) supabase.auth.signOut(); }, 2500); }}
          onPointerUp={() => clearTimeout(hold.current)} onPointerLeave={() => clearTimeout(hold.current)}>
          <span className="st-time">{clock}</span>
          <span className="st-date">{longLabel(day)}</span>
        </div>
        <nav className="st-faces" aria-label="Ansicht wählen">
          {faces.map((f) => (
            <button key={f.id} className={`st-face${view === f.id ? ' on' : ''}`} aria-pressed={view === f.id}
              style={view === f.id ? { background: f.color, borderColor: f.color, color: '#fff' } : { borderColor: f.bg, color: f.color }}
              onClick={() => setView(f.id)}>
              <span className="st-ini" style={{ background: view === f.id ? 'rgba(255,255,255,0.25)' : f.bg, fontSize: f.tier ? 20 : undefined }} aria-hidden="true">{f.tier || f.name[0]}</span>
              {f.name}
            </button>
          ))}
        </nav>
        {view !== 'alle' && ctx.member(view) && (
          <button className="st-hello" onClick={() => setTierWahl(true)} aria-label="Mein Tier wählen">
            {begruessung(ctx.member(view).name, ctx.member(view).tier)}{!ctx.member(view).tier && <span className="st-hello-hint">Tier?</span>}
          </button>
        )}
        {weekday(day) === 6 && (
          <button className="btn st-add st-ci" onClick={() => setCheckin(true)}>
            <Icon name={ctx.data.checkins.rows.find((r) => r.sonntag === day)?.fertig ? 'check' : 'sun'} size={22} />Check-in
          </button>
        )}
        <button className="btn st-add" onClick={() => setSheet({ by: view !== 'alle' ? view : null })}><Icon name="plus" size={24} />Eintragen</button>
      </header>

      {view === 'alle' ? <Alle ctx={ctx} openIstAlle={() => setSheet({ step: 'shop' })} openKiste={() => setKiste(true)} />
        : <Kind ctx={ctx} kid={ctx.member(view)} />}

      {sheet && <Eintragen ctx={ctx} init={sheet} onClose={() => setSheet(null)} openKiste={() => { setSheet(null); setKiste(true); }} />}
      {kiste && (
        <div className="sheet-bg" onClick={(e) => { if (e.target === e.currentTarget) setKiste(false); }}>
          <div className="sheet st-sheet wk-sheet" role="dialog" aria-modal="true" aria-label="Ideenkiste">
            <div className="sheet-head"><h2><Icon name="balloon" size={26} /> Ideenkiste</h2><button className="icon-btn st-icon" onClick={() => setKiste(false)} aria-label="Schließen"><Icon name="x" /></button></div>
            <Ideenkiste ctx={ctx} station />
          </div>
        </div>
      )}
      {checkin && <CheckIn ctx={ctx} onClose={() => setCheckin(false)} />}
      <Konfetti />
      {tierWahl && view !== 'alle' && <TierWahl ctx={ctx} kid={ctx.member(view)} onClose={() => setTierWahl(false)} />}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
