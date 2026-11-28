import { useState } from 'react';
import { supabase, run } from '../data.js';
import { Icon, Check, Sheet, Seg, useBreit } from '../ui.jsx';
import { TerminSheet } from './Arbeit.jsx';
import { addDays, mondayOf, shortLabel, hm, expand, WD, WDL, weekday, diffDays } from '../lib/dates.js';

// Arbeitsbereich, Teil 2: Stundenplan, Fristen mit Vorlauf-To-dos, Besprechungsprotokolle.
// Alles nur für die angemeldete Person sichtbar (RLS „nur_ich“).

const minuten = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const jetztMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const stundenAm = (rows, d) => rows.filter((s) => s.wochentag === weekday(d) + 1).sort((a, b) => a.von.localeCompare(b.von));
const faelltAus = (s, d) => (s.ausfall || []).includes(d);
// Stundenplan-Abos (z. B. Untis): ihre Termine erscheinen nicht im Kalender, sondern hier
export const stundenplanAbos = (ctx) => new Set(ctx.data.subs.rows.filter((x) => x.art === 'stundenplan').map((x) => x.id));
export const istStunde = (ctx, ev) => !!ev.sub_id && stundenplanAbos(ctx).has(ev.sub_id);
// Untis-Kürzel → lesbare Namen (eigene Anpassungen in settings „untis_namen“)
export const UNTIS_NAMEN = { LZ: 'Lernzeit', VER: 'Vertretung', Coach: 'Coaching', 'WP Hand': 'Wahlpflicht Hand' };
export const untisNamen = (ctx) => ({ ...UNTIS_NAMEN, ...(ctx.data.settings.rows.find((x) => x.key === 'untis_namen')?.value || {}) });
export function untisName(namen, t) {
  if (namen[t]) return namen[t];
  const p = /^P-(.+)$/.exec(t); // P-Treppenhaus → Aufsicht Treppenhaus
  return p ? `Aufsicht ${p[1]}` : t;
}
// Untis-Notiz „B2.5 · 6a; 6b Bs; Kl“ → Raum und Klassen
const ausUntis = (namen) => (o) => {
  const note = o.ev.note || '';
  const [vorn, hinten] = note.includes(' · ') ? note.split(' · ') : ['', note];
  const klassen = (hinten.match(/\b\d{1,2}[a-zA-Z]{1,2}\b/g) || []).join(', ');
  return { id: `${o.ev.id}|${o.date}`, von: o.ev.from_time || '00:00', bis: o.ev.to_time || o.ev.from_time || '00:00', fach: untisName(namen, o.ev.title), kuerzel: o.ev.title, klasse: klassen || null, raum: vorn || null, notiz: null, ausfall: [], _ev: o.ev, _date: o.date };
};
// Alle Stunden eines Datums: aus dem Untis-Abo plus selbst eingetragene
export function stundenAmDatum(ctx, d) {
  const abos = stundenplanAbos(ctx);
  const untis = abos.size ? expand(ctx.data.workEvents.rows.filter((e) => e.sub_id && abos.has(e.sub_id) && !e.all_day), d, d).map(ausUntis(untisNamen(ctx))) : [];
  return [...untis, ...stundenAm(ctx.data.workStunden.rows, d)].sort((a, b) => String(a.von).localeCompare(String(b.von)));
}
const zeit = (s) => `${hm(s.von)}–${hm(s.bis)}`;
const ortVon = (s) => [s.klasse, s.raum && `Raum ${s.raum}`].filter(Boolean).join(' · ');

/* ---------- Stundenplan ---------- */

// Karte für „Arbeit → Heute“: Unterricht des Tages, aktuelle/nächste Stunde hervorgehoben
export function UnterrichtHeute({ ctx }) {
  const [sheet, setSheet] = useState(null);
  const heute = stundenAmDatum(ctx, ctx.day);
  if (!heute.length) return null;
  const min = jetztMin();
  const aktiv = heute.filter((s) => !faelltAus(s, ctx.day));
  const jetzt = aktiv.find((s) => minuten(s.von) <= min && minuten(s.bis) > min);
  const naechste = aktiv.find((s) => minuten(s.von) > min);
  const fokus = jetzt || naechste;
  return (
    <section className="card tight">
      <div className="h-label" style={{ padding: '12px 0 4px' }}>Unterricht heute</div>
      {fokus && (
        <div className="sp-fokus">
          <span className="sp-fokus-tag">{jetzt ? 'Jetzt' : `In ${minuten(fokus.von) - min < 60 ? `${minuten(fokus.von) - min} Min.` : `ab ${hm(fokus.von)}`}`}</span>
          <b>{fokus.fach}</b>
          <span>{[ortVon(fokus), jetzt ? `bis ${hm(fokus.bis)}` : zeit(fokus)].filter(Boolean).join(' · ')}</span>
          {fokus.notiz && <span className="small">📝 {fokus.notiz}</span>}
          {fokus._ev && kursNotizen(ctx, fokus._ev, ctx.day).map((n) => <span key={n.id} className="small">📝 {n.text}</span>)}
        </div>
      )}
      {!fokus && <div className="empty" style={{ padding: '4px 0 8px' }}>Unterricht für heute geschafft.</div>}
      {heute.map((s) => {
        const vorbei = minuten(s.bis) <= min;
        const aus = faelltAus(s, ctx.day);
        return (
          <button key={s.id} className={`row sp-row${vorbei ? ' vorbei' : ''}${s === jetzt ? ' jetzt' : ''}`} onClick={() => setSheet(s)}>
            <span className="time">{hm(s.von)}</span>
            <span className="row-main"><span className="row-title" style={{ textDecoration: aus ? 'line-through' : undefined }}>{s.fach}{aus && ' – fällt aus'}</span>{ortVon(s) && <span className="small">{ortVon(s)}</span>}</span>
          </button>
        );
      })}
      <div style={{ height: 6 }} />
      {sheet && (sheet._ev ? <TerminSheet ctx={ctx} ev={sheet._ev} datum={sheet._date} onClose={() => setSheet(null)} /> : <StundeSheet ctx={ctx} s={sheet} datum={ctx.day} onClose={() => setSheet(null)} />)}
    </section>
  );
}

export function StundenplanSeite({ ctx }) {
  const breit = useBreit();
  if (breit) return <StundenplanWoche ctx={ctx} />;
  return <StundenplanTag ctx={ctx} />;
}

// iPad: ganze Woche als Raster Mo–Fr
function WochenNav({ ctx, montag, setMontag, basis }) {
  const f = addDays(montag, 4);
  return (
    <div className="cal-row cal-week sp-nav">
      <button className="icon-btn" aria-label="Vorige Woche" onClick={() => setMontag(addDays(montag, -7))}><Icon name="left" size={18} /></button>
      <button className="cal-range" onClick={() => setMontag(basis)} disabled={montag === basis}>{montag === basis ? (basis === mondayOf(ctx.day) ? 'Diese Woche' : 'Nächste Woche') : `${shortLabel(montag).split(' ')[1]} – ${shortLabel(f).split(' ')[1]} · zurück`}</button>
      <button className="icon-btn" aria-label="Nächste Woche" onClick={() => setMontag(addDays(montag, 7))}><Icon name="chev" size={18} /></button>
    </div>
  );
}
const basisMontag = (ctx) => (weekday(ctx.day) > 4 ? addDays(mondayOf(ctx.day), 7) : mondayOf(ctx.day));
const oeffnen = (ctx, setSheet, s, datum) => setSheet(s._ev ? { ev: s._ev, datum: s._date } : { s, datum });
function SheetFuer({ ctx, sheet, onClose }) {
  if (!sheet) return null;
  if (sheet.ev) return <TerminSheet ctx={ctx} ev={sheet.ev} datum={sheet.datum} onClose={onClose} />;
  return <StundeSheet ctx={ctx} s={sheet.s} datum={sheet.datum} onClose={onClose} />;
}

