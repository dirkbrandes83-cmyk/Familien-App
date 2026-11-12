import { useEffect, useState } from 'react';
import { supabase, run } from '../data.js';
import { Icon } from '../ui.jsx';
import { WIDGET_SCRIPT } from '../lib/widgetScript.js';
import { EINKAUF_SCRIPT } from '../lib/einkaufScript.js';

export default function Widget({ ctx, onBack }) {
  const [tokens, setTokens] = useState([]);
  const [script, setScript] = useState('');
  const [kind, setKind] = useState(null); // 'lesen' | 'einkauf'
  const [listName, setListName] = useState('Einkaufen');
  const [copied, setCopied] = useState(false);
  const load = async () => {
    const { data } = await supabase.from('widget_tokens').select('*').order('created_at');
    setTokens(data || []);
  };
  useEffect(() => { load(); }, []);

  const create = async (scope) => {
    const dev = /iPad/.test(navigator.userAgent) ? 'iPad' : 'iPhone';
    const label = scope === 'einkauf' ? `${dev} · Einkauf/Watch` : `${dev} · Widget Heute`;
    const res = await run(supabase.from('widget_tokens').insert({ member_id: ctx.me.id, label, scope }).select('token').single(), ctx.fail);
    const name = (listName.trim() || 'Einkaufen').replace(/["\\]/g, '');
    if (res) { setScript((scope === 'einkauf' ? EINKAUF_SCRIPT.replace('__LIST__', name) : WIDGET_SCRIPT).replace('__KEY__', res.token)); setKind(scope); setCopied(false); load(); }
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
        {kind !== 'lesen' && <button className="btn" onClick={() => create('lesen')}>Widget einrichten</button>}
      </section>
      <section className="card">
        <div className="card-title">Einkaufsliste auf der Apple Watch</div>
        <div className="sub">Die Einkaufsliste wird mit einer Liste in Apples <b>Erinnerungen</b> abgeglichen – auch eure bestehende –, auf iPhone und Watch. Was du dort abhakst, ist in der Familien-App erledigt. Was du dort einträgst (auch per Siri: „Füge Milch zu Einkaufen hinzu“), kommt in die App.</div>
        <ol className="sub" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.55 }}>
          <li>„Einkauf einrichten“ antippen, „Skript kopieren“.</li>
          <li>In Scriptable mit <b>+</b> ein neues Skript anlegen, einfügen, Namen „Einkauf“ geben, einmal ▶ antippen und den Zugriff auf Erinnerungen erlauben.</li>
          <li>Damit es von selbst läuft: ein Scriptable-Widget (klein) auf den Home-Bildschirm legen und „Einkauf“ wählen – es gleicht dann regelmäßig ab und zeigt die Liste.</li>
          <li>Für sofortigen Abgleich vor dem Einkaufen: In der App „Kurzbefehle“ › Automation › „App“ › <b>Erinnerungen</b> „Wird geöffnet“ und „Wird geschlossen“ › Aktion „Script ausführen“ (Scriptable) › „Einkauf“ › „Sofort ausführen“.</li>
        </ol>
        <label className="field"><span>Name der Liste in Erinnerungen (genau wie dort geschrieben)</span>
          <input className="input" value={listName} onChange={(e) => setListName(e.target.value)} maxLength={60} />
        </label>
        <div className="small">Gibt es die Liste schon, übernimmt die App beim ersten Abgleich alles, was dort offen ist. Gibt es sie nicht, wird sie angelegt. Bei einer mit Catrin geteilten Liste reicht es, wenn eine Person den Abgleich einrichtet.</div>
        {kind !== 'einkauf' && <button className="btn" onClick={() => create('einkauf')}>Einkauf einrichten</button>}
        <div className="small">Auf der Watch selbst läuft kein Abgleich: Was du dort abhakst, kommt in die Familien-App, sobald das iPhone das nächste Mal abgleicht (Widget oder Kurzbefehl).</div>
      </section>
      {script && (
        <section className="card">
          <div className="card-title">{kind === 'einkauf' ? 'Dein Einkaufs-Skript' : 'Dein Widget-Skript'}</div>
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
              <span className="row-main"><span className="row-title">{t.label}</span><span className="small">{t.scope === 'einkauf' ? 'darf die Einkaufsliste abgleichen' : 'nur lesen'} · zuletzt: {fmt(t.last_used)}</span></span>
              <button className="btn ghost small" style={{ color: '#B91C1C' }} onClick={() => revoke(t)}>Sperren</button>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
