// Dauerkarten Werder (2 Plätze), geteilt mit Eika & Jan.
// Eltern-App: Mehr → Dauerkarten. Eika & Jan nutzen dieselbe Liste über einen eigenen Link (?dk=<Schlüssel>).
import { useEffect, useState } from 'react';
import { supabase, run, useTable } from '../data.js';
import { Icon, PersonChips } from '../ui.jsx';
import { WD, hm, expand, titelAm } from '../lib/dates.js';
import { KAT, SEITE, BOERSE_MAX, andere, aktion, vorschlaege, kosten, boerseZahl, euro, wunschText, PRAEF, praefHinweis } from '../lib/dauerkarten.js';

const FARBE = {
  wir: { bg: '#CCFBF1', fg: '#0F766E' },
  wir_weiter: { bg: '#F0FDFA', fg: '#0F766E' },
  die: { bg: '#FFEDD5', fg: '#C2410C' },
  die_weiter: { bg: '#FFF7ED', fg: '#C2410C' },
  boerse: { bg: '#EDE9FE', fg: '#6D28D9' },
};
const tag = (d) => { const x = new Date(`${d}T12:00`); return `${WD[(x.getDay() + 6) % 7]} ${x.getDate()}.${x.getMonth() + 1}.`; };
const heute = () => new Date().toISOString().slice(0, 10);

function Kat({ k }) {
  if (!k) return <span className="dk-kat offen">noch offen</span>;
  const f = FARBE[k];
  return <span className="dk-kat" style={{ background: f.bg, color: f.fg }}>{KAT[k]}</span>;
}