function StundenplanWoche({ ctx }) {
  const [sheet, setSheet] = useState(null);
  const basis = basisMontag(ctx);
  const [montag, setMontag] = useState(basis);
  return (
    <>
      <UntisAenderungen ctx={ctx} />
      <WochenNav ctx={ctx} montag={montag} setMontag={setMontag} basis={basis} />
      <div className="sp-woche">
        {[0, 1, 2, 3, 4].map((i) => {
          const datum = addDays(montag, i);
          const list = stundenAmDatum(ctx, datum);
          return (
            <section key={i} className={`card tight sp-tag${datum === ctx.day ? ' heute' : ''}`}>
              <div className="card-head" style={{ padding: '10px 0 6px' }}>
                <div className="card-title">{WD[i]} <span className="small">{shortLabel(datum).split(' ')[1]}</span></div>
                <button className="icon-btn" aria-label={`Eigene Stunde am ${WDL[i]}`} onClick={() => setSheet({ s: { wochentag: i + 1 }, datum: null })}><Icon name="plus" size={18} /></button>
              </div>
              {list.length === 0 && <div className="small" style={{ padding: '4px 0 10px' }}>frei</div>}
              {list.map((s) => (
                <button key={s.id} className={`sp-block${faelltAus(s, datum) ? ' aus' : ''}${s._ev ? '' : ' manuell'}`} onClick={() => oeffnen(ctx, setSheet, s, datum)}>
                  <span className="sp-zeit">{zeit(s)}</span>
                  <b>{s.fach}</b>
                  {ortVon(s) && <span className="small">{ortVon(s)}</span>}
                  {s.notiz && <span className="small">📝 {s.notiz}</span>}
                  {erinnerungen(ctx, s) && <span className="small">{erinnerungen(ctx, s)}</span>}
                </button>
              ))}
              <div style={{ height: 8 }} />
            </section>
          );
        })}
      </div>
      <KuerzelPflege ctx={ctx} />
      <SheetFuer ctx={ctx} sheet={sheet} onClose={() => setSheet(null)} />
    </>
  );
}

function StundenplanTag({ ctx }) {
  const heuteWt = Math.min(weekday(ctx.day), 4);
  const [tag, setTag] = useState(heuteWt);
  const [sheet, setSheet] = useState(null);
  const basis = basisMontag(ctx);
  const [montag, setMontag] = useState(basis);
  const datum = addDays(montag, tag);
  const list = stundenAmDatum(ctx, datum);
  const proTag = (i) => stundenAmDatum(ctx, addDays(montag, i)).length;
  const untis = stundenplanAbos(ctx).size > 0;
  return (
    <>
      <UntisAenderungen ctx={ctx} />
      <WochenNav ctx={ctx} montag={montag} setMontag={setMontag} basis={basis} />
      <div className="li-seg"><Seg label="Wochentag" value={tag} onPick={setTag}
        options={[0, 1, 2, 3, 4].map((i) => [i, <span key={i} className="seg-txt">{WD[i]}<small className="sp-n">{proTag(i) || ''}</small></span>, `${WDL[i]}, ${proTag(i)} Stunden`])} /></div>
      <section className="card tight">
        <div className="card-head" style={{ padding: '10px 0 6px' }}>
          <div className="card-title">{WDL[tag]} <span className="small">{shortLabel(datum).split(' ')[1]}</span></div>
          <button className="icon-btn" aria-label="Eigene Stunde eintragen" onClick={() => setSheet({ s: { wochentag: tag + 1 }, datum: null })}><Icon name="plus" size={18} /></button>
        </div>
        {list.length === 0 && <div className="empty" style={{ padding: '8px 0 12px' }}>{untis ? 'Keine Stunden.' : 'Noch keine Stunden. Mit + eintragen.'}</div>}
        {list.map((s) => (
          <button key={s.id} className="row sp-row" onClick={() => oeffnen(ctx, setSheet, s, datum)}>
            <span className="time">{hm(s.von)}<span className="small" style={{ display: 'block', fontWeight: 500 }}>{hm(s.bis)}</span></span>
            <span className="row-main">
              <span className="row-title" style={{ textDecoration: faelltAus(s, datum) ? 'line-through' : undefined }}>{s.fach}{faelltAus(s, datum) && ' – fällt aus'}</span>
              {(ortVon(s) || s.notiz || erinnerungen(ctx, s)) && <span className="small">{[ortVon(s), s.notiz && `📝 ${s.notiz}`, erinnerungen(ctx, s)].filter(Boolean).join(' · ')}</span>}
            </span>
          </button>
        ))}
        <div style={{ height: 6 }} />
      </section>
      <KuerzelPflege ctx={ctx} />
      <div className="small" style={{ padding: '0 4px' }}>{untis ? 'Stunden kommen aus Untis. Antippen für Erinnerungen wie „Material vorbereiten“. Mit + trägst du eigene Stunden ein.' : 'Tipp: Zeiten, die du schon benutzt hast, kannst du beim Eintragen antippen.'}</div>
      <SheetFuer ctx={ctx} sheet={sheet} onClose={() => setSheet(null)} />
    </>
  );
}
// Untis-Kürzel umbenennen
function KuerzelPflege({ ctx }) {
  const [offen, setOffen] = useState(false);
  const abos = stundenplanAbos(ctx);
  const namen = untisNamen(ctx);
  const kuerzel = [...new Set(ctx.data.workEvents.rows.filter((e) => e.sub_id && abos.has(e.sub_id)).map((e) => e.title))].sort((a, b) => a.localeCompare(b, 'de'));
  const [f, setF] = useState({});
  if (!kuerzel.length) return null;
  const speichern = async () => {
    const eigen = { ...(ctx.data.settings.rows.find((x) => x.key === 'untis_namen')?.value || {}) };
    for (const [k, v] of Object.entries(f)) { if (v.trim()) eigen[k] = v.trim().slice(0, 60); else eigen[k] = k; }
    ctx.data.settings.local((rows) => [...rows.filter((x) => x.key !== 'untis_namen'), { key: 'untis_namen', value: eigen }]);
    if (await run(supabase.from('settings').upsert({ key: 'untis_namen', value: eigen }), ctx.fail)) { ctx.say('Namen gespeichert'); setOffen(false); setF({}); } else ctx.data.settings.reload();
  };
  if (!offen) return <button className="btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={() => setOffen(true)}>Untis-Kürzel umbenennen</button>;
  return (
    <section className="card tight">
      <div className="card-title" style={{ padding: '12px 0 6px' }}>Untis-Kürzel</div>
      {kuerzel.map((k) => (
        <label key={k} className="kz-zeile"><span>{k}</span>
          <input className="input" value={f[k] ?? untisName(namen, k)} onChange={(e) => setF({ ...f, [k]: e.target.value })} maxLength={60} />
        </label>
      ))}
      <div className="chips" style={{ padding: '8px 0 12px' }}>
        <button className="btn small" onClick={speichern} disabled={!Object.keys(f).length}>Speichern</button>
        <button className="btn ghost small" onClick={() => { setOffen(false); setF({}); }}>Abbrechen</button>
      </div>
    </section>
  );
}

