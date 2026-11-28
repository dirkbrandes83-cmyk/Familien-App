import { DauerkartenGast } from './screens/Dauerkarten.jsx';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, useTable, useHomeTables } from './data.js';
import { Icon, Toast } from './ui.jsx';
import { longLabel, today, addDays } from './lib/dates.js';
import Login, { NewPassword } from './screens/Login.jsx';
import Heute from './screens/Heute.jsx';
import Kalender from './screens/Kalender.jsx';
import Listen from './screens/Erinnerungen.jsx';
import Planen from './screens/Planen.jsx';
import { StundenplanSeite, OrgaSeite } from './screens/ArbeitOrga.jsx';
import { ArbeitHeuteSeite, ArbeitKalenderSeite, ArbeitTodosSeite, TerminSheet, TodoSheet } from './screens/Arbeit.jsx';
import Mehr from './screens/Mehr.jsx';
import EventSheet from './screens/EventSheet.jsx';
import Station from './screens/station/Station.jsx';
import Zuhause from './screens/Zuhause.jsx';
import Scan from './screens/Scan.jsx';

const TABS = [
  ['heute', 'Heute', 'home'],
  ['kalender', 'Kalender', 'cal'],
  ['listen', 'Listen', 'todo'],
  ['planen', 'Planen', 'balloon'],
  ['zuhause', 'Zuhause', 'house'],
];
const ARBEIT_TABS = [
  ['a-heute', 'Heute', 'home'],
  ['a-kalender', 'Kalender', 'cal'],
  ['a-todos', 'To-dos', 'todo'],
  ['a-stunden', 'Stunden', 'clock'],
  ['a-orga', 'Orga', 'briefcase'],
];
const TAB_IDS = [...TABS, ...ARBEIT_TABS].map((t) => t[0]);
// Alte Ziele (vor dem Umbau) auf die neue Struktur abbilden
const ALT = {
  einkauf: ['listen', 'einkauf'], erinn: ['listen'],
  'zuhause:wochenende': ['planen', 'wochenende'], 'zuhause:essen': ['planen', 'essen'], 'erinn:geschenke': ['planen', 'geschenke'],
};
const merk = (key, def) => { try { return localStorage.getItem(key) || def; } catch { return def; } };

const DK_TOKEN = new URLSearchParams(location.search).get('dk');

export default function App() {
  if (DK_TOKEN) return <DauerkartenGast token={DK_TOKEN} />;
  return <AppMitLogin />;
}

