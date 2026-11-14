// Dauerkarten Werder (2 Plätze), geteilt mit Eika & Jan.
// Eltern-App: Mehr → Dauerkarten. Eika & Jan nutzen dieselbe Liste über einen eigenen Link (?dk=<Schlüssel>).
import { useEffect, useState } from 'react';
import { supabase, run, useTable } from '../data.js';
import { Icon } from '../ui.jsx';
import { WD } from '../lib/dates.js';
import { KAT, SEITE, BOERSE_MAX, andere, aktion, vorschlaege, kosten, boerseZahl, euro, wunschText } from '../lib/dauerkarten.js';

const FARBE = {
  wir: { bg: '#CCFBF1', fg: '#0F766E' },
  wir_weiter: { bg: '#F0FDFA', fg: '#0F766E' },
  die: { bg: '#FFEDD5', fg: '#C2410C' },
  die_weiter: { bg: '#FFF7ED', fg: '#C2410C' },
  boerse: { bg: '#EDE9FE', fg: '#6D28D9' },
};
const KURZ = {
  wir: 'Catrin & Dirk', die: 'Eika & Jan', wir_weiter: 'C & D geben weiter', die_weiter: 'E & J geben weiter', boerse: 'Ticketbörse',
};
const tag = (d) => { const x = new Date(`${d}T12:00`); return `${WD[(x.getDay() + 6) % 7]} ${x.getDate()}.${x.getMonth() + 1}.`; };
const heute = () => new Date().toISOString().slice(0, 10);

function Kat({ k }) {
  if (!k) return <span className="dk-kat offen">noch offen</span>;
  const f = FARBE[k];
  return <span className="dk-kat" style={{ background: f.bg, color: f.fg }}>{KAT[k]}</span>;
}

// Die Liste – für beide Seiten gleich. onAktion(spiel, was, kat) · onWer nur in der Eltern-App
export function DkListe({ seite, spiele, preis, onAktion, members, onWer, busy }) {
  const [alle, setAlle] = useState(false);
  const [offen, setOffen] = useState(null); // Spiel, für das gerade ein Wunsch gewählt wird
  const k = kosten(spiele, preis);
  const zeigen = alle ? spiele : spiele.filter((s) => s.datum >= heute());
  const fuerMich = spiele.filter((s) => s.wunsch && s.wunsch_von !== seite).length;
  // Vergangene Spiele ohne Zuteilung – können nachgetragen werden
  const vorbeiOffen = spiele.filter((s) => s.datum < heute() && !s.zuteilung && !s.wunsch).length;
  return (
    <>
      <section className="card dk-stand">
        <div className="dk-zahlen">
          <div style={{ color: FARBE.wir.fg }}><b>{k.wir}</b><span>Catrin & Dirk</span></div>
          <div style={{ color: FARBE.die.fg }}><b>{k.die - k.boerse}</b><span>Eika & Jan</span></div>
          <div style={{ color: FARBE.boerse.fg }}><b>{boerseZahl(spiele)}/{BOERSE_MAX}</b><span>Ticketbörse</span></div>
          <div><b>{k.offen}</b><span>offen</span></div>
        </div>
        {preis > 0 && k.zugewiesen > 0 && (
          <div className="dk-geld">
            <div>{euro(preis)} ÷ {k.zugewiesen} zugeteilte Spiele = <b>{euro(k.proSpiel)}</b> pro Spiel</div>
            <div>Catrin & Dirk: <b>{euro(k.wir_eur)}</b> · Eika & Jan: <b>{euro(k.die_eur)}</b></div>
            <div className="small">Weitergegebene Spiele zählen für die Seite, die weitergibt. Ticketbörse-Spiele zählen für Eika & Jan.</div>
          </div>
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
          <section key={s.id} className={`card dk-spiel${vorbei ? ' vorbei' : ''}${fremder ? ' frage' : ''}`}>
            <div className="dk-kopf">
              <div>
                <div className="dk-gegner">Werder – {s.gegner}</div>
                <div className="sub">{tag(s.datum)}{s.zeit ? ` · ${s.zeit} Uhr` : ''}{vorbei ? ' · gespielt' : ''}</div>
              </div>
              <Kat k={s.zuteilung} />
            </div>

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
                <button className="btn ghost small" disabled={busy} onClick={() => onAktion(s, 'zurueck')}>Zurückziehen</button>
              </div>
            )}
            {!s.wunsch && (offen === s.id ? (
              <div className="dk-wahl">
                {vorschlaege(seite, spiele, s).map((kat) => (
                  <button key={kat} className="chip" style={{ background: FARBE[kat].bg, color: FARBE[kat].fg, borderColor: FARBE[kat].bg }} disabled={busy}
                    onClick={() => { onAktion(s, 'wunsch', kat); setOffen(null); }}>{KURZ[kat]}</button>
                ))}
                <button className="chip" onClick={() => setOffen(null)}>Abbrechen</button>
              </div>
            ) : (
              <button className="dk-wunschbtn" onClick={() => setOffen(s.id)}><Icon name="plus" size={15} /> {s.zuteilung ? 'Änderung wünschen' : vorbei ? 'Nachtragen' : 'Wunsch eintragen'}</button>
            ))}

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

  const onAktion = async (s, was, kat) => {
    const r = aktion('wir', spiele, s, was, kat);
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
      <button className="btn ghost" onClick={onBack} style={{ alignSelf: 'flex-start' }}><Icon name="left" size={18} />Zurück</button>
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
          : <DkListe seite="wir" spiele={spiele} preis={st.preis} onAktion={onAktion} members={ctx.members} onWer={onWer} busy={busy} />}
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
  const onAktion = async (s, was, kat) => { setBusy(true); await laden({ id: s.id, was, kat }); setBusy(false); };
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