// „🔔 1“ wenn zu dieser Untis-Stunde Erinnerungen offen sind
const erinnerungen = (ctx, s) => {
  if (!s._ev) return null;
  const n = ctx.data.workTodos.rows.filter((t) => t.termin_id === s._ev.id && !t.done_at && (!t.termin_am || t.termin_am === s._date)).length;
  const k = s._date >= ctx.day ? kursNotizen(ctx, s._ev, s._date).length : 0;
  return [n && `🔔 ${n}`, k && `📝 ${k}`].filter(Boolean).join(' ') || null;
};

function StundeSheet({ ctx, s, datum, onClose }) {
  const neu = !s.id;
  const rows = ctx.data.workStunden.rows;
  const [f, setF] = useState({ wochentag: s.wochentag ?? 1, von: s.von ? hm(s.von) : '', bis: s.bis ? hm(s.bis) : '', fach: s.fach ?? '', klasse: s.klasse ?? '', raum: s.raum ?? '', notiz: s.notiz ?? '' });
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const slots = [...new Set(rows.map((r) => `${hm(r.von)}–${hm(r.bis)}`))].sort();
  const faecher = [...new Set(rows.map((r) => r.fach))].sort((a, b) => a.localeCompare(b, 'de'));
  const ok = f.fach.trim() && f.von && f.bis && f.von < f.bis;
  const aus = datum && faelltAus(s, datum);
  const speichern = async () => {
    if (!ok) return;
    const row = { wochentag: f.wochentag, von: f.von, bis: f.bis, fach: f.fach.trim().slice(0, 60), klasse: f.klasse.trim().slice(0, 30) || null, raum: f.raum.trim().slice(0, 30) || null, notiz: f.notiz.trim().slice(0, 300) || null };
    const res = neu ? await run(supabase.from('work_stunden').insert({ ...row, owner: ctx.me.id }), ctx.fail) : await run(supabase.from('work_stunden').update(row).eq('id', s.id), ctx.fail);
    if (res) { ctx.data.workStunden.reload(); onClose(); }
  };
  const ausfall = async () => {
    const neuAus = aus ? s.ausfall.filter((d) => d !== datum) : [...(s.ausfall || []).filter((d) => d >= ctx.day), datum];
    if (await run(supabase.from('work_stunden').update({ ausfall: neuAus }).eq('id', s.id), ctx.fail)) { ctx.data.workStunden.reload(); ctx.say(aus ? 'Findet wieder statt' : `Fällt am ${shortLabel(datum)} aus`); onClose(); }
  };
  const loesch = async () => {
    if (await run(supabase.from('work_stunden').delete().eq('id', s.id), ctx.fail)) { ctx.data.workStunden.reload(); ctx.say('Stunde gelöscht'); onClose(); }
  };
  return (
    <Sheet title={neu ? 'Stunde eintragen' : `${s.fach} · ${WD[s.wochentag - 1]}`} onClose={onClose}
      actions={<>
        <button className="btn" disabled={!ok} onClick={speichern}>{neu ? 'Eintragen' : 'Speichern'}</button>
        {!neu && datum && <button className="btn ghost" onClick={ausfall}>{aus ? `Findet am ${shortLabel(datum)} doch statt` : `Fällt am ${shortLabel(datum)} aus`}</button>}
        {!neu && <button className="ein-del" onClick={loesch}><Icon name="trash" size={16} />Löschen</button>}
      </>}>
      <div className="field"><span>Tag</span>
        <div className="chips">{[1, 2, 3, 4, 5].map((w) => <button key={w} type="button" className={`chip${f.wochentag === w ? ' on' : ''}`} aria-pressed={f.wochentag === w} onClick={() => set({ wochentag: w })}>{WD[w - 1]}</button>)}</div>
      </div>
      <div className="field"><span>Zeit</span>
        {slots.length > 0 && <div className="chips" style={{ marginBottom: 8 }}>{slots.map((z) => { const [a, b] = z.split('–'); return <button key={z} type="button" className={`chip${f.von === a && f.bis === b ? ' on' : ''}`} onClick={() => set({ von: a, bis: b })}>{z}</button>; })}</div>}
        <div className="two">
          <input className="input" type="time" aria-label="Von" value={f.von} onChange={(e) => set({ von: e.target.value })} />
          <input className="input" type="time" aria-label="Bis" value={f.bis} onChange={(e) => set({ bis: e.target.value })} />
        </div>
      </div>
      <div className="field"><span>Fach / Was?</span>
        {faecher.length > 0 && <div className="chips" style={{ marginBottom: 8 }}>{faecher.map((x) => <button key={x} type="button" className={`chip${f.fach === x ? ' on' : ''}`} onClick={() => set({ fach: x })}>{x}</button>)}</div>}
        <input className="input" value={f.fach} onChange={(e) => set({ fach: e.target.value })} maxLength={60} placeholder="z. B. Deutsch, Lernzeit, Jahrgangsteam" autoFocus={neu && !faecher.length} />
      </div>
      <div className="two">
        <label className="field"><span>Klasse / Gruppe</span><input className="input" value={f.klasse} onChange={(e) => set({ klasse: e.target.value })} maxLength={30} placeholder="z. B. 6b" /></label>
        <label className="field"><span>Raum</span><input className="input" value={f.raum} onChange={(e) => set({ raum: e.target.value })} maxLength={30} placeholder="z. B. 2.14" /></label>
      </div>
      <label className="field"><span>Notiz (z. B. fürs nächste Mal)</span><input className="input" value={f.notiz} onChange={(e) => set({ notiz: e.target.value })} maxLength={300} placeholder="z. B. Kopien Kap. 3 mitbringen" /></label>
    </Sheet>
  );
}

/* ---------- Fristen ---------- */

const restText = (tage) => (tage < 0 ? `${-tage} T. drüber` : tage === 0 ? 'heute' : tage === 1 ? 'morgen' : `in ${tage} T.`);
const dringlich = (tage) => (tage < 0 ? 'rot' : tage <= 3 ? 'rot' : tage <= 14 ? 'gelb' : 'gruen');

// Karte für „Arbeit → Heute“: Fristen der nächsten 3 Wochen
export function FristenHeute({ ctx, onAlle }) {
  const bald = ctx.data.workFristen.rows.filter((x) => !x.erledigt_at && diffDays(ctx.day, x.datum) <= 21).sort((a, b) => a.datum.localeCompare(b.datum));
  if (!bald.length) return null;
  return (
    <section className="card tight">
      <div className="card-head" style={{ padding: '10px 0 4px' }}>
        <div className="h-label">Fristen</div>
        {onAlle && <button className="btn ghost small" onClick={onAlle}>Alle</button>}
      </div>
      {bald.map((x) => <FristZeile key={x.id} ctx={ctx} x={x} kompakt />)}
      <div style={{ height: 6 }} />
    </section>
  );
}

function FristZeile({ ctx, x, kompakt, onOpen }) {
  const tage = diffDays(ctx.day, x.datum);
  const schritte = ctx.data.workTodos.rows.filter((t) => t.frist_id === x.id);
  const fertig = schritte.filter((t) => t.done_at).length;
  return (
    <button className="row frist-row" onClick={onOpen} disabled={!onOpen}>
      <span className={`frist-rest ${x.erledigt_at ? 'gruen' : dringlich(tage)}`}>{x.erledigt_at ? '✓' : restText(tage)}</span>
      <span className="row-main">
        <span className="row-title" style={{ textDecoration: x.erledigt_at ? 'line-through' : undefined }}>{x.titel}</span>
        <span className="small">{[shortLabel(x.datum), !kompakt && x.kategorie, schritte.length > 0 && `${fertig}/${schritte.length} Schritte`].filter(Boolean).join(' · ')}</span>
        {schritte.length > 0 && <span className="frist-bar"><span style={{ width: `${(fertig / schritte.length) * 100}%` }} /></span>}
      </span>
    </button>
  );
}

