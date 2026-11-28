import { useState } from 'react';
import { supabase, run } from '../data.js';
import { Icon, Check, Sheet, ChipPick } from '../ui.jsx';
import { parseIcs } from '../lib/ics.js';
import { shortLabel, hm } from '../lib/dates.js';

// Kopierte .ics-Datei (Einladung aus Mail, Outlook, Webseite …) einfügen und als Termin(e) übernehmen.
// Privat → Familienkalender (für wen wählbar), Arbeit → eigener Arbeitskalender.
export default function IcsEinfuegen({ ctx, arbeit, onClose }) {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState(null);
  const [aus, setAus] = useState(new Set()); // abgewählte Indizes
  const [who, setWho] = useState([ctx.me.id]);
  const [familie, setFamilie] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const lesen = async (t) => {
    setErr(''); setParsed(null);
    const s = String(t || '').trim();
    if (!s) return;
    // Link statt Datei: über den Server holen (umgeht Browser-Sperren)
    if (/^(https?|webcal):\/\/\S+$/i.test(s)) {
      setBusy(true);
      const { data, error } = await supabase.functions.invoke('ics-holen', { body: { url: s } });
      setBusy(false);
      if (error || !data?.text) { setErr('Konnte den Link nicht laden.'); return; }
      return lesen(data.text);
    }
    if (!/BEGIN:VCALENDAR|BEGIN:VEVENT/i.test(s)) { setErr('Das sieht nicht nach einer Kalender-Datei (.ics) aus.'); return; }
    const voll = /BEGIN:VCALENDAR/i.test(s) ? s : `BEGIN:VCALENDAR\n${s}\nEND:VCALENDAR`;
    const p = parseIcs(voll);
    if (!p.events.length) { setErr('Keine Termine in der Datei gefunden.'); return; }
    setParsed(p);
    // schon vorhandene Termine vorab abwählen
    const rows = arbeit ? ctx.data.workEvents.rows : ctx.data.events.rows;
    const sig = (e) => `${e.title.trim().toLowerCase()}|${e.start_date}|${hm(e.from_time)}`;
    const da = new Set(rows.map(sig));
    setAus(new Set(p.events.map((e, i) => (da.has(sig(e)) ? i : -1)).filter((i) => i >= 0)));
  };

  const ausZwischenablage = async () => {
    setErr('');
    try {
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read();
        for (const it of items) {
          const typ = it.types.find((x) => /calendar|plain/i.test(x));
          if (typ) { const t = await (await it.getType(typ)).text(); setText(t); return lesen(t); }
        }
      }
      const t = await navigator.clipboard.readText();
      setText(t); lesen(t);
    } catch {
      setErr('Kein Zugriff auf die Zwischenablage – bitte unten ins Feld einfügen (lange tippen › Einsetzen).');
    }
  };
  const datei = async (f) => { if (!f) return; const t = await f.text(); setText(t); lesen(t); };

  const liste = parsed?.events ?? [];
  const gewaehlt = liste.filter((_, i) => !aus.has(i));
  const toggle = (i) => { const n = new Set(aus); if (n.has(i)) n.delete(i); else n.add(i); setAus(n); };

  const uebernehmen = async () => {
    if (!gewaehlt.length) return;
    setBusy(true);
    const rows = gewaehlt.map(({ groups: _g, src: _s, ext_uid, ...e }) => {
      const uid = ext_uid ? `ics:${ext_uid}` : null;
      return arbeit
        ? { ...e, owner: ctx.me.id, familie, ext_uid: uid }
        : { ...e, who: who.length ? who : ['all'], created_by: ctx.me.id, src: 'fam', ext_uid: uid };
    });
    const T = arbeit ? 'work_events' : 'events';
    const ok = await run(supabase.from(T).upsert(rows, { onConflict: 'ext_uid', ignoreDuplicates: true }), (m) => setErr(m));
    setBusy(false);
    if (!ok) return;
    (arbeit ? ctx.data.workEvents : ctx.data.events).reload();
    if (arbeit && familie) ctx.data.events.reload();
    ctx.say(rows.length === 1 ? `„${rows[0].title}“ eingetragen` : `${rows.length} Termine eingetragen`);
    onClose();
  };

  const opts = [{ id: 'all', label: 'Alle', color: '#0F766E', bg: '#CCFBF1' }, ...ctx.members.map((m) => ({ id: m.id, label: m.name, color: m.color, bg: m.bg }))];
  const pickWho = (id) => {
    if (id === 'all') { setWho(['all']); return; }
    const ohne = who.filter((x) => x !== 'all');
    setWho(ohne.includes(id) ? ohne.filter((x) => x !== id) : [...ohne, id]);
  };

  return (
    <Sheet title={arbeit ? 'Kalender-Datei → Arbeit' : 'Kalender-Datei einfügen'} onClose={onClose}
      actions={parsed ? <button className="btn" disabled={busy || !gewaehlt.length} onClick={uebernehmen}>{busy ? 'Trage ein …' : gewaehlt.length === 1 ? 'Termin eintragen' : `${gewaehlt.length} Termine eintragen`}</button> : null}>
      {!parsed && (
        <>
          <div className="sub">Eine kopierte Einladung (.ics) oder einen Kalender-Link einfügen. Die App liest Titel, Datum und Uhrzeit aus.</div>
          <div className="chips">
            <button type="button" className="btn small" onClick={ausZwischenablage}><Icon name="copy" size={16} />Aus Zwischenablage</button>
            <label className="btn ghost small" style={{ position: 'relative' }}>
              <Icon name="upload" size={16} />Datei wählen
              <input type="file" accept=".ics,text/calendar" onChange={(e) => datei(e.target.files[0])} style={{ position: 'absolute', inset: 0, opacity: 0 }} />
            </label>
          </div>
          <label className="field"><span>Oder hier einfügen</span>
            <textarea className="input" rows={5} value={text} onChange={(e) => setText(e.target.value)} onPaste={(e) => { const t = e.clipboardData.getData('text'); if (t) { e.preventDefault(); setText(t); lesen(t); } }}
              placeholder={'BEGIN:VCALENDAR …\noder https://… / webcal://…'} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13 }} spellCheck={false} autoCapitalize="off" />
          </label>
          {text.trim() && <button type="button" className="btn ghost small" disabled={busy} onClick={() => lesen(text)}>{busy ? 'Lade …' : 'Auslesen'}</button>}
        </>
      )}
      {err && <div className="err" role="alert">{err}</div>}
      {parsed && (
        <>
          <div className="field"><span>{liste.length === 1 ? 'Gefunden' : `${liste.length} Termine gefunden`}</span>
            {liste.slice(0, 40).map((e, i) => (
              <button key={i} type="button" className="row" onClick={() => toggle(i)} aria-pressed={!aus.has(i)} style={{ opacity: aus.has(i) ? 0.5 : 1 }}>
                {liste.length > 1 && <Check on={!aus.has(i)} />}
                <span className="row-main">
                  <span className="row-title">{e.title}</span>
                  <span className="small">{shortLabel(e.start_date)}{e.end_date ? ` – ${shortLabel(e.end_date)}` : ''} · {e.all_day ? 'ganztägig' : `${hm(e.from_time)}${e.to_time ? `–${hm(e.to_time)}` : ''}`}{e.rep !== 'keine' ? ` · ${e.rep}` : ''}{e.note ? ` · ${e.note.slice(0, 60)}` : ''}</span>
                </span>
              </button>
            ))}
            {liste.length > 40 && <div className="small">… und {liste.length - 40} weitere (werden mit übernommen, wenn ausgewählt)</div>}
            {aus.size > 0 && <div className="small">Abgewählte (z. B. schon vorhandene) werden übersprungen.</div>}
          </div>
          {arbeit ? (
            <label className="toggle-row">
              <span><span style={{ fontWeight: 600 }}>Für die Familie wichtig</span><span className="small" style={{ display: 'block' }}>Erscheint dann auch im Familienkalender</span></span>
              <input type="checkbox" checked={familie} onChange={(e) => setFamilie(e.target.checked)} style={{ width: 24, height: 24 }} />
            </label>
          ) : (
            <div className="field"><span>Für wen?</span><ChipPick options={opts} value={who} onPick={pickWho} multi /></div>
          )}
          <button type="button" className="btn ghost small" onClick={() => { setParsed(null); setText(''); }}>Andere Datei</button>
        </>
      )}
    </Sheet>
  );
}
