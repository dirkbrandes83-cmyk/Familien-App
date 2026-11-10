import { useState } from 'react';
import { supabase, run } from '../data.js';
import { Icon, Sheet, Check } from '../ui.jsx';
import { shortLabel } from '../lib/dates.js';

// Elternbrief scannen: Foto/PDF → Vorschläge prüfen → übernehmen.

async function fileToPayload(file) {
  if (file.type === 'application/pdf') {
    if (file.size > 8_000_000) throw new Error('Das PDF ist zu groß (max. 8 MB).');
    return { media_type: 'application/pdf', data: await toB64(file) };
  }
  // Fotos verkleinern: schneller, günstiger, gleich gut lesbar
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error('Das Bild konnte nicht gelesen werden.');
  const max = 1800;
  const f = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * f);
  c.height = Math.round(bmp.height * f);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
  return { media_type: 'image/jpeg', data: await toB64(blob) };
}
function toB64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

const valid = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
const time = (t) => (/^\d{2}:\d{2}$/.test(t || '') ? t : null);
const whoOf = (w) => (w === 'jonte' || w === 'emil' ? [w] : w === 'eltern' ? ['dirk', 'catrin'] : ['jonte', 'emil']);
const kidsOf = (k) => (k === 'jonte' || k === 'emil' ? [k] : ['jonte', 'emil']);

