import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, useTable } from './data.js';
import { Icon, Toast } from './ui.jsx';
import { longLabel, today } from './lib/dates.js';
import Login, { NewPassword } from './screens/Login.jsx';
import Heute from './screens/Heute.jsx';
import Kalender from './screens/Kalender.jsx';
import Einkauf from './screens/Einkauf.jsx';
import Erinnerungen from './screens/Erinnerungen.jsx';
import Mehr from './screens/Mehr.jsx';
import EventSheet from './screens/EventSheet.jsx';
import Station from './screens/Station.jsx';

const TABS = [
  ['heute', 'Heute', 'home'],
  ['kalender', 'Kalender', 'cal'],
  ['einkauf', 'Einkauf', 'cart'],
  ['erinn', 'Erinnerungen', 'bell'],
];

export default function App() {
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
  if (station) return <Station members={sorted} />;
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
  const [tab, setTab] = useState(() => sessionStorage.getItem('tab') || 'heute');
  const [erSeg, setErSeg] = useState('mitnehmen');
  const [mehr, setMehr] = useState(false);
  const [toast, setToast] = useState(null);
  const [eventEdit, setEventEdit] = useState(null); // { ev } | { preset }
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
  };

  const say = useCallback((text, undo) => setToast({ text, undo, k: Math.random() }), []);
  const fail = useCallback((msg) => setToast({ text: `Nicht gespeichert: ${msg}` }), []);

  const ctx = useMemo(() => ({
    me, members, data, day, say, fail,
    isDirk: me.id === 'dirk',
    member: (id) => members.find((m) => m.id === id),
    kids: members.filter((m) => m.kid),
    openEvent: (ev, preset) => setEventEdit({ ev, preset }),
    go: (t, seg) => { setMehr(false); setTab(t); if (seg) setErSeg(seg); },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [me, members, day, say, fail, ...Object.values(data).map((d) => d.rows)]);

  const openShop = data.shop.rows.filter((r) => !r.done).length;
  const openInbox = data.inbox.rows.filter((r) => !r.done_at).length;
  const titles = { heute: `Hallo ${me.name}`, kalender: 'Kalender', einkauf: 'Einkaufsliste', erinn: 'Erinnerungen' };

  return (
    <div className="app">
      <header className="head">
        <div className="head-row">
          <div>
            <div className="date">{longLabel(day)}</div>
            <h1>{mehr ? 'Mehr' : titles[tab]}</h1>
          </div>
          <button className="me-btn" onClick={() => setMehr(!mehr)} aria-label="Mehr: Klender-Umzug, Konto" aria-expanded={mehr}>
            <span className="avatar" style={{ background: me.bg, color: me.color }} aria-hidden="true">{me.name[0]}</span>
            <Icon name={mehr ? 'x' : 'menu'} />
          </button>
        </div>
      </header>

      <main className="main">
        {mehr ? <Mehr ctx={ctx} onClose={() => setMehr(false)} />
          : tab === 'heute' ? <Heute ctx={ctx} />
          : tab === 'kalender' ? <Kalender ctx={ctx} />
          : tab === 'einkauf' ? <Einkauf ctx={ctx} />
          : <Erinnerungen ctx={ctx} seg={erSeg} setSeg={setErSeg} />}
      </main>

      <nav className="tabs" aria-label="Bereiche">
        <div className="tabs-inner">
          {TABS.map(([id, label, icon]) => {
            const n = id === 'einkauf' ? openShop : id === 'erinn' && me.id === 'dirk' ? openInbox : 0;
            return (
              <button key={id} className={`tab${tab === id && !mehr ? ' on' : ''}`} aria-current={tab === id && !mehr ? 'page' : undefined}
                onClick={() => { setMehr(false); setTab(id); }}>
                <Icon name={icon} size={24} />
                {label}
                {n > 0 && <span className="dot" aria-label={`${n} offen`}>{n}</span>}
              </button>
            );
          })}
        </div>
      </nav>

      {eventEdit && <EventSheet ctx={ctx} ev={eventEdit.ev} preset={eventEdit.preset} onClose={() => setEventEdit(null)} />}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