// Kurzer Kommentar zur eigenen Einschätzung (speichert beim Verlassen des Felds)
function PraefText({ wert, busy, onSave }) {
  const [t, setT] = useState(wert);
  const save = () => { if (t.trim() !== wert) onSave(t); };
  return (
    <input className="input dk-ptextin" value={t} maxLength={80} disabled={busy} placeholder="Kommentar (optional), z. B. „nur wenn Emil mitkann“"
      onChange={(e) => setT(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
  );
}

// Notiz, z. B. an wen weitergegeben
function Notiz({ s, busy, onSave }) {
  const [edit, setEdit] = useState(null);
  if (edit !== null) {
    return (
      <div className="dk-notiz edit">
        <input className="input" value={edit} onChange={(e) => setEdit(e.target.value)} placeholder="z. B. Weitergabe an …" maxLength={300} autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') { onSave(edit); setEdit(null); } }} />
        <button className="btn small" style={{ width: 'auto' }} disabled={busy} onClick={() => { onSave(edit); setEdit(null); }}>OK</button>
      </div>
    );
  }
  return (
    <button className="dk-notiz" onClick={() => setEdit(s.notiz || '')}>
      <Icon name="pencil" size={15} /> {s.notiz ? <span>{s.notiz}</span> : <span className="small">Notiz hinzufügen (z. B. Weitergabe an …)</span>}
    </button>
  );
}

// Die Liste – für beide Seiten gleich. onAktion(spiel, was, kat) · onWer nur in der Eltern-App
// termineAm(datum): bestehende Kalendereinträge an diesem Tag (nur Eltern-App)
// WhatsApp-Nachricht für Eika & Jan (öffnet WhatsApp, dort die Gruppe auswählen)
function waText(s, was, link) {
  const wann = `${tag(s.datum)}${s.terminiert === false ? ', nicht terminiert' : s.zeit ? ` ${s.zeit} Uhr` : ''}`;
  return `⚽ Werder – ${s.gegner} (${wann}): ${was}${link ? ` – ${link}` : ''}`;
}
// Nur in der Eltern-App: Eika & Jan Bescheid geben (sie bekommen keine Mitteilung)
function WhatsApp({ text, onClose }) {
  return (
    <div className="dk-wa">
      <span>Eika & Jan Bescheid sagen?</span>
      <div className="dk-knoepfe">
        <a className="btn small dk-wabtn" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" onClick={onClose}>In WhatsApp teilen</a>
        <button className="btn ghost small" onClick={onClose}>Nein danke</button>
      </div>
    </div>
  );
}

export function DkListe({ seite, spiele, preis, onAktion, members, onWer, busy, termineAm, teilLink }) {
  const [wa, setWa] = useState(null); // { id, text } nach einem Wunsch
  const [alle, setAlle] = useState(false);
  const [offen, setOffen] = useState(null); // Spiel, für das gerade ein Wunsch gewählt wird
  const k = kosten(spiele, preis);
  const zeigen = alle ? spiele : spiele.filter((s) => s.datum >= heute());
  const fuerMich = spiele.filter((s) => s.wunsch && s.wunsch_von !== seite).length;
  // Vergangene Spiele ohne Zuteilung – können nachgetragen werden
  const vorbeiOffen = spiele.filter((s) => s.datum < heute() && !s.zuteilung && !s.wunsch).length;
  return (
    <>
      <details className="card dk-hilfe">
        <summary><Icon name="info" size={16} /> So funktioniert’s</summary>
        <ul>
          <li><b>Favorit:</b> wir würden gerne hingehen.</li>
          <li><b>Option:</b> wir hätten Zeit und würden gehen.</li>
          <li><b>Absage:</b> wir können oder wollen nicht.</li>
          <li>{seite === 'die'
            ? 'Catrin & Dirk bekommen jede Eintragung als Mitteilung in ihrer App – ihr müsst nicht extra schreiben. Über Eintragungen von Catrin & Dirk werdet ihr per WhatsApp informiert.'
            : 'Eintragungen von Eika & Jan kommen bei euch als Mitteilung an. Eika & Jan werden per WhatsApp über eure Eintragungen informiert – nach jeder Eintragung erscheint dafür ein Knopf.'}</li>
        </ul>
      </details>
      <section className="card dk-stand">
        <div className="dk-zahlen">
          <div style={{ color: FARBE.wir.fg }}><b>{k.wir}</b><span>Catrin & Dirk</span></div>
          <div style={{ color: FARBE.die.fg }}><b>{k.die - k.boerse}</b><span>Eika & Jan</span></div>
          <div style={{ color: FARBE.boerse.fg }}><b>{boerseZahl(spiele)}/{BOERSE_MAX}</b><span>Ticketbörse</span></div>
          <div><b>{k.offen}</b><span>offen</span></div>
        </div>
        {preis > 0 && k.gesamt > 0 && (
          <details className="dk-details">
            <summary>Kosten anzeigen</summary>
          <div className="dk-geld">
            <div className="dk-balken" aria-hidden="true">
              <span style={{ flex: k.wir, background: '#14B8A6' }} />
              <span style={{ flex: k.die, background: '#F97316' }} />
              <span style={{ flex: k.offen, background: '#E7E5E4' }} />
            </div>
            <table className="dk-tab">
              <tbody>
                <tr><td><i style={{ background: '#14B8A6' }} />Catrin & Dirk</td><td>{k.wir} Sp.</td><td>{euro(k.wir_eur)}</td></tr>
                <tr><td><i style={{ background: '#F97316' }} />Eika & Jan{k.boerse ? <span className="small"> (inkl. {k.boerse} Börse)</span> : null}</td><td>{k.die} Sp.</td><td>{euro(k.die_eur)}</td></tr>
                {k.offen > 0 && <tr className="offen"><td><i style={{ background: '#E7E5E4' }} />Noch nicht vergeben</td><td>{k.offen} Sp.</td><td>{euro(k.offen_eur)}</td></tr>}
                <tr className="summe"><td>Gesamt</td><td>{k.gesamt} Sp.</td><td>{euro(preis)}</td></tr>
              </tbody>
            </table>
            <div className="small">{euro(k.proSpiel)} pro Spiel ({euro(preis)} ÷ {k.gesamt} Heimspiele). Weitergegebene Spiele zahlt die Seite, die weitergibt; Ticketbörse-Spiele zählen für Eika & Jan.</div>
          </div>
          </details>
        )}
        {fuerMich > 0 && <div className="dk-hinweis"><Icon name="bell" size={16} /> {fuerMich} {fuerMich === 1 ? 'Wunsch wartet' : 'Wünsche warten'} auf eure Bestätigung</div>}
      </section>

      <div className="dk-filter">
        <button className={`chip${!alle ? ' on' : ''}`} onClick={() => setAlle(false)}>Kommende</button>
        <button className={`chip${alle ? ' on' : ''}`} onClick={() => setAlle(true)}>Ganze Saison{vorbeiOffen ? ` · ${vorbeiOffen} offen` : ''}</button>
      </div>

      {zeigen.map((s) => {
        const vorbei = s.datum < heute();
        const eigener = s.wunsch && s.wunsch_von === seite;
        const fremder = s.wunsch && s.wunsch_von !== seite;
        return (
          <section key={s.id} className={`card dk-spiel${vorbei ? ' vorbei' : ''}${fremder ? ' frage' : ''}${s.zuteilung ? ` k-${s.zuteilung}` : ''}${s.terminiert === false ? ' unterminiert' : ''}`}>
            <div className="dk-kopf">
              <div>
                <div className="dk-gegner">Werder – {s.gegner}</div>
                <div className="sub">{tag(s.datum)}{s.terminiert === false ? ' · nicht terminiert' : s.zeit ? ` · ${s.zeit} Uhr` : ''}{vorbei ? ' · gespielt' : ''}</div>
              </div>
              <Kat k={s.zuteilung} />
            </div>

            {/* Einschätzungen beider Seiten: Favorit / Option / Absage */}
            {!vorbei && !s.zuteilung && (
              <div className="dk-praef">
                <div className="dk-praefzeile eigen">
                  {Object.entries(PRAEF).map(([k2, p]) => {
                    const an = s.praef?.[seite] === k2;
                    return (
                      <button key={k2} className={`dk-pchip p-${k2}${an ? ' an' : ''}`} aria-pressed={an} disabled={busy} title={p.text}
                        onClick={() => { onAktion(s, 'praef', k2); if (seite === 'wir' && !an) setWa({ id: s.id, text: waText(s, `Catrin & Dirk: ${p.label} (${p.text})`, teilLink) }); }}><Icon name={p.icon} size={14} /> {p.label}</button>
                    );
                  })}
                </div>
                {s.praef?.[seite] && <PraefText key={`${s.id}-${s.praef[`${seite}_text`] || ''}`} wert={s.praef[`${seite}_text`] || ''} busy={busy} onSave={(t) => onAktion(s, 'praeftext', null, t)} />}
                <div className="dk-praefzeile">
                  <span className="dk-praefwer">{SEITE[andere(seite)]}:</span>
                  {s.praef?.[andere(seite)]
                    ? <span className={`dk-pchip p-${s.praef[andere(seite)]} an`}><Icon name={PRAEF[s.praef[andere(seite)]].icon} size={14} /> {PRAEF[s.praef[andere(seite)]].label}</span>
                    : <span className="small">noch keine Angabe</span>}
                  {s.praef?.[`${andere(seite)}_text`] && <span className="dk-ptext">„{s.praef[`${andere(seite)}_text`]}“</span>}
                </div>
                {praefHinweis(s.praef) && !s.zuteilung && <div className="dk-praefhinweis">{praefHinweis(s.praef)}</div>}
              </div>
            )}
            {fremder && (
              <div className="dk-wunsch">
                <span><b>{wunschText(s.wunsch_von, s.wunsch)}</b></span>
                <div className="dk-knoepfe">
                  <button className="btn small" disabled={busy} onClick={() => onAktion(s, 'bestaetigen')}><Icon name="check" size={16} /> Bestätigen</button>
                  <button className="btn ghost small" disabled={busy} onClick={() => onAktion(s, 'ablehnen')}>Ablehnen</button>
                </div>
              </div>
            )}
            {eigener && (
              <div className="dk-wunsch eigen">
                <span>{wunschText(seite, s.wunsch)} – wartet auf die Bestätigung von {SEITE[andere(seite)]}</span>
                <div className="dk-knoepfe">
                  <button className="btn ghost small" disabled={busy} onClick={() => onAktion(s, 'festlegen', s.wunsch)}>Direkt festlegen</button>
                  <button className="btn ghost small" disabled={busy} onClick={() => onAktion(s, 'zurueck')}>Zurückziehen</button>
                </div>
              </div>
            )}
            {seite === 'wir' && wa?.id === s.id && <WhatsApp text={wa.text} onClose={() => setWa(null)} />}
            {fremder || eigener ? null : offen?.id === s.id ? (() => {
              // Schritt 1: Paar oder Ticketbörse · Schritt 2: gehen selbst oder geben weiter
              const moeglich = vorschlaege(seite, spiele, s);
              const kat = offen.paar === 'boerse' ? 'boerse' : offen.paar && offen.art ? (offen.art === 'weiter' ? `${offen.paar}_weiter` : offen.paar) : null;
              const gleich = kat && kat === s.zuteilung;
              const paarBtn = (p, label) => (
                <button key={p} className={`chip dk-paar${offen.paar === p ? ' gewaehlt' : ''}`} aria-pressed={offen.paar === p}
                  style={{ background: FARBE[p].bg, color: FARBE[p].fg, borderColor: offen.paar === p ? FARBE[p].fg : FARBE[p].bg }}
                  onClick={() => setOffen({ id: s.id, paar: p, art: p === 'boerse' ? null : offen.paar === p ? offen.art : null })}>{label}</button>
              );
              return (
                <div className="dk-wahlbox">
                  <div className="dk-wahl">
                    {paarBtn('wir', 'Catrin & Dirk')}
                    {paarBtn('die', 'Eika & Jan')}
                    {moeglich.includes('boerse') && paarBtn('boerse', 'Ticketbörse')}
                  </div>
                  {offen.paar && offen.paar !== 'boerse' && (
                    <div className="dk-wahl dk-art">
                      {[['selbst', 'gehen selbst'], ['weiter', 'geben weiter']].map(([a, l]) => (
                        <button key={a} className={`chip${offen.art === a ? ' gewaehlt' : ''}`} aria-pressed={offen.art === a}
                          style={offen.art === a ? { background: FARBE[offen.paar].fg, borderColor: FARBE[offen.paar].fg, color: '#fff' } : { borderColor: FARBE[offen.paar].fg, color: FARBE[offen.paar].fg }}
                          onClick={() => setOffen({ ...offen, art: a })}>{l}</button>
                      ))}
                    </div>
                  )}
                  <div className="dk-knoepfe">
                    <button className="btn small" disabled={busy || !kat || gleich} onClick={() => { onAktion(s, 'festlegen', kat); setOffen(null); if (seite === 'wir') setWa({ id: s.id, text: waText(s, `vergeben an ${KAT[kat]}`, teilLink) }); }}><Icon name="check" size={16} /> Festlegen</button>
                    <button className="btn ghost small" onClick={() => setOffen(null)}>Abbrechen</button>
                  </div>
                </div>
              );
            })() : (
              <div className="dk-zeile">
                <button className="dk-wunschbtn" onClick={() => setOffen({ id: s.id, paar: null, art: null })}><Icon name="plus" size={15} /> {s.zuteilung ? 'Ändern' : vorbei ? 'Nachtragen' : 'Eintragen'}</button>
              </div>
            )}

            {(s.notiz || s.zuteilung || s.wunsch) && (
              <Notiz s={s} busy={busy} onSave={(text) => onAktion(s, 'notiz', null, text)} />
            )}

            {termineAm && !vorbei && termineAm(s.datum).length > 0 && (
              <div className="dk-termine">
                <span className="small">Außerdem an diesem Tag:</span>
                {termineAm(s.datum).map((o) => (
                  <div key={o.ev.id} className="dk-termin">
                    <span className="dk-tzeit">{o.ev.kind === 'geburtstag' ? <Icon name="cake" size={15} /> : o.ev.all_day ? 'ganztags' : hm(o.ev.from_time)}</span>
                    <span className="dk-ttitel">{titelAm(o.ev, o.date)}</span>
                    <PersonChips who={o.ev.who} members={members} />
                  </div>
                ))}
              </div>
            )}

            {onWer && s.zuteilung === 'wir' && (
              <div className="dk-wer">
                <span className="small">Wer geht? (2 Plätze)</span>
                <div className="chips">{members.map((m) => {
                  const an = s.wer?.includes(m.id);
                  const voll = !an && (s.wer?.length ?? 0) >= 2;
                  return <button key={m.id} className="chip" disabled={voll} aria-pressed={an} style={an ? { background: m.color, borderColor: m.color, color: '#fff' } : { borderColor: m.bg, color: m.color, opacity: voll ? 0.4 : 1 }}
                    onClick={() => onWer(s, an ? s.wer.filter((x) => x !== m.id) : [...(s.wer || []), m.id])}>{m.name}</button>;
                })}</div>
              </div>
            )}
          </section>
        );
      })}
      {zeigen.length === 0 && <div className="empty">Keine Spiele.</div>}
    </>
  );
}

// Eltern-App
export default function Dauerkarten({ ctx, onBack }) {
  const dk = useTable('dk_spiele');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState(null);
  const [preisEdit, setPreisEdit] = useState(null);
  const st = ctx.data.settings.rows.find((r) => r.key === 'dauerkarten')?.value || { preis: 0, plaetze: 2 };
  const saison = (() => { const d = new Date(); return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; })();
  const spiele = dk.rows.filter((s) => s.saison === saison).sort((a, b) => (a.datum + (a.zeit || '')).localeCompare(b.datum + (b.zeit || '')));

  useEffect(() => {
    supabase.from('widget_tokens').select('token').eq('scope', 'dauerkarten').limit(1).then(({ data }) => setLink(data?.[0]?.token ?? ''));
  }, []);
  const url = link ? `${location.origin}${location.pathname}?dk=${link}` : null;

  const onAktion = async (s, was, kat, text) => {
    const r = aktion('wir', spiele, s, was, kat, text);
    if (r.fehler) { ctx.say(r.fehler); return; }
    setBusy(true);
    dk.local((rows) => rows.map((x) => (x.id === s.id ? { ...x, ...r.patch } : x)));
    const ok = await run(supabase.from('dk_spiele').update({ ...r.patch, updated_at: new Date().toISOString() }).eq('id', s.id), ctx.fail);
    if (!ok) dk.reload();
    setBusy(false);
  };
  const onWer = async (s, wer) => {
    dk.local((rows) => rows.map((x) => (x.id === s.id ? { ...x, wer } : x)));
    const ok = await run(supabase.from('dk_spiele').update({ wer }).eq('id', s.id), ctx.fail);
    if (!ok) dk.reload();
  };
  const preisSpeichern = async () => {
    const preis = Number(String(preisEdit).replace(',', '.')) || 0;
    const value = { ...st, preis };
    ctx.data.settings.local((rows) => [...rows.filter((r) => r.key !== 'dauerkarten'), { key: 'dauerkarten', value }]);
    await run(supabase.from('settings').upsert({ key: 'dauerkarten', value }), ctx.fail);
    setPreisEdit(null);
  };
  const linkErstellen = async () => {
    const res = await run(supabase.from('widget_tokens').insert({ member_id: ctx.me.id, label: 'Eika & Jan · Dauerkarten', scope: 'dauerkarten' }).select('token').single(), ctx.fail);
    if (res) setLink(res.token);
  };
  const teilen = async () => {
    const text = `Unsere Werder-Dauerkarten: Hier tragt ihr eure Wünsche ein und bestätigt unsere – ${url}`;
    if (navigator.share) { try { await navigator.share({ title: 'Werder-Dauerkarten', text, url }); return; } catch { /* abgebrochen */ } }
    await navigator.clipboard?.writeText(url);
    ctx.say('Link kopiert');
  };

  return (
    <>
      {onBack && <button className="btn ghost" onClick={onBack} style={{ alignSelf: 'flex-start' }}><Icon name="left" size={18} />Zurück</button>}
      <section className="card dk-setup">
        <div className="card-title">Werder-Dauerkarten · 2 Plätze</div>
        <div className="dk-row">
          <span><b>Gesamtpreis</b> (beide Karten)</span>
          {preisEdit === null
            ? <button className="btn ghost small" style={{ width: 'auto' }} onClick={() => setPreisEdit(st.preis || '')}>{st.preis ? euro(st.preis) : 'eintragen'}</button>
            : <span className="dk-preis"><input className="input" inputMode="decimal" value={preisEdit} onChange={(e) => setPreisEdit(e.target.value)} placeholder="z. B. 810" autoFocus /><button className="btn small" style={{ width: 'auto' }} onClick={preisSpeichern}>OK</button></span>}
        </div>
        <div className="dk-row">
          <span><b>Link für Eika & Jan</b><br /><span className="small">Ohne Anmeldung – sie sehen nur diese Liste.</span></span>
          {link === null ? null : link ? <button className="btn small" style={{ width: 'auto' }} onClick={teilen}>Teilen</button>
            : <button className="btn small" style={{ width: 'auto' }} onClick={linkErstellen}>Link erstellen</button>}
        </div>
      </section>
      {!dk.loaded ? <div className="empty">Lädt …</div>
        : spiele.length === 0 ? <div className="empty">Die Heimspiele werden morgens um 6 Uhr geholt.</div>
          : <DkListe seite="wir" spiele={spiele} preis={st.preis} onAktion={onAktion} members={ctx.members} onWer={onWer} busy={busy}
            teilLink={url}
            termineAm={(d) => expand(ctx.data.events.rows.filter((e) => !String(e.ext_uid || '').startsWith('dk:')), d, d)} />}
    </>
  );
}

// Seite für Eika & Jan (ohne Anmeldung, über die Funktion „dauerkarten“)
export function DauerkartenGast({ token }) {
  const [daten, setDaten] = useState(null);
  const [fehler, setFehler] = useState(null);
  const [busy, setBusy] = useState(false);
  const api = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dauerkarten?t=${encodeURIComponent(token)}`;
  const laden = async (body) => {
    try {
      const r = await fetch(api, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Fehler');
      setDaten(j); setFehler(null);
    } catch (e) { setFehler(e.message); }
  };
  useEffect(() => { laden(); const t = setInterval(() => laden(), 60000); return () => clearInterval(t); }, []);
  const onAktion = async (s, was, kat, text) => { setBusy(true); await laden({ id: s.id, was, kat, text }); setBusy(false); };
  return (
    <div className="app dk-gast">
      <header className="dk-gastkopf"><Icon name="ball" size={26} /><div><h1>Werder-Dauerkarten</h1><div className="sub">Eika & Jan · mit Catrin & Dirk</div></div></header>
      <main className="content">
        {fehler && <div className="card" style={{ color: '#B91C1C' }}>{fehler}</div>}
        {!daten && !fehler && <div className="empty">Lädt …</div>}
        {daten && <DkListe seite="die" spiele={daten.spiele} preis={daten.preis} onAktion={onAktion} busy={busy} />}
      </main>
    </div>
  );
}
