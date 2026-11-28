import { useState } from 'react';
import { supabase, run } from '../data.js';
import { Icon, Sheet } from '../ui.jsx';
import { shortLabel, diffDays } from '../lib/dates.js';

// Klassenleitung: Klassenliste (nur Kürzel) und Rücklauf (wer hat Zettel/Geld/Einverständnis abgegeben?).
// Alles nur für die angemeldete Person sichtbar (RLS „nur_ich“).

const nachSort = (a, b) => a.sort - b.sort || a.kuerzel.localeCompare(b.kuerzel, 'de');
const euro = (n) => `${Number(n).toLocaleString('de-DE', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`;

export function ruecklaufStand(ctx, r) {
  const kinder = ctx.data.workSchueler.rows.filter((s) => s.klasse_id === r.klasse_id);
  const da = new Set(ctx.data.workRuecklaufStatus.rows.filter((x) => x.ruecklauf_id === r.id).map((x) => x.schueler_id));
  const fehlt = kinder.filter((s) => !da.has(s.id)).sort(nachSort);
  return { gesamt: kinder.length, da: kinder.length - fehlt.length, fehlt };
}

// Karte für „Arbeit → Heute“: offene Rückläufe mit Frist in den nächsten 7 Tagen (oder überfällig)
export function RuecklaufHeute({ ctx, onOpen }) {
  const offen = ctx.data.workRuecklauf.rows.filter((r) => !r.abgeschlossen_at && r.frist && diffDays(ctx.day, r.frist) <= 7)
    .map((r) => ({ r, st: ruecklaufStand(ctx, r) })).filter(({ st }) => st.fehlt.length).sort((a, b) => a.r.frist.localeCompare(b.r.frist));
  if (!offen.length) return null;
  return (
    <section className="card tight">
      <div className="h-label" style={{ padding: '12px 0 4px' }}>Rücklauf offen</div>
      {offen.map(({ r, st }) => (
        <button key={r.id} className="row" onClick={() => onOpen?.(r)}>
          <span className="row-main">
            <span className="row-title">{r.titel}</span>
            <span className="small">fehlt: {st.fehlt.map((s) => s.kuerzel).join(', ')} · bis {shortLabel(r.frist)}</span>
          </span>
          <span className="kl-zahl">{st.da}/{st.gesamt}</span>
        </button>
      ))}
      <div style={{ height: 6 }} />
    </section>
  );
}