export default function Scan({ ctx, onClose }) {
  const [step, setStep] = useState('pick'); // pick | busy | review | done
  const [err, setErr] = useState('');
  const [res, setRes] = useState(null);
  const [items, setItems] = useState([]);

  const pick = async (file) => {
    if (!file) return;
    setErr(''); setStep('busy');
    try {
      const payload = await fileToPayload(file);
      const { data, error } = await supabase.functions.invoke('brief-scan', { body: payload });
      if (error) {
        let msg = 'Der Scan hat nicht geklappt.';
        try { msg = (await error.context.json()).error || msg; } catch { /* Standardtext */ }
        throw new Error(msg);
      }
      setRes(data);
      setItems([
        ...data.termine.filter((t) => valid(t.datum)).map((t, i) => ({ key: `t${i}`, kind: 'termin', on: true, text: t.titel, date: t.datum, from: time(t.von), to: time(t.bis), who: t.wer })),
        ...data.mitbringen.filter((t) => valid(t.datum)).map((t, i) => ({ key: `m${i}`, kind: 'mit', on: true, text: t.text, date: t.datum, who: t.kind })),
        ...data.fristen.filter((t) => valid(t.datum)).map((t, i) => ({ key: `f${i}`, kind: 'frist', on: true, text: t.text, date: t.datum, who: 'eltern' })),
      ]);
      setStep('review');
    } catch (e) {
      setErr(e.message);
      setStep('pick');
    }
  };

  const set = (key, p) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));

  const save = async () => {
    const on = items.filter((x) => x.on && x.text.trim() && valid(x.date));
    const events = on.filter((x) => x.kind !== 'mit').map((x) => ({
      title: x.kind === 'frist' ? `Frist: ${x.text.trim()}` : x.text.trim(),
      kind: x.kind === 'frist' ? 'frist' : 'termin',
      who: x.kind === 'frist' ? ['dirk', 'catrin'] : whoOf(x.who),
      start_date: x.date,
      all_day: x.kind === 'frist' || !x.from,
      from_time: x.kind === 'frist' ? null : x.from,
      to_time: x.kind === 'frist' ? null : x.to,
      note: res.zusammenfassung ? `Aus Elternbrief: ${res.zusammenfassung}`.slice(0, 1000) : 'Aus Elternbrief',
      src: 'scan', created_by: ctx.me.id,
    }));
    const packs = on.filter((x) => x.kind === 'mit').flatMap((x) => kidsOf(x.who).map((kid) => ({ kid, on_date: x.date, art: 'mit', text: x.text.trim(), by_who: ctx.me.id })));
    let ok = true;
    if (events.length) ok = !!(await run(supabase.from('events').insert(events), ctx.fail)) && ok;
    if (packs.length) ok = !!(await run(supabase.from('pack_items').insert(packs), ctx.fail)) && ok;
    if (ok) { ctx.say(`${on.length} ${on.length === 1 ? 'Eintrag' : 'Einträge'} übernommen`); onClose(); }
  };

  const label = { termin: 'Termin', mit: 'Mitbringen', frist: 'Frist' };
  const whoText = (w) => ({ jonte: 'Jonte', emil: 'Emil', beide: 'beide Kinder', eltern: 'Eltern', unklar: 'unklar' }[w] ?? w);
  const chosen = items.filter((x) => x.on).length;

  return (
    <Sheet title="Elternbrief scannen" onClose={onClose}
      actions={step === 'review' && <button className="btn" onClick={save} disabled={!chosen}>{chosen ? `${chosen} übernehmen` : 'Nichts ausgewählt'}</button>}>
      {step === 'pick' && (
        <>
          <div className="sub">Foto vom Brief machen oder ein PDF wählen. Die KI schlägt Termine, Mitbringen und Fristen vor – du prüfst, bevor etwas übernommen wird. Das Bild wird nicht gespeichert.</div>
          <label className="btn" style={{ position: 'relative' }}>
            <Icon name="upload" size={18} />Foto aufnehmen
            <input type="file" accept="image/*" capture="environment" onChange={(e) => pick(e.target.files[0])} style={{ position: 'absolute', inset: 0, opacity: 0 }} />
          </label>
          <label className="btn ghost" style={{ position: 'relative' }}>
            Foto oder PDF auswählen
            <input type="file" accept="image/*,application/pdf" onChange={(e) => pick(e.target.files[0])} style={{ position: 'absolute', inset: 0, opacity: 0 }} />
          </label>
          {err && <div className="err" role="alert">{err}</div>}
        </>
      )}
      {step === 'busy' && <div className="card" style={{ alignItems: 'center', padding: 28 }}><div style={{ fontWeight: 700 }}>Lese den Brief …</div><div className="small">Das dauert ein paar Sekunden.</div></div>}
      {step === 'review' && res && (
        <>
          <section className="card">
            <div style={{ fontWeight: 700 }}>{res.zusammenfassung || 'Brief gelesen'}</div>
            <div className="small">Betrifft: {whoText(res.fuer)}</div>
            {res.hinweise.length > 0 && <ul style={{ margin: 0, paddingLeft: 18 }} className="sub">{res.hinweise.map((h, i) => <li key={i}>{h}</li>)}</ul>}
          </section>
          {items.length === 0 && <div className="card empty">Keine Termine, Fristen oder Mitbringsel gefunden.</div>}
          {items.map((x) => (
            <section key={x.key} className="card" style={{ gap: 6, opacity: x.on ? 1 : 0.55 }}>
              <button className="row" style={{ borderTop: 'none', minHeight: 40, padding: 0 }} onClick={() => set(x.key, { on: !x.on })} aria-pressed={x.on}>
                <Check on={x.on} />
                <span className="row-main"><span className="tag" style={{ alignSelf: 'flex-start' }}>{label[x.kind]} · {whoText(x.who)}</span></span>
              </button>
              <input className="input" value={x.text} onChange={(e) => set(x.key, { text: e.target.value })} aria-label="Text" maxLength={200} />
              <input className="input" type="date" value={x.date} onChange={(e) => set(x.key, { date: e.target.value })} aria-label={`Datum, bisher ${shortLabel(x.date)}`} />
              {x.kind === 'termin' && (
                <div className="two">
                  <input className="input" type="time" value={x.from || ''} onChange={(e) => set(x.key, { from: e.target.value || null })} aria-label="Beginn" />
                  <input className="input" type="time" value={x.to || ''} onChange={(e) => set(x.key, { to: e.target.value || null })} aria-label="Ende" />
                </div>
              )}
            </section>
          ))}
          <div className="small">Termine landen im Kalender, Mitbringen auf der Einpackliste, Fristen als Frist für euch beide.</div>
        </>
      )}
    </Sheet>
  );
}
