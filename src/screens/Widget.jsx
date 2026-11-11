import { useEffect, useState } from 'react';
import { supabase, run } from '../data.js';
import { Icon } from '../ui.jsx';
import { WIDGET_SCRIPT } from '../lib/widgetScript.js';

export default function Widget({ ctx, onBack }) {
  const [tokens, setTokens] = useState([]);
  const [script, setScript] = useState('');
  const [copied, setCopied] = useState(false);
  const load = async () => {
    const { data } = await supabase.from('widget_tokens').select('*').order('created_at');
    setTokens(data || []);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    const label = /iPad/.test(navigator.userAgent) ? 'iPad' : 'iPhone';
    const res = await run(supabase.from('widget_tokens').insert({ member_id: ctx.me.id, label }).select('token').single(), ctx.fail);
    if (res) { setScript(WIDGET_SCRIPT.replace('__KEY__', res.token)); setCopied(false); load(); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(script); setCopied(true); } catch { ctx.fail('Kopieren ging nicht – bitte den Text lange antippen und „Alles auswählen“.'); }
  };
  const revoke = async (t) => {
    if (!window.confirm('Diesen Widget-Schlüssel sperren? Das Widget zeigt dann nichts mehr an.')) return;
    await run(supabase.from('widget_tokens').delete().eq('token', t.token), ctx.fail);
    load();
  };
  const fmt = (t) => (t ? new Date(t).toLocaleString('de-DE', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'noch nie');

  return (
    <>
      <button className="btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={onBack}><Icon name="left" size={16} />Zurück</button>
      <section className="card">
        <div className="card-title">Widget „Heute“ für den Home-Bildschirm</div>
        <div className="sub">Zeigt die nächsten Termine, Müll, Einkauf und Einpacken. Es läuft über die kostenlose App <b>Scriptable</b> und kann nur anzeigen, nichts ändern.</div>
        <ol className="sub" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.55 }}>
          <li>„Scriptable“ aus dem App Store laden.</li>
          <li>Hier auf „Widget einrichten“ tippen, dann „Skript kopieren“.</li>
          <li>Scriptable öffnen › <b>+</b> oben rechts › Text einfügen › oben den Namen auf „Familie“ ändern › Fertig.</li>
          <li>Home-Bildschirm lange drücken › <b>+</b> oben links › „Scriptable“ › Größe wählen (mittel empfohlen) › „Widget hinzufügen“.</li>
          <li>Das neue Widget antippen und halten › „Widget bearbeiten“ › bei „Script“ „Familie“ wählen.</li>
        </ol>
        {!script && <button className="btn" onClick={create}>Widget einrichten</button>}
      </section>
      {script && (
        <section className="card">
          <div className="card-title">Dein Skript</div>
          <button className="btn" onClick={copy}>{copied ? 'Kopiert ✓' : 'Skript kopieren'}</button>
          <textarea className="input" readOnly value={script} style={{ minHeight: 120, fontFamily: 'ui-monospace, monospace', fontSize: 11 }} onFocus={(e) => e.target.select()} aria-label="Widget-Skript" />
          <div className="small">Das Skript enthält deinen persönlichen Lese-Schlüssel. Bitte nicht weitergeben – Catrin richtet ihr Widget in ihrer App selbst ein.</div>
        </section>
      )}
      {tokens.length > 0 && (
        <section className="card tight">
          <div className="card-title" style={{ padding: '10px 0 4px' }}>Eingerichtete Widgets</div>
          {tokens.map((t) => (
            <div key={t.token} className="row">
              <span className="row-main"><span className="row-title">{t.label}</span><span className="small">zuletzt abgerufen: {fmt(t.last_used)}</span></span>
              <button className="btn ghost small" style={{ color: '#B91C1C' }} onClick={() => revoke(t)}>Sperren</button>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