export function KlassenSeite({ ctx }) {
  const klassen = [...ctx.data.workKlassen.rows].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const [wahl, setWahl] = useState(() => { try { return localStorage.getItem('klasse') || null; } catch { return null; } });
  const klasse = klassen.find((k) => k.id === wahl) || klassen[0];
  const waehlen = (id) => { setWahl(id); try { localStorage.setItem('klasse', id); } catch { /* egal */ } };
  const [neueKlasse, setNeueKlasse] = useState(klassen.length === 0 ? '' : null);
  const [liste, setListe] = useState(false);
  const [rl, setRl] = useState(null);

  const klasseAnlegen = async (e) => {
    e.preventDefault();
    const name = (neueKlasse || '').trim().slice(0, 30);
    if (!name) return;
    const res = await run(supabase.from('work_klassen').insert({ owner: ctx.me.id, name }).select('id').single(), ctx.fail);
    if (res) { ctx.data.workKlassen.reload(); waehlen(res.id); setNeueKlasse(null); setListe(true); }
  };

  if (!klasse) {
    return (
      <section className="card">
        <div className="card-title">Klassenleitung</div>
        <div className="sub">Lege deine Klasse an. Kinder werden nur mit Kürzel gespeichert – nur du siehst sie.</div>
        <form className="thema-neu" onSubmit={klasseAnlegen}>
          <input className="input" value={neueKlasse ?? ''} onChange={(e) => setNeueKlasse(e.target.value)} placeholder="z. B. 6a" maxLength={30} aria-label="Name der Klasse" autoFocus />
          <button className="btn" disabled={!(neueKlasse || '').trim()}>Anlegen</button>
        </form>
      </section>
    );
  }

  const kinder = ctx.data.workSchueler.rows.filter((s) => s.klasse_id === klasse.id).sort(nachSort);
  const rlAlle = ctx.data.workRuecklauf.rows.filter((r) => r.klasse_id === klasse.id);
  const rlOffen = rlAlle.filter((r) => !r.abgeschlossen_at).sort((a, b) => String(a.frist || '9999').localeCompare(String(b.frist || '9999')) || a.created_at.localeCompare(b.created_at));
  const rlFertig = rlAlle.filter((r) => r.abgeschlossen_at).sort((a, b) => b.abgeschlossen_at.localeCompare(a.abgeschlossen_at)).slice(0, 6);

  return (
    <div className="kl-seite">
      <div className="kl-kopf">
        <div className="chips">
          {klassen.map((k) => <button key={k.id} className={`chip${k.id === klasse.id ? ' on' : ''}`} aria-pressed={k.id === klasse.id} onClick={() => waehlen(k.id)}>{k.name}</button>)}
          {neueKlasse === null
            ? <button className="chip" onClick={() => setNeueKlasse('')}><Icon name="plus" size={14} />Klasse</button>
            : (
              <form className="thema-neu" onSubmit={klasseAnlegen} style={{ marginTop: 0 }}>
                <input className="input" value={neueKlasse} onChange={(e) => setNeueKlasse(e.target.value)} placeholder="z. B. 6b" maxLength={30} aria-label="Name der neuen Klasse" autoFocus />
                <button className="icon-btn" aria-label="Klasse anlegen" disabled={!neueKlasse.trim()}><Icon name="plus" size={18} /></button>
              </form>
            )}
        </div>
      </div>

      <section className="card tight">
        <div className="card-head" style={{ padding: '10px 0 6px' }}>
          <div className="card-title">Rücklauf · {klasse.name}</div>
          <button className="icon-btn" aria-label="Neuer Rücklauf" onClick={() => setRl({ klasse_id: klasse.id })} disabled={!kinder.length}><Icon name="plus" size={18} /></button>
        </div>
        {!kinder.length && <div className="small" style={{ paddingBottom: 10 }}>Erst die Klassenliste anlegen.</div>}
        {kinder.length > 0 && rlOffen.length === 0 && <div className="empty" style={{ padding: '6px 0 12px' }}>Nichts offen. Mit + z. B. „Einverständnis Ausflug“ oder „Geld Theater“ anlegen.</div>}
        {rlOffen.map((r) => {
          const st = ruecklaufStand(ctx, r);
          const tage = r.frist ? diffDays(ctx.day, r.frist) : null;
          return (
            <button key={r.id} className="row kl-rl" onClick={() => setRl(r)}>
              <span className="row-main">
                <span className="row-title">{r.titel}{r.betrag ? ` · ${euro(r.betrag)}` : ''}</span>
                <span className="small">{[r.frist && (tage < 0 ? `${-tage} T. überfällig` : `bis ${shortLabel(r.frist)}`), st.fehlt.length ? `fehlt: ${st.fehlt.slice(0, 8).map((s) => s.kuerzel).join(', ')}${st.fehlt.length > 8 ? ' …' : ''}` : 'alle da ✓'].filter(Boolean).join(' · ')}</span>
                <span className="frist-bar"><span style={{ width: `${st.gesamt ? (st.da / st.gesamt) * 100 : 0}%` }} /></span>
              </span>
              <span className={`kl-zahl${st.fehlt.length ? '' : ' fertig'}`}>{st.da}/{st.gesamt}</span>
            </button>
          );
        })}
        {rlFertig.length > 0 && (
          <details className="kl-alt">
            <summary className="small">Abgeschlossen ({rlFertig.length})</summary>
            {rlFertig.map((r) => <button key={r.id} className="row" onClick={() => setRl(r)}><span className="row-main"><span className="row-title" style={{ opacity: 0.6 }}>{r.titel}</span></span></button>)}
          </details>
        )}
        <div style={{ height: 6 }} />
      </section>

      <section className="card tight">
        <div className="card-head" style={{ padding: '10px 0 6px' }}>
          <div className="card-title">Klassenliste <span className="small">({kinder.length})</span></div>
          <button className="btn ghost small" onClick={() => setListe(true)}>{kinder.length ? 'Bearbeiten' : 'Anlegen'}</button>
        </div>
        {kinder.length > 0
          ? <div className="kl-grid">{kinder.map((s) => <span key={s.id} className="kl-kind">{s.kuerzel}</span>)}</div>
          : <div className="small" style={{ paddingBottom: 10 }}>Nur Kürzel, z. B. „AK“ – keine Namen.</div>}
        <div style={{ height: 8 }} />
      </section>

      {liste && <ListeSheet ctx={ctx} klasse={klasse} kinder={kinder} onClose={() => setListe(false)} />}
      {rl && <RuecklaufSheet ctx={ctx} r={rl} kinder={kinder} onClose={() => setRl(null)} />}
    </div>
  );
}