function FristenListe({ ctx }) {
  const [sheet, setSheet] = useState(null);
  const [alte, setAlte] = useState(false);
  const rows = ctx.data.workFristen.rows;
  const offen = rows.filter((x) => !x.erledigt_at).sort((a, b) => a.datum.localeCompare(b.datum));
  const erledigt = rows.filter((x) => x.erledigt_at).sort((a, b) => b.datum.localeCompare(a.datum));
  return (
    <>
      <section className="card tight">
        <div className="card-head" style={{ padding: '10px 0 6px' }}>
          <div className="card-title">Fristen</div>
          <button className="icon-btn" aria-label="Neue Frist" onClick={() => setSheet({})}><Icon name="plus" size={18} /></button>
        </div>
        {offen.length === 0 && <div className="empty" style={{ padding: '8px 0 12px' }}>Keine offenen Fristen. Mit + z. B. „LEB-Abgabe“ eintragen.</div>}
        {offen.map((x) => <FristZeile key={x.id} ctx={ctx} x={x} onOpen={() => setSheet(x)} />)}
        {erledigt.length > 0 && <button className="btn ghost small" style={{ margin: '6px 0 10px' }} onClick={() => setAlte(!alte)}>{alte ? 'Erledigte ausblenden' : `${erledigt.length} erledigte zeigen`}</button>}
        {alte && erledigt.map((x) => <FristZeile key={x.id} ctx={ctx} x={x} onOpen={() => setSheet(x)} />)}
      </section>
      <RegelnKarte ctx={ctx} />
      {sheet && <FristSheet ctx={ctx} x={sheet} onClose={() => setSheet(null)} />}
    </>
  );
}

// Vorlagen für typische Vorlauf-Schritte
const VORLAGEN = [
  ['LEB / Zeugnisse', [['Kompetenzraster aktualisieren', 21], ['Texte entwerfen', 14], ['Korrekturlesen lassen', 7], ['Abgeben / ausdrucken', 1]]],
  ['Konferenz', [['Unterlagen sichten', 7], ['Tagesordnung / Beiträge vorbereiten', 3], ['Material ausdrucken', 1]]],
  ['Elternabend', [['Einladung verschicken', 14], ['Präsentation vorbereiten', 5], ['Raum & Liste klären', 2]]],
];

