import { useEffect, useState } from 'react';
import { supabase, run } from '../data.js';
import { Icon, Check } from '../ui.jsx';

const KINDS = [
  ['morgen', 'Morgens um 7:30', 'Termine heute, offene Betreuung'],
  ['abend', 'Abends um 19:30', 'Termine morgen, Einpacken, Müll (dienstags)'],
  ['vereinbaren', 'Neues unter „Erledigen“', 'sofort – an wen es betrifft'],
  ['wunsch', 'Neuer Essenswunsch', 'sofort – nur für Catrin'],
];

function b64ToBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export default function Mitteilungen({ ctx, onBack }) {
  const [sub, setSub] = useState(undefined); // PushSubscription | null
  const [row, setRow] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!supported()) { setSub(null); return; }
    navigator.serviceWorker.getRegistration().then(async (reg) => {
      const s = reg ? await reg.pushManager.getSubscription() : null;
      setSub(s);
      if (s) {
        const { data } = await supabase.from('push_subscriptions').select('*').eq('endpoint', s.endpoint).maybeSingle();
        setRow(data);
      }
    });
  }, []);

  const enable = async () => {
    setMsg(''); setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setMsg('Mitteilungen wurden nicht erlaubt. In den Einstellungen des iPhones unter „Mitteilungen“ › „Familie“ einschalten.'); return; }
      const reg = await navigator.serviceWorker.ready;
      const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(import.meta.env.VITE_VAPID_PUBLIC) });
      const j = s.toJSON();
      const device = /iPad/.test(navigator.userAgent) ? 'iPad' : /iPhone/.test(navigator.userAgent) ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android' : 'Computer';
      const res = await run(supabase.from('push_subscriptions').upsert({ member_id: ctx.me.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, device }, { onConflict: 'endpoint' }).select('*').single(), ctx.fail);
      if (res) { setSub(s); setRow(res); ctx.say('Mitteilungen sind an'); }
    } catch (e) {
      setMsg(`Hat nicht geklappt: ${e.message}`);
    } finally { setBusy(false); }
  };
  const disable = async () => {
    setBusy(true);
    await run(supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint), ctx.fail);
    await sub.unsubscribe().catch(() => {});
    setSub(null); setRow(null); setBusy(false);
    ctx.say('Mitteilungen sind aus');
  };
  const togglePref = async (k) => {
    const prefs = { ...row.prefs, [k]: row.prefs?.[k] === false };
    setRow({ ...row, prefs });
    await run(supabase.from('push_subscriptions').update({ prefs }).eq('id', row.id), ctx.fail);
  };
  const test = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('mitteilungen', { body: { art: 'test' } });
    setBusy(false);
    if (error || !data?.gesendet) setMsg('Die Probe kam nicht an. Mitteilungen bitte aus- und wieder einschalten.');
    else ctx.say('Probe verschickt – gleich sollte sie erscheinen');
  };

  const kinds = KINDS.filter(([k]) => (k === 'wunsch' ? ctx.me.id === 'catrin' : true));

  return (
    <>
      <button className="btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={onBack}><Icon name="left" size={16} />Zurück</button>
      <section className="card">
        <div className="card-title">Mitteilungen auf diesem Gerät</div>
        {!supported() || (!standalone() && /iPhone|iPad/.test(navigator.userAgent)) ? (
          <div className="sub">Auf dem iPhone gehen Mitteilungen nur, wenn die App auf dem Home-Bildschirm liegt: In Safari auf „Teilen“ › „Zum Home-Bildschirm“, dann die App von dort öffnen und hier einschalten.</div>
        ) : sub === undefined ? null : sub ? (
          <>
            <div className="ok" style={{ fontWeight: 600 }}>Eingeschaltet</div>
            <div className="chips">
              <button className="btn small" disabled={busy} onClick={test}>Probe-Mitteilung</button>
              <button className="btn ghost small" disabled={busy} onClick={disable}>Ausschalten</button>
            </div>
          </>
        ) : (
          <>
            <div className="sub">Einmal einschalten und dem iPhone die Erlaubnis geben.</div>
            <button className="btn" disabled={busy} onClick={enable}>Mitteilungen einschalten</button>
          </>
        )}
        {msg && <div className="err" role="alert">{msg}</div>}
      </section>
      {row && (
        <section className="card tight">
          <div className="card-title" style={{ padding: '10px 0 4px' }}>Was soll kommen?</div>
          {kinds.map(([k, label, sub2]) => (
            <button key={k} className="row" onClick={() => togglePref(k)} aria-pressed={row.prefs?.[k] !== false}>
              <Check on={row.prefs?.[k] !== false} />
              <span className="row-main"><span className="row-title">{label}</span><span className="small">{sub2}</span></span>
            </button>
          ))}
        </section>
      )}
      <div className="small">Jedes Gerät wird einzeln eingeschaltet. Catrin schaltet es auf ihrem iPhone selbst ein.</div>
    </>
  );
}