function ListeSheet({ ctx, klasse, kinder, onClose }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const neu = [...new Set(text.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean))]
    .filter((k) => !kinder.some((s) => s.kuerzel.toLowerCase() === k.toLowerCase()));
  const zuLang = neu.filter((k) => k.length > 8);
  const hinzu = async () => {
    if (!neu.length || zuLang.length) return;
    setBusy(true);
    const start = kinder.reduce((m, s) => Math.max(m, s.sort), 0) + 1;
    const ok = await run(supabase.from('work_schueler').insert(neu.map((k, i) => ({ owner: ctx.me.id, klasse_id: klasse.id, kuerzel: k, sort: start + i }))), ctx.fail);
    setBusy(false);
    if (ok) { setText(''); ctx.data.workSchueler.reload(); ctx.say(`${neu.length} hinzugefügt`); }
  };
  const weg = async (s) => {
    if (!window.confirm(`${s.kuerzel} aus der Klasse entfernen? Auch alle Häkchen im Rücklauf gehen verloren.`)) return;
    if (await run(supabase.from('work_schueler').delete().eq('id', s.id), ctx.fail)) { ctx.data.workSchueler.reload(); ctx.data.workRuecklaufStatus.reload(); }
  };
  const klasseLoeschen = async () => {
    if (!window.confirm(`Klasse ${klasse.name} mit Liste und allen Rückläufen löschen?`)) return;
    if (await run(supabase.from('work_klassen').delete().eq('id', klasse.id), ctx.fail)) { ctx.data.workKlassen.reload(); ctx.data.workSchueler.reload(); ctx.data.workRuecklauf.reload(); onClose(); }
  };
  return (
    <Sheet title={`Klassenliste ${klasse.name}`} onClose={onClose}
      actions={<>
        <button className="btn" disabled={busy || !neu.length || zuLang.length > 0} onClick={hinzu}>{neu.length ? `${neu.length} hinzufügen` : 'Fertig'}</button>
        <button className="ein-del" onClick={klasseLoeschen}><Icon name="trash" size={16} />Klasse löschen</button>
      </>}>
      <label className="field"><span>Kürzel hinzufügen</span>
        <textarea className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={'AK\nBM\nCD …\n(eins pro Zeile oder mit Komma)'} autoCapitalize="characters" spellCheck={false} autoFocus={!kinder.length} />
      </label>
      {zuLang.length > 0 && <div className="err">Höchstens 8 Zeichen: {zuLang.join(', ')}</div>}
      <div className="small">Bitte keine vollen Namen – Kürzel reichen.</div>
      {kinder.length > 0 && (
        <div className="field"><span>In der Liste ({kinder.length})</span>
          <div className="kl-grid">{kinder.map((s) => (
            <span key={s.id} className="kl-kind mit-x">{s.kuerzel}<button aria-label={`${s.kuerzel} entfernen`} onClick={() => weg(s)}><Icon name="x" size={12} /></button></span>
          ))}</div>
        </div>
      )}
    </Sheet>
  );
}

const VORSCHLAEGE = ['Einverständnis Ausflug', 'Geld Klassenkasse', 'Elternbrief unterschrieben', 'Zeugnis unterschrieben', 'Anmeldung Elternsprechtag'];