function FristSheet({ ctx, x, onClose }) {
  const neu = !x.id;
  const kats = [...new Set([...ctx.data.workFristen.rows, ...ctx.data.workTodos.rows].map((r) => r.kategorie).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  const [f, setF] = useState({ titel: x.titel ?? '', datum: x.datum ?? '', kategorie: x.kategorie ?? '', notiz: x.notiz ?? '' });
  const vorhandene = ctx.data.workTodos.rows.filter((t) => t.frist_id && t.frist_id === x.id).sort((a, b) => String(a.due).localeCompare(String(b.due)));
  const [schritte, setSchritte] = useState([]); // neue: [{ text, tage }]
  const set = (p) => setF((v) => ({ ...v, ...p }));
  const ok = f.titel.trim() && f.datum;
  const speichern = async () => {
    if (!ok) return;
    const row = { titel: f.titel.trim().slice(0, 160), datum: f.datum, kategorie: f.kategorie.trim().slice(0, 40) || null, notiz: f.notiz.trim() || null };
    const res = neu
      ? await run(supabase.from('work_fristen').insert({ ...row, owner: ctx.me.id }).select('id').single(), ctx.fail)
      : await run(supabase.from('work_fristen').update(row).eq('id', x.id).select('id').single(), ctx.fail);
    if (!res) return;
    const neue = schritte.filter((s) => s.text.trim());
    if (neue.length) {
      const todos = neue.map((s) => ({ owner: ctx.me.id, title: `${s.text.trim()} (${row.titel})`.slice(0, 160), due: addDays(f.datum, -Math.max(0, Number(s.tage) || 0)), kategorie: row.kategorie, frist_id: res.id }));
      await run(supabase.from('work_todos').insert(todos), ctx.fail);
    }
    ctx.data.workFristen.reload(); ctx.data.workTodos.reload();
    ctx.say(neue.length ? `Frist mit ${neue.length} Schritten gespeichert` : 'Frist gespeichert');
    onClose();
  };
  const erledigen = async () => {
    const v = x.erledigt_at ? null : new Date().toISOString();
    if (await run(supabase.from('work_fristen').update({ erledigt_at: v }).eq('id', x.id), ctx.fail)) { ctx.data.workFristen.reload(); ctx.say(v ? 'Frist erledigt' : 'Wieder offen'); onClose(); }
  };
  const loesch = async () => {
    if (!window.confirm(`Frist „${x.titel}“ samt ${vorhandene.length} Vorlauf-To-dos löschen?`)) return;
    if (await run(supabase.from('work_fristen').delete().eq('id', x.id), ctx.fail)) { ctx.data.workFristen.reload(); ctx.data.workTodos.reload(); ctx.say('Frist gelöscht'); onClose(); }
  };
  const abhaken = async (t) => {
    const v = t.done_at ? null : new Date().toISOString();
    ctx.data.workTodos.local((rows) => rows.map((r) => (r.id === t.id ? { ...r, done_at: v } : r)));
    if (!await run(supabase.from('work_todos').update({ done_at: v }).eq('id', t.id), ctx.fail)) ctx.data.workTodos.reload();
  };
  return (
    <Sheet title={neu ? 'Neue Frist' : x.titel} onClose={onClose}
      actions={<>
        <button className="btn" disabled={!ok} onClick={speichern}>{neu ? 'Eintragen' : 'Speichern'}</button>
        {!neu && <button className="btn ghost" onClick={erledigen}>{x.erledigt_at ? 'Wieder öffnen' : 'Frist erledigt ✓'}</button>}
        {!neu && <button className="ein-del" onClick={loesch}><Icon name="trash" size={16} />Löschen</button>}
      </>}>
      <label className="field"><span>Was?</span><input className="input" value={f.titel} onChange={(e) => set({ titel: e.target.value })} maxLength={160} autoFocus={neu} placeholder="z. B. LEB-Abgabe Jg. 6" /></label>
      <label className="field"><span>Bis wann?</span><input className="input" type="date" value={f.datum} onChange={(e) => set({ datum: e.target.value })} /></label>
      <div className="field"><span>Kategorie</span>
        {kats.length > 0 && <div className="chips" style={{ marginBottom: 8 }}>{kats.map((k) => <button key={k} type="button" className={`chip${f.kategorie === k ? ' on' : ''}`} onClick={() => set({ kategorie: f.kategorie === k ? '' : k })}>{k}</button>)}</div>}
        <input className="input" value={f.kategorie} onChange={(e) => set({ kategorie: e.target.value })} maxLength={40} placeholder="z. B. Jahrgang 6" />
      </div>
      {vorhandene.length > 0 && (
        <div className="field"><span>Vorlauf-Schritte</span>
          {vorhandene.map((t) => (
            <div key={t.id} className="row" style={{ minHeight: 40 }}>
              <button className="row-check" aria-label={`${t.title} erledigt`} onClick={() => abhaken(t)}><Check on={!!t.done_at} /></button>
              <span className="row-main"><span className="row-title" style={{ textDecoration: t.done_at ? 'line-through' : undefined }}>{t.title.replace(` (${x.titel})`, '')}</span><span className="small">bis {shortLabel(t.due)}</span></span>
            </div>
          ))}
        </div>
      )}
      <div className="field"><span>{vorhandene.length ? 'Weitere Schritte' : 'Vorlauf-Schritte (werden To-dos mit Frist)'}</span>
        {schritte.length === 0 && (
          <div className="chips" style={{ marginBottom: 8 }}>
            {VORLAGEN.map(([name, l]) => <button key={name} type="button" className="chip" onClick={() => setSchritte(l.map(([text, tage]) => ({ text, tage })))}>Vorlage: {name}</button>)}
          </div>
        )}
        {schritte.map((s, i) => (
          <div key={i} className="frist-schritt">
            <input className="input" value={s.text} onChange={(e) => setSchritte(schritte.map((y, j) => (j === i ? { ...y, text: e.target.value } : y)))} placeholder="Schritt" maxLength={120} />
            <input className="input" type="number" min="0" max="365" inputMode="numeric" value={s.tage} aria-label="Tage vorher" onChange={(e) => setSchritte(schritte.map((y, j) => (j === i ? { ...y, tage: e.target.value } : y)))} />
            <span className="small">T. vorher</span>
            <button type="button" className="icon-btn" aria-label="Schritt entfernen" onClick={() => setSchritte(schritte.filter((_, j) => j !== i))}><Icon name="x" size={16} /></button>
          </div>
        ))}
        <button type="button" className="btn ghost small" onClick={() => setSchritte([...schritte, { text: '', tage: 7 }])}><Icon name="plus" size={16} />Schritt</button>
        {f.datum && schritte.some((s) => s.text.trim()) && <div className="small" style={{ marginTop: 6 }}>Erster Schritt fällig: {shortLabel(addDays(f.datum, -Math.max(...schritte.filter((s) => s.text.trim()).map((s) => Number(s.tage) || 0))))}</div>}
      </div>
      <label className="field"><span>Notiz</span><textarea className="input" rows={2} value={f.notiz} onChange={(e) => set({ notiz: e.target.value })} maxLength={1000} /></label>
    </Sheet>
  );
}

/* ---------- Protokolle ---------- */

// Aufgaben im Text erkennen: Zeilen mit „- [ ]“, „TODO“, „→“ oder „@ich“
const AUFGABE = /^\s*(?:[-*•]\s*\[\s?\]\s*|todo:?\s+|→\s*|->\s*|@ich:?\s+)(.+)$/i;
export const aufgabenAus = (text) => String(text || '').split('\n').map((z) => z.match(AUFGABE)?.[1]?.trim()).filter(Boolean);

function ProtokollListe({ ctx }) {
  const [offen, setOffen] = useState(null);
  const [suche, setSuche] = useState('');
  const rows = [...ctx.data.workProtokolle.rows].sort((a, b) => b.datum.localeCompare(a.datum) || b.created_at.localeCompare(a.created_at));
  const q = suche.trim().toLowerCase();
  const list = q ? rows.filter((p) => `${p.titel} ${p.teilnehmer || ''} ${p.text}`.toLowerCase().includes(q)) : rows;
  return (
    <>
      <section className="card tight">
        <div className="card-head" style={{ padding: '10px 0 6px' }}>
          <div className="card-title">Besprechungen</div>
          <button className="icon-btn" aria-label="Neues Protokoll" onClick={() => setOffen({})}><Icon name="plus" size={18} /></button>
        </div>
        {rows.length > 4 && <input className="input" style={{ marginBottom: 6 }} value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Suchen …" aria-label="Protokolle durchsuchen" />}
        {rows.length === 0 && <div className="empty" style={{ padding: '8px 0 12px' }}>Noch keine Protokolle.</div>}
        {list.map((p) => {
          const auf = aufgabenAus(p.text).length;
          const angelegt = ctx.data.workTodos.rows.filter((t) => t.protokoll_id === p.id);
          return (
            <button key={p.id} className="row" onClick={() => setOffen(p)}>
              <span className="time" style={{ width: 52 }}>{shortLabel(p.datum).split(' ')[1]}</span>
              <span className="row-main">
                <span className="row-title">{p.titel}</span>
                <span className="small">{[p.teilnehmer, auf && `${angelegt.filter((t) => t.done_at).length}/${auf} Aufgaben erledigt`].filter(Boolean).join(' · ') || (p.text.split('\n')[0] || '').slice(0, 80)}</span>
              </span>
            </button>
          );
        })}
        <div style={{ height: 6 }} />
      </section>
      {offen && <ProtokollSheet ctx={ctx} p={offen} onClose={() => setOffen(null)} />}
    </>
  );
}

function ProtokollSheet({ ctx, p, onClose }) {
  const neu = !p.id;
  const [id, setId] = useState(p.id ?? null);
  const [f, setF] = useState({ titel: p.titel ?? '', datum: p.datum ?? ctx.day, teilnehmer: p.teilnehmer ?? '', text: p.text ?? '' });
  const set = (v) => setF((x) => ({ ...x, ...v }));
  const titelVorschlag = [...new Set(ctx.data.workProtokolle.rows.map((r) => r.titel))].slice(0, 6);
  const aufgaben = aufgabenAus(f.text);
  const angelegt = ctx.data.workTodos.rows.filter((t) => id && t.protokoll_id === id);
  const fehlend = aufgaben.filter((a) => !angelegt.some((t) => t.title === a.slice(0, 160)));
  const ok = f.titel.trim();
  const sichern = async () => {
    const row = { titel: f.titel.trim().slice(0, 160), datum: f.datum || ctx.day, teilnehmer: f.teilnehmer.trim() || null, text: f.text, updated_at: new Date().toISOString() };
    const res = id
      ? await run(supabase.from('work_protokolle').update(row).eq('id', id).select('id').single(), ctx.fail)
      : await run(supabase.from('work_protokolle').insert({ ...row, owner: ctx.me.id }).select('id').single(), ctx.fail);
    if (res) { setId(res.id); ctx.data.workProtokolle.reload(); }
    return res?.id;
  };
  const speichern = async () => { if (ok && await sichern()) { ctx.say('Protokoll gespeichert'); onClose(); } };
  const todosAnlegen = async () => {
    if (!ok) return;
    const pid = await sichern();
    if (!pid) return;
    const rows = fehlend.map((a) => ({ owner: ctx.me.id, title: a.slice(0, 160), note: `Aus: ${f.titel.trim()} (${shortLabel(f.datum)})`, protokoll_id: pid }));
    if (await run(supabase.from('work_todos').insert(rows), ctx.fail)) { ctx.data.workTodos.reload(); ctx.say(`${rows.length} To-do${rows.length === 1 ? '' : 's'} angelegt`); }
  };
  const einfuegen = (s) => set({ text: f.text + (f.text && !f.text.endsWith('\n') ? '\n' : '') + s });
  const loesch = async () => {
    if (!window.confirm(`Protokoll „${p.titel}“ löschen? Angelegte To-dos bleiben.`)) return;
    if (await run(supabase.from('work_protokolle').delete().eq('id', id), ctx.fail)) { ctx.data.workProtokolle.reload(); ctx.say('Protokoll gelöscht'); onClose(); }
  };
  return (
    <Sheet title={neu && !id ? 'Neues Protokoll' : f.titel || 'Protokoll'} onClose={onClose}
      actions={<>
        <button className="btn" disabled={!ok} onClick={speichern}>Speichern</button>
        {fehlend.length > 0 && <button className="btn ghost" disabled={!ok} onClick={todosAnlegen}>{fehlend.length} Aufgabe{fehlend.length === 1 ? '' : 'n'} als To-do anlegen</button>}
        {id && <button className="ein-del" onClick={loesch}><Icon name="trash" size={16} />Löschen</button>}
      </>}>
      <label className="field"><span>Besprechung</span>
        {neu && titelVorschlag.length > 0 && <div className="chips" style={{ marginBottom: 8 }}>{titelVorschlag.map((t) => <button key={t} type="button" className={`chip${f.titel === t ? ' on' : ''}`} onClick={() => set({ titel: t })}>{t}</button>)}</div>}
        <input className="input" value={f.titel} onChange={(e) => set({ titel: e.target.value })} maxLength={160} autoFocus={neu && !titelVorschlag.length} placeholder="z. B. Jahrgangsteam 6" />
      </label>
      <div className="two">
        <label className="field"><span>Datum</span><input className="input" type="date" value={f.datum} onChange={(e) => set({ datum: e.target.value })} /></label>
        <label className="field"><span>Wer war da?</span><input className="input" value={f.teilnehmer} onChange={(e) => set({ teilnehmer: e.target.value })} maxLength={300} placeholder="Kürzel" /></label>
      </div>
      <label className="field"><span>Notizen</span>
        <textarea className="input prot-text" rows={10} value={f.text} onChange={(e) => set({ text: e.target.value })} maxLength={20000} placeholder={'Stichpunkte …\n→ Aufgabe für mich (wird To-do)\n- [ ] auch so geht’s'} />
      </label>
      <div className="chips">
        <button type="button" className="chip" onClick={() => einfuegen('→ ')}>→ Aufgabe</button>
        <button type="button" className="chip" onClick={() => einfuegen('Beschluss: ')}>Beschluss</button>
        <button type="button" className="chip" onClick={() => einfuegen('Offen: ')}>Offene Frage</button>
      </div>
      {(aufgaben.length > 0 || angelegt.length > 0) && (
        <div className="field" style={{ marginTop: 10 }}><span>Aufgaben</span>
          {aufgaben.map((a) => {
            const t = angelegt.find((x) => x.title === a.slice(0, 160));
            return <div key={a} className="small ar-zeile">{t ? (t.done_at ? '✅' : '☑️ To-do') : '○ noch nicht angelegt'} · {a}</div>;
          })}
        </div>
      )}
    </Sheet>
  );
}

// Seite „Orga“: Fristen und Protokolle
export function OrgaSeite({ ctx }) {
  const breit = useBreit(1100);
  if (breit) return <div className="orga3"><div><FristenListe ctx={ctx} /></div><div><TeamSeite ctx={ctx} /></div><div><ProtokollListe ctx={ctx} /></div></div>;
  return <OrgaSchmal ctx={ctx} />;
}
function OrgaSchmal({ ctx }) {
  const [seg, setSeg] = useState(() => { try { return sessionStorage.getItem('orga') || 'fristen'; } catch { return 'fristen'; } });
  const pick = (s) => { setSeg(s); try { sessionStorage.setItem('orga', s); } catch { /* egal */ } };
  return (
    <>
      <div className="li-seg"><Seg label="Bereich" value={seg} onPick={pick}
        options={[['fristen', <span key="f" className="seg-txt"><Icon name="clock" size={20} />Fristen</span>, 'Fristen'], ['team', <span key="t" className="seg-txt"><Icon name="users" size={20} />Themen</span>, 'Themen für Teamsitzung und ESL'], ['protokolle', <span key="p" className="seg-txt"><Icon name="pencil" size={20} />Protokolle</span>, 'Protokolle']]} /></div>
      {seg === 'fristen' ? <FristenListe ctx={ctx} /> : seg === 'team' ? <TeamSeite ctx={ctx} /> : <ProtokollListe ctx={ctx} />}
    </>
  );
}


/* ---------- Besprechungen (Teamsitzung, ESL): Themenlisten ---------- */

export const BESPRECHUNG = { team: { label: 'Teamsitzung', mehr: 'Teamsitzungen' }, esl: { label: 'ESL', mehr: 'ESL-Sitzungen' } };
// Art der Besprechung: ausdrücklich gesetzt – oder (wenn nie gesetzt) am Titel erkannt
export function besprechungVon(ev) {
  if (ev.besprechung) return ev.besprechung === 'keine' ? null : ev.besprechung;
  const t = ev.title || '';
  if (/\bESL\b|erweiterte\s+schulleitung/i.test(t)) return 'esl';
  if (/team\s*sitzung|jahrgangsteam|teambesprechung|teamtreffen/i.test(t)) return 'team';
  return null;
}
export const istTeam = (ev) => !!besprechungVon(ev);
const offeneThemen = (ctx, art) => ctx.data.workThemen.rows.filter((t) => (t.art || 'team') === art && !t.termin_id && !t.besprochen_at).sort((a, b) => a.created_at.localeCompare(b.created_at));
export const themenVon = (ctx, ev, datum) => ctx.data.workThemen.rows.filter((t) => t.termin_id === ev.id && (!t.termin_am || t.termin_am === datum));
export const offeneZahl = (ctx, art) => offeneThemen(ctx, art).length;

async function themaNeu(ctx, text, art, termin, datum) {
  const row = { owner: ctx.me.id, text: text.trim().slice(0, 300), art, termin_id: termin?.id ?? null, termin_am: termin ? datum : null };
  if (await run(supabase.from('work_themen').insert(row), ctx.fail)) ctx.data.workThemen.reload();
}
async function themaSetzen(ctx, t, patch) {
  ctx.data.workThemen.local((rows) => rows.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
  if (!await run(supabase.from('work_themen').update(patch).eq('id', t.id), ctx.fail)) ctx.data.workThemen.reload();
}
async function themaWeg(ctx, t) {
  ctx.data.workThemen.local((rows) => rows.filter((x) => x.id !== t.id));
  if (await run(supabase.from('work_themen').delete().eq('id', t.id), ctx.fail)) ctx.say('Thema gelöscht', () => run(supabase.from('work_themen').insert(t), ctx.fail).then(() => ctx.data.workThemen.reload()));
  else ctx.data.workThemen.reload();
}

function ThemaEingabe({ ctx, art, termin, datum, placeholder }) {
  const [text, setText] = useState('');
  const add = async (e) => { e.preventDefault(); if (!text.trim()) return; await themaNeu(ctx, text, art, termin, datum); setText(''); };
  return (
    <form className="thema-neu" onSubmit={add}>
      <input className="input" value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder={placeholder || 'Neues Thema …'} aria-label={`Neues Thema ${BESPRECHUNG[art].label}`} />
      <button className="icon-btn" aria-label="Thema hinzufügen" disabled={!text.trim()}><Icon name="plus" size={18} /></button>
    </form>
  );
}

function ThemaZeile({ ctx, t, termin, datum }) {
  const besprochen = !!t.besprochen_at;
  const toggle = () => themaSetzen(ctx, t, besprochen
    ? { besprochen_at: null }
    : { besprochen_at: new Date().toISOString(), ...(termin && !t.termin_id ? { termin_id: termin.id, termin_am: datum } : {}) });
  return (
    <div className="row" style={{ minHeight: 44 }}>
      <button className="row-check" aria-label={`${t.text} besprochen`} onClick={toggle}><Check on={besprochen} /></button>
      <span className="row-main"><span className="row-title" style={{ textDecoration: besprochen ? 'line-through' : undefined, opacity: besprochen ? 0.6 : 1 }}>{t.text}</span></span>
      {termin && t.termin_id === termin.id && !besprochen && <button className="btn ghost small" onClick={() => themaSetzen(ctx, t, { termin_id: null, termin_am: null })} title="Zurück in die offene Liste">später</button>}
      <button className="icon-btn" aria-label="Thema löschen" onClick={() => themaWeg(ctx, t)}><Icon name="x" size={16} /></button>
    </div>
  );
}

// Im Termin einer Besprechung: Themen dieses Termins + alle offenen Themen derselben Art
export function TeamThemen({ ctx, ev, datum }) {
  const art = besprechungVon(ev) || 'team';
  const eigene = themenVon(ctx, ev, datum);
  const offen = offeneThemen(ctx, art);
  const alle = [...eigene, ...offen];
  const protokoll = async () => {
    const text = alle.map((t) => `• ${t.text}${t.besprochen_at ? ' ✓' : ''}`).join('\n') + '\n\n';
    const res = await run(supabase.from('work_protokolle').insert({ owner: ctx.me.id, titel: ev.title.slice(0, 160), datum, text }).select('id').single(), ctx.fail);
    if (res) { ctx.data.workProtokolle.reload(); ctx.say('Protokoll angelegt – unter Orga → Protokolle'); }
  };
  const schon = ctx.data.workProtokolle.rows.some((p) => p.datum === datum && p.titel === ev.title);
  return (
    <div className="field"><span>Themen {BESPRECHUNG[art].label} ({alle.filter((t) => !t.besprochen_at).length} offen)</span>
      {alle.length === 0 && <div className="small" style={{ padding: '4px 0' }}>Noch keine Themen gesammelt.</div>}
      {alle.map((t) => <ThemaZeile key={t.id} ctx={ctx} t={t} termin={ev} datum={datum} />)}
      <ThemaEingabe ctx={ctx} art={art} termin={ev} datum={datum} />
      {alle.length > 0 && !schon && <button type="button" className="btn ghost small" style={{ marginTop: 8 }} onClick={protokoll}><Icon name="pencil" size={16} />Protokoll mit diesen Themen starten</button>}
    </div>
  );
}

// Orga → Themen: pro Besprechungsart offene Themen sammeln und nächste Sitzungen
function ThemenKarte({ ctx, art, onOpen }) {
  const offen = offeneThemen(ctx, art);
  const kommende = expand(ctx.data.workEvents.rows.filter((e) => besprechungVon(e) === art), ctx.day, addDays(ctx.day, 90)).slice(0, 3);
  const B = BESPRECHUNG[art];
  return (
    <section className="card tight">
      <div className="card-title" style={{ padding: '12px 0 2px' }}>Themen {B.label}</div>
      {offen.map((t) => <ThemaZeile key={t.id} ctx={ctx} t={t} />)}
      <ThemaEingabe ctx={ctx} art={art} placeholder={art === 'esl' ? 'z. B. Jahrgang 6: Lernzeit-Konzept' : 'z. B. Raumplan Lernzeit klären'} />
      <div className="h-label" style={{ padding: '12px 0 2px' }}>Nächste {B.mehr}</div>
      {kommende.length === 0 && <div className="small" style={{ padding: '4px 0 10px' }}>Keine gefunden. Markiere einen Termin im Arbeitskalender als „{B.label}“.</div>}
      {kommende.map((o) => (
        <button key={o.ev.id + o.date} className="row" onClick={() => onOpen(o)}>
          <span className="time" style={{ width: 70 }}>{shortLabel(o.date)}</span>
          <span className="row-main"><span className="row-title">{o.ev.title}</span><span className="small">{[!o.ev.all_day && hm(o.ev.from_time), `${themenVon(ctx, o.ev, o.date).length + offen.length} Themen`].filter(Boolean).join(' · ')}</span></span>
        </button>
      ))}
      <div style={{ height: 6 }} />
    </section>
  );
}

function TeamSeite({ ctx }) {
  const [ausgewaehlt, setAus] = useState(null);
  const erledigt = ctx.data.workThemen.rows.filter((t) => t.besprochen_at).sort((a, b) => b.besprochen_at.localeCompare(a.besprochen_at)).slice(0, 8);
  return (
    <>
      <ThemenKarte ctx={ctx} art="team" onOpen={setAus} />
      <ThemenKarte ctx={ctx} art="esl" onOpen={setAus} />
      {erledigt.length > 0 && (
        <section className="card tight">
          <div className="h-label" style={{ padding: '12px 0 4px' }}>Zuletzt besprochen</div>
          {erledigt.map((t) => <div key={t.id} className="small ar-zeile">✓ {t.text} <span style={{ opacity: 0.6 }}>· {BESPRECHUNG[t.art || 'team'].label}</span></div>)}
          <div style={{ height: 8 }} />
        </section>
      )}
      {ausgewaehlt && (
        <Sheet title={`${ausgewaehlt.ev.title} · ${shortLabel(ausgewaehlt.date)}`} onClose={() => setAus(null)}>
          <TeamThemen ctx={ctx} ev={ausgewaehlt.ev} datum={ausgewaehlt.date} />
        </Sheet>
      )}
    </>
  );
}

/* ---------- Kurs-Notizen (Untis-Fach + Klassen) ---------- */

const klassenAus = (note) => ((String(note || '').split(' · ')[1] || '').match(/\b\d{1,2}[a-zA-Z]{1,2}\b/g) || []).join(', ');
export const kursVon = (ev) => `${ev.title}|${klassenAus(ev.note)}`;
// offene Notizen eines Kurses, die vor oder an diesem Tag angelegt wurden
export const kursNotizen = (ctx, ev, datum) => {
  const k = kursVon(ev);
  return ctx.data.workKursnotizen.rows.filter((n) => n.kurs === k && !n.erledigt_at && (!datum || n.created_at.slice(0, 10) <= datum));
};

export function KursNotizen({ ctx, ev, datum }) {
  const [text, setText] = useState('');
  const k = kursVon(ev);
  const [name, klassen] = [untisName(untisNamen(ctx), ev.title), k.split('|')[1]];
  const alle = ctx.data.workKursnotizen.rows.filter((n) => n.kurs === k).sort((a, b) => (a.erledigt_at ? 1 : 0) - (b.erledigt_at ? 1 : 0) || a.created_at.localeCompare(b.created_at));
  const sichtbar = alle.filter((n) => !n.erledigt_at || n.erledigt_at.slice(0, 10) >= ctx.day);
  const add = async (e) => {
    e.preventDefault(); if (!text.trim()) return;
    if (await run(supabase.from('work_kursnotizen').insert({ owner: ctx.me.id, kurs: k, text: text.trim().slice(0, 500) }), ctx.fail)) { setText(''); ctx.data.workKursnotizen.reload(); }
  };
  const toggle = async (n) => {
    const v = n.erledigt_at ? null : new Date().toISOString();
    ctx.data.workKursnotizen.local((rows) => rows.map((x) => (x.id === n.id ? { ...x, erledigt_at: v } : x)));
    if (!await run(supabase.from('work_kursnotizen').update({ erledigt_at: v }).eq('id', n.id), ctx.fail)) ctx.data.workKursnotizen.reload();
  };
  const weg = async (n) => {
    ctx.data.workKursnotizen.local((rows) => rows.filter((x) => x.id !== n.id));
    if (!await run(supabase.from('work_kursnotizen').delete().eq('id', n.id), ctx.fail)) ctx.data.workKursnotizen.reload();
  };
  return (
    <div className="field"><span>Notizen zum Kurs {name}{klassen ? ` · ${klassen}` : ''}</span>
      {sichtbar.length === 0 && <div className="small" style={{ padding: '2px 0 4px' }}>Erscheinen in den nächsten Stunden dieses Kurses, bis du sie abhakst.</div>}
      {sichtbar.map((n) => (
        <div key={n.id} className="row" style={{ minHeight: 42 }}>
          <button className="row-check" aria-label={`${n.text} erledigt`} onClick={() => toggle(n)}><Check on={!!n.erledigt_at} /></button>
          <span className="row-main"><span className="row-title" style={{ textDecoration: n.erledigt_at ? 'line-through' : undefined }}>{n.text}</span><span className="small">notiert {shortLabel(n.created_at.slice(0, 10))}</span></span>
          <button className="icon-btn" aria-label="Notiz löschen" onClick={() => weg(n)}><Icon name="x" size={16} /></button>
        </div>
      ))}
      <form className="thema-neu" onSubmit={add}>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="z. B. Nächstes Mal: Kapitel 3 weiter" aria-label="Neue Kurs-Notiz" />
        <button className="icon-btn" aria-label="Notiz speichern" disabled={!text.trim()}><Icon name="plus" size={18} /></button>
      </form>
      {datum && datum >= ctx.day && <div className="small" style={{ marginTop: 4 }}>Stunde am {shortLabel(datum)}</div>}
    </div>
  );
}

/* ---------- Untis-Änderungen ---------- */

export function UntisAenderungen({ ctx }) {
  const offen = ctx.data.workAenderungen.rows.filter((a) => !a.gesehen_at && a.datum >= ctx.day).sort((a, b) => a.datum.localeCompare(b.datum) || a.created_at.localeCompare(b.created_at));
  if (!offen.length) return null;
  const gesehen = async () => {
    const jetzt = new Date().toISOString();
    const ids = offen.map((a) => a.id);
    ctx.data.workAenderungen.local((rows) => rows.map((x) => (ids.includes(x.id) ? { ...x, gesehen_at: jetzt } : x)));
    if (!await run(supabase.from('work_aenderungen').update({ gesehen_at: jetzt }).in('id', ids), ctx.fail)) ctx.data.workAenderungen.reload();
  };
  return (
    <section className="card tight untis-aend">
      <div className="card-head" style={{ padding: '10px 0 4px' }}>
        <div className="h-label">⚠️ Untis-Änderungen</div>
        <button className="btn ghost small" onClick={gesehen}>Gesehen</button>
      </div>
      {offen.slice(0, 8).map((a) => <div key={a.id} className="small ar-zeile">{a.text}</div>)}
      {offen.length > 8 && <div className="small ar-zeile">… und {offen.length - 8} weitere</div>}
      <div style={{ height: 8 }} />
    </section>
  );
}

/* ---------- Regeln: Erinnerungen & Fristen automatisch ---------- */

export function RegelnKarte({ ctx }) {
  const [offen, setOffen] = useState(false);
  const [f, setF] = useState({ art: 'erinnerung', muster: '', text: '', tage: 2 });
  const regeln = ctx.data.workRegeln.rows.slice().sort((a, b) => a.art.localeCompare(b.art) || a.created_at.localeCompare(b.created_at));
  const lesbar = (m) => m.replace(/\\m|\\M/g, '').replace(/\(([^)]*)\)schluss/g, (_, x) => x.split('|').map((w) => `${w}schluss`).join('|')).split('|').join(' · ');
  const anlegen = async () => {
    const woerter = f.muster.split(/[,;]/).map((w) => w.trim()).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!woerter.length) return;
    const row = { owner: ctx.me.id, art: f.art, muster: woerter.join('|').slice(0, 200), text: f.art === 'frist' ? null : (f.text.trim() || 'Vorbereiten').slice(0, 120), tage: f.art === 'frist' ? 0 : Math.max(0, Math.min(120, Number(f.tage) || 0)) };
    if (await run(supabase.from('work_regeln').insert(row), ctx.fail)) { setF({ art: 'erinnerung', muster: '', text: '', tage: 2 }); ctx.data.workRegeln.reload(); }
  };
  const setAktiv = async (r) => {
    ctx.data.workRegeln.local((rows) => rows.map((x) => (x.id === r.id ? { ...x, aktiv: !r.aktiv } : x)));
    if (!await run(supabase.from('work_regeln').update({ aktiv: !r.aktiv }).eq('id', r.id), ctx.fail)) ctx.data.workRegeln.reload();
  };
  const weg = async (r) => {
    if (await run(supabase.from('work_regeln').delete().eq('id', r.id), ctx.fail)) ctx.data.workRegeln.reload();
  };
  const anwenden = async () => {
    const { data, error } = await supabase.rpc('regeln_anwenden');
    if (error) { ctx.fail(error); return; }
    ctx.data.workTodos.reload(); ctx.data.workFristen.reload();
    ctx.say(data ? `${data} neu angelegt` : 'Nichts Neues – alles schon da');
  };
  return (
    <section className="card tight">
      <button className="card-head regel-kopf" style={{ padding: '10px 0 6px' }} onClick={() => setOffen(!offen)} aria-expanded={offen}>
        <div className="card-title">Automatik-Regeln <span className="small">({regeln.filter((r) => r.aktiv).length} aktiv)</span></div>
        <span style={{ display: 'inline-flex', transform: offen ? 'rotate(180deg)' : undefined }}><Icon name="down" size={18} /></span>
      </button>
      {!offen && <div className="small" style={{ paddingBottom: 10 }}>Neue Termine aus dem Schulkalender bekommen passende Erinnerungen oder werden zur Frist.</div>}
      {offen && (
        <>
          {regeln.map((r) => (
            <div key={r.id} className="row" style={{ minHeight: 48, opacity: r.aktiv ? 1 : 0.5 }}>
              <button className="row-check" aria-label={r.aktiv ? 'Regel ausschalten' : 'Regel einschalten'} onClick={() => setAktiv(r)}><Check on={r.aktiv} /></button>
              <span className="row-main">
                <span className="row-title">{r.art === 'frist' ? '⏳ wird Frist' : `🔔 ${r.text}${r.tage ? ` · ${r.tage} T. vorher` : ' · am Tag'}`}</span>
                <span className="small">wenn im Titel: {lesbar(r.muster)}</span>
              </span>
              <button className="icon-btn" aria-label="Regel löschen" onClick={() => weg(r)}><Icon name="x" size={16} /></button>
            </div>
          ))}
          <div className="regel-neu">
            <div className="chips">{[['erinnerung', '🔔 Erinnerung'], ['frist', '⏳ Frist']].map(([k, l]) => <button key={k} type="button" className={`chip${f.art === k ? ' on' : ''}`} onClick={() => setF({ ...f, art: k })}>{l}</button>)}</div>
            <input className="input" value={f.muster} onChange={(e) => setF({ ...f, muster: e.target.value })} placeholder="Wenn im Titel … (mehrere mit Komma: Konferenz, ESL)" aria-label="Stichwörter" />
            {f.art === 'erinnerung' && (
              <div className="frist-schritt">
                <input className="input" value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder="Erinnerung, z. B. Unterlagen sichten" maxLength={120} />
                <input className="input" type="number" min="0" max="120" inputMode="numeric" value={f.tage} onChange={(e) => setF({ ...f, tage: e.target.value })} aria-label="Tage vorher" />
                <span className="small">T. vorher</span>
                <span />
              </div>
            )}
            <div className="chips">
              <button className="btn small" disabled={!f.muster.trim()} onClick={anlegen}>Regel anlegen</button>
              <button className="btn ghost small" onClick={anwenden}>Auf kommende Termine anwenden</button>
            </div>
          </div>
          <div className="small" style={{ padding: '6px 0 12px' }}>Neue Termine aus Abos bekommen das automatisch. Wird ein Termin verschoben, wandern Frist und Erinnerungen mit.</div>
        </>
      )}
    </section>
  );
}
