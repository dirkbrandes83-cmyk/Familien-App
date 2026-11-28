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
  ['To-do', 'todo', 'To-do für die Familien-App (bei dir)', 'Was ist zu tun?'],
  ['Arbeit', 'arbeit', 'To-do im Arbeitsbereich (nur für dich)', 'Was ist dienstlich zu tun?'],
  ['Einkauf', 'einkauf', 'auf die Einkaufsliste, mehrere mit Komma', 'Was fehlt?'],
  ['Thema ESL', 'esl', 'Thema für die nächste ESL (Arbeit)', 'Welches Thema für die ESL?'],
  ['Thema Team', 'team', 'Thema für die nächste Teamsitzung (Arbeit)', 'Welches Thema fürs Team?'],
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
      <details className="sk-details" open={!!key}>
        <summary>1. Ersten Kurzbefehl „To-do“ anlegen (Schritt für Schritt)</summary>
        <ol className="sub sk-liste">
          <li><b>Link kopieren</b> (Knopf oben). Ohne Link geht es nicht – er ist dein persönlicher Schlüssel.</li>
          <li>App <b>Kurzbefehle</b> öffnen › unten Reiter <b>„Kurzbefehle“</b> › oben rechts <b>+</b>.</li>
          <li>Oben auf den Namen „Neuer Kurzbefehl“ tippen › <b>„Umbenennen“</b> › <code>To-do</code> eingeben › Fertig. <i>(Dieser Name ist auch das Siri-Wort.)</i></li>
          <li>Unten ins Suchfeld <b>„Nach Apps und Aktionen suchen“</b> tippen › <code>Nach Eingabe fragen</code> suchen › antippen.<br />
            In der Aktion steht „Nach <u>Text</u> fragen mit <u>Aufforderung</u>“ › auf das blasse <b>„Aufforderung“</b> tippen › <code>Was ist zu tun?</code> eingeben.</li>
          <li>Wieder unten suchen: <code>Inhalte von URL abrufen</code> › antippen.<br />
            Auf das blaue <b>„URL“</b> tippen › lange tippen › <b>„Einsetzen“</b> (dein kopierter Link).</li>
          <li>In derselben Aktion auf den <b>Pfeil ›</b> (bzw. „Mehr anzeigen“) tippen. Es klappt auf:
            <br />• <b>Methode</b>: von GET auf <b>POST</b> stellen.
            <br />• <b>Anfragetext</b>: <b>JSON</b> wählen.
            <br />• <b>„Neues Feld hinzufügen“</b> › <b>Text</b> › links (Schlüssel) <code>art</code>, rechts (Text) <code>todo</code>.
            <br />• Noch einmal <b>„Neues Feld hinzufügen“</b> › <b>Text</b> › links <code>text</code>, rechts ins Feld tippen › über der Tastatur die blaue Variable <b>„Angefragte Eingabe“</b> antippen (notfalls über „Variable auswählen“).</li>
          <li>Unten suchen: <code>Wörterbuchwert abrufen</code> › antippen. Es steht „Wert für <u>Schlüssel</u> in <u>Inhalte von URL</u> abrufen“ › auf <b>„Schlüssel“</b> tippen › <code>msg</code> eingeben.</li>
          <li>Unten suchen: <code>Mitteilung anzeigen</code> › antippen › ins Textfeld tippen und die Variable <b>„Wörterbuchwert“</b> einsetzen (den vorgegebenen Text „Hallo Welt!“ vorher löschen).</li>
          <li>Oben rechts <b>„Fertig“</b>. Zum Testen die Kachel antippen, etwas eingeben › es kommt z. B. „„Test“ in der Familien-App eingetragen“. Beim ersten Mal fragt das iPhone, ob der Kurzbefehl <i>supabase.co</i> verbinden darf › <b>„Immer erlauben“</b>.</li>
        </ol>
      </details>
      <details className="sk-details">
        <summary>2. Weitere Kurzbefehle per Duplizieren</summary>
        <ol className="sub sk-liste">
          <li>In der Übersicht die Kachel „To-do“ <b>lange drücken</b> › <b>„Duplizieren“</b>.</li>
          <li>Die Kopie antippen (Bearbeiten über „…“) › oben umbenennen.</li>
          <li>In „Inhalte von URL abrufen“ den Pfeil › aufklappen und nur den Wert von <code>art</code> ändern. Die Frage in „Nach Eingabe fragen“ passend ändern.</li>
        </ol>
        <table className="sk-tabelle">
          <thead><tr><th>Name</th><th><code>art</code></th><th>Frage</th></tr></thead>
          <tbody>
            {KURZBEFEHLE.map(([name, art, wofuer, frage]) => <tr key={art}><td><b>{name}</b><div className="small">{wofuer}</div></td><td><code>{art}</code></td><td>{frage}</td></tr>)}
          </tbody>
        </table>
        <div className="small">Mehrere Einträge auf einmal: durch Zeilenumbruch oder Semikolon trennen, beim Einkauf auch mit Komma. Siri: „Hey Siri, Thema ESL“ – dann den Text sprechen.</div>
      </details>
      <details className="sk-details">
        <summary>3. Kurzbefehl „Scannen“ (Elternbrief fotografieren)</summary>
        <ol className="sub sk-liste">
          <li>Neuer Kurzbefehl › Name <code>Scannen</code>.</li>
          <li>Aktion <code>Foto aufnehmen</code> › über den Pfeil › <b>„Vorschau anzeigen“</b> ausschalten (geht schneller).</li>
          <li>Aktion <code>Bild konvertieren</code> › Format <b>JPEG</b> (Qualität ca. 0,7).</li>
          <li>Aktion <code>Bildgröße ändern</code> › Breite <code>1600</code>, Höhe „automatisch“.</li>
          <li>Aktion <code>Base64-codieren</code> › Pfeil › <b>Zeilenumbrüche: Keine</b> (wichtig!).</li>
          <li>Aktion <code>Inhalte von URL abrufen</code> › dein Link › Pfeil: Methode <b>POST</b>, Anfragetext <b>JSON</b>, drei Text-Felder:
            <br />• <code>art</code> = <code>scan</code>
            <br />• <code>media_type</code> = <code>image/jpeg</code>
            <br />• <code>data</code> = Variable <b>„Base64-codiert“</b></li>
          <li><code>Wörterbuchwert abrufen</code> mit Schlüssel <code>msg</code> › <code>Mitteilung anzeigen</code> mit „Wörterbuchwert“.</li>
          <li>Das Auslesen dauert 10–30 Sekunden. Das Ergebnis wartet in der App unter <b>„Heute“</b> zum Prüfen und Übernehmen.</li>
        </ol>
      </details>
      <details className="sk-details">
        <summary>4. Als Widget auf den Home-Bildschirm</summary>
        <ol className="sub sk-liste">
          <li>In Kurzbefehle unten <b>„Kurzbefehle“</b> › oben links <b>Ordner-Symbol</b> › neuen Ordner „Familie“ anlegen und die Kurzbefehle hineinziehen (lange drücken › „Bewegen“).</li>
          <li>Home-Bildschirm an einer freien Stelle lange drücken › oben links <b>„Bearbeiten“</b> › <b>„Widget hinzufügen“</b> › <b>Kurzbefehle</b> suchen.</li>
          <li>Größe wählen: <b>mittel</b> (4 Knöpfe) oder <b>groß</b> (8 Knöpfe) › <b>„Widget hinzufügen“</b>.</li>
          <li>Das neue Widget antippen (im Wackelmodus) › bei „Ordner“ <b>„Familie“</b> wählen.</li>
          <li>Ein Tipp auf „To-do“ öffnet nur das Eingabefeld – die Familien-App muss nicht starten. Auf dem Sperrbildschirm geht es genauso.</li>
        </ol>
      </details>
      <details className="sk-details">
        <summary>Wenn es nicht klappt</summary>
        <ul className="sub sk-liste">
          <li><b>„Schlüssel ungültig“</b>: Der Link wurde gelöscht oder falsch eingesetzt. Oben neu einrichten und den Link in allen Kurzbefehlen ersetzen.</li>
          <li><b>Es kommt nichts / leere Mitteilung</b>: Methode steht noch auf GET oder Anfragetext nicht auf JSON. Schlüssel genau klein schreiben: <code>art</code>, <code>text</code>, <code>msg</code>.</li>
          <li><b>„Kein Text angekommen“</b>: Beim Feld <code>text</code> fehlt die Variable „Angefragte Eingabe“ (sie ist blau hinterlegt, nicht getippt).</li>
          <li><b>Scan zu groß</b>: Bildgröße auf Breite 1200 stellen.</li>
          <li>Einen Link, den jemand gesehen hat, oben bei „Eingerichtete Widgets“ löschen und neu einrichten.</li>
        </ul>
      </details>
    </section>
  );
}