function RuecklaufSheet({ ctx, r, kinder, onClose }) {
  const neu = !r.id;
  const [f, setF] = useState({ titel: r.titel ?? '', frist: r.frist ?? '', betrag: r.betrag ?? '' });
  const [kopiert, setKopiert] = useState(false);
  const status = ctx.data.workRuecklaufStatus.rows.filter((x) => x.ruecklauf_id === r.id);
  const da = new Set(status.map((x) => x.schueler_id));
  const fehlt = kinder.filter((s) => !da.has(s.id));
  const ok = f.titel.trim();
  const speichern = async () => {
    if (!ok) return;
    const row = { titel: f.titel.trim().slice(0, 160), frist: f.frist || null, betrag: f.betrag === '' ? null : Math.max(0, Number(String(f.betrag).replace(',', '.')) || 0) };
    const res = neu
      ? await run(supabase.from('work_ruecklauf').insert({ ...row, owner: ctx.me.id, klasse_id: r.klasse_id }), ctx.fail)
      : await run(supabase.from('work_ruecklauf').update(row).eq('id', r.id), ctx.fail);
    if (res) { ctx.data.workRuecklauf.reload(); onClose(); }
  };
  const toggle = async (s) => {
    const key = (x) => `${x.ruecklauf_id}|${x.schueler_id}`;
    if (da.has(s.id)) {
      ctx.data.workRuecklaufStatus.local((rows) => rows.filter((x) => key(x) !== `${r.id}|${s.id}`));
      if (!await run(supabase.from('work_ruecklauf_status').delete().eq('ruecklauf_id', r.id).eq('schueler_id', s.id), ctx.fail)) ctx.data.workRuecklaufStatus.reload();
    } else {
      const row = { ruecklauf_id: r.id, schueler_id: s.id, owner: ctx.me.id, erhalten_at: new Date().toISOString() };
      ctx.data.workRuecklaufStatus.local((rows) => [...rows, row]);
      if (!await run(supabase.from('work_ruecklauf_status').insert(row), ctx.fail)) ctx.data.workRuecklaufStatus.reload();
    }
  };
  const alleDa = async () => {
    const rows = fehlt.map((s) => ({ ruecklauf_id: r.id, schueler_id: s.id, owner: ctx.me.id }));
    if (rows.length && await run(supabase.from('work_ruecklauf_status').insert(rows), ctx.fail)) ctx.data.workRuecklaufStatus.reload();
  };
  const abschliessen = async () => {
    const v = r.abgeschlossen_at ? null : new Date().toISOString();
    if (await run(supabase.from('work_ruecklauf').update({ abgeschlossen_at: v }).eq('id', r.id), ctx.fail)) { ctx.data.workRuecklauf.reload(); ctx.say(v ? 'Abgeschlossen' : 'Wieder offen'); onClose(); }
  };
  const loesch = async () => {
    if (!window.confirm(`Rücklauf „${r.titel}“ löschen?`)) return;
    if (await run(supabase.from('work_ruecklauf').delete().eq('id', r.id), ctx.fail)) { ctx.data.workRuecklauf.reload(); onClose(); }
  };
  const fehltText = `${r.titel}: Es fehlt noch von ${fehlt.map((s) => s.kuerzel).join(', ')}.`;
  const kopieren = async () => { try { await navigator.clipboard.writeText(fehltText); setKopiert(true); } catch { ctx.fail('Kopieren ging nicht.'); } };
  return (
    <Sheet title={neu ? 'Neuer Rücklauf' : r.titel} onClose={onClose}
      actions={<>
        {neu ? <button className="btn" disabled={!ok} onClick={speichern}>Anlegen</button> : <button className="btn" onClick={onClose}>Fertig</button>}
        {!neu && <button className="btn ghost" onClick={abschliessen}>{r.abgeschlossen_at ? 'Wieder öffnen' : 'Abschließen'}</button>}
        {!neu && <button className="ein-del" onClick={loesch}><Icon name="trash" size={16} />Löschen</button>}
      </>}>
      {neu && (
        <>
          <label className="field"><span>Was soll zurückkommen?</span>
            <div className="chips" style={{ marginBottom: 8 }}>{VORSCHLAEGE.map((v) => <button key={v} type="button" className={`chip${f.titel === v ? ' on' : ''}`} onClick={() => setF({ ...f, titel: v })}>{v}</button>)}</div>
            <input className="input" value={f.titel} onChange={(e) => setF({ ...f, titel: e.target.value })} maxLength={160} placeholder="z. B. Einverständnis Theaterbesuch" />
          </label>
          <div className="two">
            <label className="field"><span>Bis wann?</span><input className="input" type="date" value={f.frist} onChange={(e) => setF({ ...f, frist: e.target.value })} /></label>
            <label className="field"><span>Betrag (optional)</span><input className="input" inputMode="decimal" value={f.betrag} onChange={(e) => setF({ ...f, betrag: e.target.value })} placeholder="z. B. 8,50" /></label>
          </div>
        </>
      )}
      {!neu && (
        <>
          <div className="kl-stand">
            <b>{kinder.length - fehlt.length} von {kinder.length}</b> da{r.betrag ? ` · ${euro((kinder.length - fehlt.length) * r.betrag)} von ${euro(kinder.length * r.betrag)}` : ''}{r.frist ? ` · bis ${shortLabel(r.frist)}` : ''}
          </div>
          <div className="small">Antippen = abgegeben.</div>
          <div className="kl-grid gross">
            {kinder.map((s) => (
              <button key={s.id} className={`kl-kind tap${da.has(s.id) ? ' da' : ''}`} aria-pressed={da.has(s.id)} onClick={() => toggle(s)}>{s.kuerzel}</button>
            ))}
          </div>
          {fehlt.length > 0 && (
            <div className="field" style={{ marginTop: 10 }}><span>Fehlt noch ({fehlt.length})</span>
              <div className="small kl-fehlt">{fehlt.map((s) => s.kuerzel).join(', ')}</div>
              <div className="chips">
                <button type="button" className="btn ghost small" onClick={kopieren}><Icon name="copy" size={16} />{kopiert ? 'Kopiert ✓' : 'Als Text kopieren'}</button>
                <button type="button" className="btn ghost small" onClick={alleDa}>Alle als da markieren</button>
              </div>
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}