function AppMitLogin() {
  const [session, setSession] = useState(undefined);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((ev, s) => {
      if (ev === 'PASSWORD_RECOVERY') setRecovery(true);
      setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return null;
  if (recovery && session) return <NewPassword onDone={() => setRecovery(false)} />;
  if (!session) return <Login />;
  return <Family session={session} />;
}

function Family({ session }) {
  const members = useTable('members');
  const email = session.user.email?.toLowerCase();
  const me = members.rows.find((m) => m.email?.toLowerCase() === email);
  const [station, setStation] = useState(null);
  useEffect(() => {
    supabase.rpc('is_station').then(({ data }) => setStation(data === true));
  }, []);

  if (!members.loaded || station === null) return null;
  const sorted = [...members.rows].sort((a, b) => a.sort - b.sort);
  if (station) return <Station members={sorted} reloadMembers={members.reload} />;
  if (!me) {
    return (
      <div className="login"><div className="card">
        <div className="card-title">Kein Zugang</div>
        <div className="sub">Die Adresse {session.user.email} gehört nicht zur Familie.</div>
        <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Abmelden</button>
      </div></div>
    );
  }
  return <Shell me={me} members={sorted} />;
}

function Shell({ me, members }) {
  const [tab, setTab] = useState(() => { const t = sessionStorage.getItem('tab'); return TAB_IDS.includes(t) ? t : 'heute'; });
  const [liSeg, setLiSegRaw] = useState(() => merk('listen-seg', 'einkauf'));
  const setLiSeg = (v) => { setLiSegRaw(v); try { localStorage.setItem('listen-seg', v); } catch { /* egal */ } };
  const [plSeg, setPlSeg] = useState('wochenende');
  const [plus, setPlus] = useState(false);
  // Zentrale Trennung: Privat (Familie) oder Arbeit (nur ich) – pro Gerät gemerkt
  const [modus, setModusRaw] = useState(() => merk('modus', 'privat'));
  const [arbeitSheet, setArbeitSheet] = useState(null); // 'termin' | 'todo'
  const [zhSeg, setZhSeg] = useState('aemtchen');
  const [calSeg, setCalSeg] = useState('termine');
  const [mehr, setMehr] = useState(false);
  const [toast, setToast] = useState(null);
  const [eventEdit, setEventEdit] = useState(null); // { ev } | { preset }
  const [scan, setScan] = useState(false);
  const [day, setDay] = useState(today());

  // Datum aktuell halten (App bleibt auf dem Handy lange offen)
  useEffect(() => {
    const t = setInterval(() => setDay(today()), 60000);
    const onVis = () => setDay(today());
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  useEffect(() => { sessionStorage.setItem('tab', tab); window.scrollTo(0, 0); }, [tab]);

  const data = {
    events: useTable('events'),
    shop: useTable('shopping_items'),
    freq: useTable('frequent_items'),
    rules: useTable('pack_rules'),
    packItems: useTable('pack_items'),
    checks: useTable('pack_checks'),
    inbox: useTable('todo_inbox'),
    buy: useTable('buy_items'),
    gifts: useTable('gift_ideas'),
    workTodos: useTable('work_todos'),
    scans: useTable('scan_inbox'),
    workEvents: useTable('work_events'),
    workStunden: useTable('work_stunden'),
    workFristen: useTable('work_fristen'),
    workProtokolle: useTable('work_protokolle'),
    ...useHomeTables(),
  };

  const say = useCallback((text, undo) => setToast({ text, undo, k: Math.random() }), []);
  const fail = useCallback((msg) => setToast({ text: `Nicht gespeichert: ${msg}` }), []);

  const ctx = useMemo(() => ({
    me, members, data, day, say, fail,
    isDirk: me.id === 'dirk',
    member: (id) => members.find((m) => m.id === id),
    kids: members.filter((m) => m.kid),
    openEvent: (ev, preset) => setEventEdit({ ev, preset }),
    openScan: () => setScan(true),
    go: (t0, seg0) => {
      const [t, seg] = ALT[`${t0}:${seg0}`] || (ALT[t0] ? [ALT[t0][0], seg0 || ALT[t0][1]] : [t0, seg0]);
      setMehr(false); setPlus(false); setTab(t);
      if (seg && t === 'listen') setLiSeg(seg);
      if (seg && t === 'planen') setPlSeg(seg);
      if (seg && t === 'zuhause') setZhSeg(seg);
      if (seg && t === 'kalender') setCalSeg(seg);
    },
   
  }), [me, members, day, say, fail, ...Object.values(data).map((d) => d.rows)]);

  const openShop = data.shop.rows.filter((r) => !r.done).length;
  const openInbox = data.inbox.rows.filter((r) => !r.done_at && (!r.owner || r.owner === me.id)).length;
  const openBuy = data.buy.rows.filter((r) => !r.done).length;
  const toReview = data.events.rows.filter((e) => e.review).length;
  const titles = { heute: `Hallo ${me.name}`, kalender: 'Kalender', listen: 'Listen', planen: 'Planen', zuhause: 'Zuhause', 'a-heute': 'Arbeit', 'a-kalender': 'Termine', 'a-todos': 'To-dos', 'a-stunden': 'Stundenplan', 'a-orga': 'Orga' };
  const darfArbeit = !me.kid;
  const arbeit = darfArbeit && modus === 'arbeit';
  const tabs = arbeit ? ARBEIT_TABS : TABS;
  const aktiv = tabs.some((t) => t[0] === tab) ? tab : tabs[0][0];
  const setModus = (m) => {
    setModusRaw(m); try { localStorage.setItem('modus', m); } catch { /* egal */ }
    setMehr(false); setPlus(false); setTab(m === 'arbeit' ? 'a-heute' : 'heute');
  };

  return (
    <div className={`app${arbeit ? ' modus-arbeit' : ''}`}>
      <header className="head">
        <div className="head-row">
          <div>
            <div className="date">{longLabel(day)}</div>
            <h1>{mehr ? 'Mehr' : titles[aktiv]}</h1>
          </div>
          {darfArbeit && !mehr && (
            <div className="modus" role="group" aria-label="Bereich wählen">
              <button className={!arbeit ? 'on' : ''} aria-pressed={!arbeit} aria-label="Privat" onClick={() => setModus('privat')}><Icon name="house" size={18} /></button>
              <button className={arbeit ? 'on' : ''} aria-pressed={arbeit} aria-label="Arbeit" onClick={() => setModus('arbeit')}><Icon name="briefcase" size={18} /></button>
            </div>
          )}
          {!mehr && (
            <button className="icon-btn plus-btn" aria-label="Eintragen" aria-expanded={plus} onClick={() => setPlus(!plus)}><Icon name={plus ? 'x' : 'plus'} /></button>
          )}
          <button className="me-btn" onClick={() => setMehr(!mehr)} aria-label="Mehr: Einstellungen und Konto" aria-expanded={mehr}>
            <span className="avatar" style={{ background: me.bg, color: me.color }} aria-hidden="true">{me.name[0]}</span>
            <Icon name={mehr ? 'x' : 'menu'} />
          </button>
        </div>
        {plus && !mehr && (
          <div className="plus-menu" role="menu">
            {(arbeit ? [['cal', 'Termin Arbeit', () => setArbeitSheet('termin')], ['todo', 'To-do Arbeit', () => setArbeitSheet('todo')]] : [['cal', 'Termin', () => ctx.openEvent(null, { start_date: day })],
              ['cart', 'Einkauf', () => ctx.go('listen', 'einkauf')],
              ['todo', 'To-do', () => ctx.go('listen', 'vereinbaren')],
              ['bag', 'Besorgen', () => ctx.go('listen', 'besorgen')],
              ['form', 'Elternbrief scannen', () => ctx.openScan()]]).map(([ic, l, fn]) => (
              <button key={l} role="menuitem" className="plus-item" onClick={() => { setPlus(false); fn(); }}><Icon name={ic} size={18} />{l}</button>
            ))}
          </div>
        )}
      </header>

      <main className="main">
        {mehr ? <Mehr ctx={ctx} onClose={() => setMehr(false)} />
          : aktiv === 'a-heute' ? <ArbeitHeuteSeite ctx={ctx} />
          : aktiv === 'a-kalender' ? <ArbeitKalenderSeite ctx={ctx} />
          : aktiv === 'a-stunden' ? <StundenplanSeite ctx={ctx} />
          : aktiv === 'a-orga' ? <OrgaSeite ctx={ctx} />
          : aktiv === 'a-todos' ? <ArbeitTodosSeite ctx={ctx} />
          : aktiv === 'heute' ? <Heute ctx={ctx} />
          : aktiv === 'kalender' ? <Kalender ctx={ctx} seg={calSeg} setSeg={setCalSeg} />
          : aktiv === 'zuhause' ? <Zuhause ctx={ctx} seg={zhSeg} setSeg={setZhSeg} />
          : aktiv === 'planen' ? <Planen ctx={ctx} seg={plSeg} setSeg={setPlSeg} />
          : <Listen ctx={ctx} seg={liSeg} setSeg={setLiSeg} />}
      </main>
      {arbeitSheet === 'termin' && <TerminSheet ctx={ctx} ev={{ start_date: day }} onClose={() => setArbeitSheet(null)} />}
      {arbeitSheet === 'todo' && <TodoSheet ctx={ctx} t={{}} onClose={() => setArbeitSheet(null)} />}

      <nav className="tabs" aria-label="Bereiche">
        <div className="tabs-inner">
          {tabs.map(([id, label, icon]) => {
            const n = id === 'listen' ? openShop + openInbox + openBuy : id === 'kalender' ? toReview
              : id === 'a-todos' ? data.workTodos.rows.filter((t) => !t.done_at && ((t.am && t.am <= day) || (t.due && t.due <= day))).length
              : id === 'a-orga' ? data.workFristen.rows.filter((x) => !x.erledigt_at && x.datum <= addDays(day, 3)).length : 0;
            return (
              <button key={id} className={`tab${aktiv === id && !mehr ? ' on' : ''}`} aria-current={aktiv === id && !mehr ? 'page' : undefined}
                onClick={() => { setMehr(false); setPlus(false); setTab(id); }}>
                <Icon name={icon} size={24} />
                {label}
                {n > 0 && <span className="dot" aria-label={`${n} offen`}>{n}</span>}
              </button>
            );
          })}
        </div>
      </nav>

      {eventEdit && <EventSheet ctx={ctx} ev={eventEdit.ev} preset={eventEdit.preset} onClose={() => setEventEdit(null)} />}
      {scan && <Scan ctx={ctx} onClose={() => setScan(false)} />}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
