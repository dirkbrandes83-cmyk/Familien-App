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
      <SchnellEintragen ctx={ctx} onNeu={load} />
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
        <div className="small">Gibt es die Liste schon, übernimmt die App beim ersten Abgleich alles, was dort offen ist. Gibt es sie nicht, wird sie angelegt. Tipp: Die Liste in Erinnerungen nicht teilen – jede Person richtet den Abgleich mit einer eigenen Liste ein. Bei geteilten Listen meldet Apple sonst jeden Eintrag, den das Skript anlegt, als „hinzugefügt von …“.</div>
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
              <span className="row-main"><span className="row-title">{t.label}</span><span className="small">{t.scope === 'einkauf' ? 'darf die Einkaufsliste abgleichen' : t.scope === 'schnell' ? 'darf eintragen und scannen' : 'nur lesen'} · zuletzt: {fmt(t.last_used)}</span></span>
              <button className="btn ghost small" style={{ color: '#B91C1C' }} onClick={() => revoke(t)}>Sperren</button>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

// Schnell-Eintragen ohne die App zu öffnen: iPhone-Kurzbefehle, als Widget auf dem Home-Bildschirm oder per Siri
const URL_SCHNELL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/schnell`;
const KURZBEFEHLE = [
  ['To-do', 'todo', 'To-do für die Familien-App (bei dir)'],
  ['Arbeit', 'arbeit', 'To-do im Arbeitsbereich (nur für dich)'],
  ['Einkauf', 'einkauf', 'auf die Einkaufsliste, mehrere mit Komma'],
];
function SchnellEintragen({ ctx, onNeu }) {
  const [key, setKey] = useState(null);
  const [kopiert, setKopiert] = useState(false);
  const erstellen = async () => {
    const dev = /iPad/.test(navigator.userAgent) ? 'iPad' : 'iPhone';
    const res = await run(supabase.from('widget_tokens').insert({ member_id: ctx.me.id, label: `${dev} · Schnell-Eintragen`, scope: 'schnell' }).select('token').single(), ctx.fail);
    if (res) { setKey(res.token); onNeu(); }
  };
  const url = key ? `${URL_SCHNELL}?key=${key}` : '';
  const kopieren = async () => {
    try { await navigator.clipboard.writeText(url); setKopiert(true); } catch { ctx.fail('Kopieren ging nicht – bitte den Link lange antippen.'); }
  };
  return (
    <section className="card">
      <div className="card-title">Schnell eintragen und scannen – ohne die App zu öffnen</div>
      <div className="sub">Über Apples <b>Kurzbefehle</b>: Sie liegen als Widget auf dem Home-Bildschirm (ein Tipp, Text eintippen oder diktieren, fertig) und gehen auch per Siri („Hey Siri, To-do“). Gescannte Briefe warten danach in der App unter „Heute“ zum Prüfen.</div>
      {!key && <button className="btn" onClick={erstellen}>Schnell-Eintragen einrichten</button>}
      {key && (
        <>
          <div className="small"><b>Dein persönlicher Link</b> (nicht weitergeben):</div>
          <button className="btn" onClick={kopieren}>{kopiert ? 'Link kopiert ✓' : 'Link kopieren'}</button>
          <input className="input" readOnly value={url} onFocus={(e) => e.target.select()} style={{ fontSize: 11, fontFamily: 'ui-monospace, monospace' }} aria-label="Persönlicher Link" />
        </>
      )}
      <details className="sk-details">
        <summary>Kurzbefehl „To-do“, „Arbeit“, „Einkauf“ anlegen</summary>
        <ol className="sub sk-liste">
          <li>App <b>Kurzbefehle</b> › <b>+</b> › Name oben: z. B. „To-do“.</li>
          <li>Aktion <b>„Nach Eingabe fragen“</b> – Frage: „Was ist zu tun?“</li>
          <li>Aktion <b>„Inhalte von URL abrufen“</b> – URL: deinen Link einfügen. Auf „&gt;“ tippen: Methode <b>POST</b>, Anfragetext <b>JSON</b>, zwei Felder (Text):
            <br />• <code>art</code> = {KURZBEFEHLE.map((k) => <code key={k[1]}>{k[1]}</code>).reduce((a, x) => [a, ' / ', x])}
            <br />• <code>text</code> = Variable „Bereitgestellte Eingabe“</li>
          <li>Aktion <b>„Wörterbuchwert abrufen“</b> – Schlüssel <code>msg</code>, dann <b>„Mitteilung anzeigen“</b> mit diesem Wert.</li>
          <li>Für „Arbeit“ und „Einkauf“: Kurzbefehl duplizieren und nur <code>art</code> und den Namen ändern.</li>
        </ol>
        <div className="small">{KURZBEFEHLE.map((k) => `${k[0]}: ${k[2]}`).join(' · ')}</div>
      </details>
      <details className="sk-details">
        <summary>Kurzbefehl „Scannen“ anlegen</summary>
        <ol className="sub sk-liste">
          <li>Neuer Kurzbefehl „Scannen“ › Aktion <b>„Foto aufnehmen“</b>.</li>
          <li><b>„Bild konvertieren“</b> in JPEG, dann <b>„Bildgröße ändern“</b> auf Breite 1600.</li>
          <li><b>„Base64-codieren“</b> – über „&gt;“ Zeilenumbrüche: <b>Keine</b>.</li>
          <li><b>„Inhalte von URL abrufen“</b> – dein Link, POST, JSON mit drei Feldern: <code>art</code> = <code>scan</code>, <code>media_type</code> = <code>image/jpeg</code>, <code>data</code> = Variable „Base64-codiert“.</li>
          <li><b>„Wörterbuchwert abrufen“</b> <code>msg</code> › <b>„Mitteilung anzeigen“</b>. Das Auslesen dauert 10–30 Sekunden.</li>
        </ol>
      </details>
      <details className="sk-details">
        <summary>Als Widget auf den Home-Bildschirm</summary>
        <ol className="sub sk-liste">
          <li>Home-Bildschirm lange drücken › <b>+</b> › <b>Kurzbefehle</b> › mittlere Größe (4 Knöpfe) › hinzufügen.</li>
          <li>Widget antippen und halten › „Widget bearbeiten“ › Ordner mit deinen vier Kurzbefehlen wählen.</li>
          <li>Ein Tipp auf „To-do“ öffnet nur das Eingabefeld – die Familien-App muss nicht starten.</li>
        </ol>
      </details>
    </section>
  );
}
