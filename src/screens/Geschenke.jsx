// Geschenkelisten (Weihnachten) – nur in der Erwachsenen-App, auf der Station nicht sichtbar.
import { useState } from 'react';
import { supabase, run } from '../data.js';
import { Icon, Swipe, Sheet, ChipPick, Check } from '../ui.jsx';
import { fileToPayload } from './Scan.jsx';

const STATUS = {
  idee: { label: 'Idee', icon: '💡', next: 'gekauft' },
  gekauft: { label: 'Gekauft', icon: '🛍️', next: 'verpackt' },
  verpackt: { label: 'Verpackt', icon: '🎁', next: 'weitergegeben' },
  weitergegeben: { label: 'Weitergegeben', icon: '🤝', next: 'idee' },
};
// Wunschpriorität: 1 = Herzenswunsch, 2 = wichtig, 3 = wäre schön
export const PRIO = { 1: { label: 'Herzenswunsch', kurz: '★★★' }, 2: { label: 'wichtig', kurz: '★★' }, 3: { label: 'wäre schön', kurz: '★' } };
const euro = (n) => `${Number(n).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}\u00a0€`;

export function thisChristmasYear() {
  const d = new Date();
  return d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear(); // im Januar noch die alte Liste
}

export default function Geschenke({ ctx }) {
  const [jahr, setJahr] = useState(thisChristmasYear);
  const [sheet, setSheet] = useState(null);
  const jahrAlle = ctx.data.gifts.rows.filter((g) => g.anlass === 'Weihnachten' && g.jahr === jahr);
  const all = jahrAlle.filter((g) => !g.privat);
  // Nur für mich: die Datenbank liefert private Einträge ohnehin nur an die Person, die sie angelegt hat
  const geheim = jahrAlle.filter((g) => g.privat && g.by_who === ctx.me?.id);

  // Reihenfolge: Familie zuerst, dann alle anderen alphabetisch
  const memberNames = ctx.members.map((m) => m.name);
  const people = [...new Set(all.map((g) => g.fuer))].sort((a, b) => {
    const ia = memberNames.indexOf(a), ib = memberNames.indexOf(b);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return a.localeCompare(b, 'de');
  });
  const n = (s) => all.filter((g) => g.status === s).length;
  const summe = all.filter((g) => g.status !== 'idee' && g.preis).reduce((a, g) => a + Number(g.preis), 0);
  const knownNames = [...new Set([...memberNames, ...ctx.data.gifts.rows.map((g) => g.fuer)])];
  // Wer schenkt? (z. B. Großeltern) – alle bisher benutzten Namen
  const givers = [...new Set(ctx.data.gifts.rows.map((g) => g.von).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  const [teilen, setTeilen] = useState(false);
  const [scan, setScan] = useState(false);
  const [ideen, setIdeen] = useState(null); // { fuer, vorhanden, privat }
  const ideeAufListe = async (v) => {
    const p = parseFloat(preisZahl(v.preis).replace(',', '.'));
    const ok = await run(supabase.from('gift_ideas').insert({ fuer: ideen.fuer, idee: v.produkt.slice(0, 160), preis: Number.isFinite(p) ? p : null, notiz: (v.warum || '').slice(0, 200), anlass: 'Weihnachten', jahr, by_who: ctx.me.id, privat: !!ideen.privat }), ctx.fail);
    if (ok) ctx.say(`${v.produkt} steht bei ${ideen.fuer}`);
  };

  const step = async (g) => {
    const next = STATUS[g.status].next;
    ctx.data.gifts.local((rows) => rows.map((x) => (x.id === g.id ? { ...x, status: next } : x)));
    const ok = await run(supabase.from('gift_ideas').update({ status: next }).eq('id', g.id), ctx.fail);
    if (!ok) ctx.data.gifts.reload();
  };
  const del = async (g) => {
    const ok = await run(supabase.from('gift_ideas').delete().eq('id', g.id), ctx.fail);
    if (ok) ctx.say('Gelöscht', () => run(supabase.from('gift_ideas').insert(g), ctx.fail));
  };

  return (
    <>
      <div className="card tight" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
        <button className="icon-btn" aria-label="Jahr zurück" onClick={() => setJahr(jahr - 1)}>‹</button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>🎄 Weihnachten {jahr}</div>
          <div className="small">{all.length ? `${n('idee')} Ideen · ${n('gekauft')} gekauft · ${n('verpackt')} verpackt${n('weitergegeben') ? ` · ${n('weitergegeben')} weitergegeben` : ''}${summe ? ` · ${euro(summe)}` : ''}` : 'Noch nichts eingetragen'}</div>
        </div>
        <button className="icon-btn" aria-label="Jahr vor" onClick={() => setJahr(jahr + 1)}>›</button>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" style={{ flex: 1 }} onClick={() => setSheet({})}><Icon name="plus" size={18} />Geschenkidee</button>
        {all.length > 0 && <button className="btn ghost" style={{ width: 'auto' }} onClick={() => setTeilen(true)}>Teilen</button>}
      </div>
      <button className="btn dashed" onClick={() => setScan(true)}>Wunschzettel scannen</button>
      {givers.some((v) => all.some((g) => g.von === v)) && (
        <section className="card tight gift-von">
          <div className="small" style={{ fontWeight: 700, padding: '8px 0 4px' }}>Wer schenkt was</div>
          {givers.filter((v) => all.some((g) => g.von === v)).map((v) => {
            const l = all.filter((g) => g.von === v);
            return <div key={v} className="gift-vonrow"><b>{v}</b><span>{l.map((g) => `${g.idee} (${g.fuer})`).join(' · ')}</span></div>;
          })}
        </section>
      )}
      {people.map((p) => {
        const list = all.filter((g) => g.fuer === p).sort((a, b) => (a.prio ?? 9) - (b.prio ?? 9) || a.created_at.localeCompare(b.created_at));
        const m = ctx.members.find((x) => x.name === p);
        const fertig = list.every((g) => g.status === 'verpackt' || g.status === 'weitergegeben');
        return (
          <section key={p} className="card tight">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0 4px' }}>
              <h3 style={{ margin: 0, color: m?.color }}>{p}</h3>
              <span className="small">{fertig ? (list.every((g) => g.status === 'weitergegeben') ? 'alles weitergegeben ✓' : 'alles verpackt ✓') : `${list.filter((g) => g.status !== 'idee').length}/${list.length} besorgt`}</span>
            </div>
            {list.map((g) => (
              <Swipe key={g.id} onRight={() => step(g)} rightLabel={STATUS[STATUS[g.status].next].label} onLeft={() => del(g)}>
                <div className="row" style={{ minHeight: 56 }}>
                  <button className="gift-status" onClick={() => step(g)} aria-label={`Status: ${STATUS[g.status].label}, weiter`} data-s={g.status}>
                    <span aria-hidden="true">{STATUS[g.status].icon}</span><span>{STATUS[g.status].label}</span>
                  </button>
                  <button className="row-main" style={{ textAlign: 'left', background: 'none', border: 0, padding: 0, font: 'inherit', color: 'inherit' }} onClick={() => setSheet(g)}>
                    <span className="row-title" style={{ textDecoration: ['verpackt','weitergegeben'].includes(g.status) ? 'line-through' : undefined, opacity: ['verpackt','weitergegeben'].includes(g.status) ? 0.6 : 1 }}>{g.prio && <span className={`gift-prio p${g.prio}`} title={PRIO[g.prio].label}>{PRIO[g.prio].kurz}</span>}{g.idee}</span>
                    {(g.preis || g.notiz || g.link || g.von) && <span className="small">{[g.von ? `von ${g.von}` : null, g.preis ? euro(g.preis) : null, g.notiz || null, g.link ? '🔗 Link' : null].filter(Boolean).join(' · ')}</span>}
                  </button>
                </div>
              </Swipe>
            ))}
            <div style={{ display: 'flex', gap: 8, margin: '6px 0 10px', flexWrap: 'wrap' }}>
              <button className="btn ghost small-btn" onClick={() => setSheet({ fuer: p })}>+ für {p}</button>
              <button className="btn ghost small-btn" onClick={() => setIdeen({ fuer: p, vorhanden: list.map((g) => g.idee).join(', ') })}>✨ Ideen</button>
            </div>
          </section>
        );
      })}
      <section className="card tight gift-geheim">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0 4px' }}>
          <h3 style={{ margin: 0 }}>🔒 Nur für mich</h3>
          <span className="small">sieht niemand sonst</span>
        </div>
        {geheim.length === 0 && <div className="small" style={{ paddingBottom: 6 }}>Hier planst du Geschenke, die die anderen nicht sehen sollen – z. B. für {ctx.me?.id === 'dirk' ? 'Catrin' : ctx.me?.id === 'catrin' ? 'Dirk' : 'deine Partnerin'}.</div>}
        {[...geheim].sort((a, b) => (a.prio ?? 9) - (b.prio ?? 9) || a.created_at.localeCompare(b.created_at)).map((g) => (
          <Swipe key={g.id} onRight={() => step(g)} rightLabel={STATUS[STATUS[g.status].next].label} onLeft={() => del(g)}>
            <div className="row" style={{ minHeight: 56 }}>
              <button className="gift-status" onClick={() => step(g)} aria-label={`Status: ${STATUS[g.status].label}, weiter`} data-s={g.status}>
                <span aria-hidden="true">{STATUS[g.status].icon}</span><span>{STATUS[g.status].label}</span>
              </button>
              <button className="row-main" style={{ textAlign: 'left', background: 'none', border: 0, padding: 0, font: 'inherit', color: 'inherit' }} onClick={() => setSheet(g)}>
                <span className="row-title">{g.prio && <span className={`gift-prio p${g.prio}`}>{PRIO[g.prio].kurz}</span>}{g.idee}</span>
                <span className="small">{[`für ${g.fuer}`, g.preis ? euro(g.preis) : null, g.notiz || null, g.link ? '🔗 Link' : null].filter(Boolean).join(' · ')}</span>
              </button>
            </div>
          </Swipe>
        ))}
        <div style={{ display: 'flex', gap: 8, margin: '6px 0 10px', flexWrap: 'wrap' }}>
          <button className="btn ghost small-btn" onClick={() => setSheet({ privat: true, fuer: ctx.me?.id === 'dirk' ? 'Catrin' : ctx.me?.id === 'catrin' ? 'Dirk' : '' })}>+ geheime Idee</button>
          {(ctx.me?.id === 'dirk' || ctx.me?.id === 'catrin') && <button className="btn ghost small-btn" onClick={() => setIdeen({ fuer: ctx.me.id === 'dirk' ? 'Catrin' : 'Dirk', vorhanden: geheim.map((g) => g.idee).join(', '), privat: true })}>✨ Ideen</button>}
        </div>
      </section>
      <div className="small">Nur in der App für Erwachsene – auf dem Familien-iPad nicht sichtbar. Status antippen: Idee → Gekauft → Verpackt → Weitergegeben. Sterne: ★★★ Herzenswunsch, ★★ wichtig, ★ wäre schön.</div>
      {sheet && <GiftSheet ctx={ctx} gift={sheet} jahr={jahr} names={knownNames} givers={givers} onClose={() => setSheet(null)} />}
      {ideen && <KaufHilfe ctx={ctx} art="ideen" fuer={ideen.fuer} vorhanden={ideen.vorhanden} onUebernehmen={ideeAufListe} onClose={() => setIdeen(null)} />}
      {scan && <WunschScan ctx={ctx} jahr={jahr} names={knownNames} onClose={() => setScan(false)} />}
      {teilen && <TeilenSheet ctx={ctx} all={all} jahr={jahr} people={people} givers={givers} onClose={() => setTeilen(false)} />}
    </>
  );
}

// Wunschzettel scannen: Foto → Wünsche prüfen → als Ideen übernehmen
function WunschScan({ ctx, jahr, names, onClose }) {
  const [step, setStep] = useState('pick'); // pick | busy | review
  const [err, setErr] = useState('');
  const [fuer, setFuer] = useState('');
  const [items, setItems] = useState([]);
  const pick = async (file) => {
    if (!file) return;
    setErr(''); setStep('busy');
    try {
      const payload = await fileToPayload(file);
      const { data, error } = await supabase.functions.invoke('brief-scan', { body: { ...payload, art: 'wunschzettel' } });
      if (error) {
        let msg = 'Der Scan hat nicht geklappt.';
        try { msg = (await error.context.json()).error || msg; } catch { /* Standardtext */ }
        throw new Error(msg);
      }
      if (!data.wuensche?.length) throw new Error('Auf dem Zettel wurden keine Wünsche erkannt.');
      const erkannt = names.find((n) => n.toLowerCase() === String(data.fuer).toLowerCase());
      setFuer(erkannt || (data.fuer !== 'unklar' ? data.fuer : ''));
      setItems(data.wuensche.map((w, i) => ({ key: i, on: true, idee: w.idee, hinweis: w.hinweis || '', prio: null })));
      setStep('review');
    } catch (e) { setErr(e.message); setStep('pick'); }
  };
  const set = (key, p) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const on = items.filter((x) => x.on && x.idee.trim());
  const save = async () => {
    const rows = on.map((x) => ({ anlass: 'Weihnachten', jahr, fuer: fuer.trim(), idee: x.idee.trim().slice(0, 160), notiz: x.hinweis.trim(), prio: x.prio, status: 'idee', by_who: ctx.me.id }));
    const ok = await run(supabase.from('gift_ideas').insert(rows), ctx.fail);
    if (ok) { ctx.data.gifts.reload?.(); ctx.say(`${rows.length} Wünsche für ${fuer.trim()} übernommen`); onClose(); }
  };
  const nameOpts = names.map((n) => { const m = ctx.members.find((x) => x.name === n); return { id: n, label: n, color: m?.color, bg: m?.bg }; });
  return (
    <Sheet title="Wunschzettel scannen" onClose={onClose}
      actions={step === 'review' ? <button className="btn" disabled={!on.length || !fuer.trim()} onClick={save}>{on.length} {on.length === 1 ? 'Wunsch' : 'Wünsche'} übernehmen</button> : null}>
      {step === 'pick' && (
        <>
          <div className="small" style={{ marginBottom: 10 }}>Fotografiere den Wunschzettel. Die Wünsche werden ausgelesen, du prüfst sie und übernimmst sie als Ideen.</div>
          {err && <div className="card tight" style={{ color: '#B91C1C', marginBottom: 10 }}>{err}</div>}
          <label className="btn"><Icon name="camera" size={18} /> Foto aufnehmen oder wählen
            <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => pick(e.target.files?.[0])} />
          </label>
        </>
      )}
      {step === 'busy' && <div className="empty">Wunschzettel wird gelesen …</div>}
      {step === 'review' && (
        <>
          <div className="field"><span>Für wen?</span>
            <ChipPick options={nameOpts} value={fuer} onPick={(n) => setFuer(fuer === n ? '' : n)} />
            <input className="input" value={fuer} onChange={(e) => setFuer(e.target.value)} placeholder="Name" maxLength={60} style={{ marginTop: 8 }} />
          </div>
          <div className="gift-scanlist">
            {items.map((x) => (
              <div key={x.key} className="gift-scanrow">
                <button className="check-btn" aria-pressed={x.on} aria-label={x.on ? 'Nicht übernehmen' : 'Übernehmen'} onClick={() => set(x.key, { on: !x.on })}><Check on={x.on} /></button>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <input className="input" value={x.idee} onChange={(e) => set(x.key, { idee: e.target.value })} maxLength={160} />
                  {x.hinweis && <input className="input small-input" value={x.hinweis} onChange={(e) => set(x.key, { hinweis: e.target.value })} maxLength={200} />}
                  <div className="gift-prio-mini">{[1, 2, 3].map((n) => (
                    <button key={n} className={x.prio === n ? 'on' : ''} aria-pressed={x.prio === n} title={PRIO[n].label} onClick={() => set(x.key, { prio: x.prio === n ? null : n })}>{PRIO[n].kurz}</button>
                  ))}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}

// Wunschzettel als Text teilen (WhatsApp, Mail …): alles, für eine Person oder für eine schenkende Person
function wunschText(list, titel) {
  const byFuer = {};
  for (const g of list) (byFuer[g.fuer] ||= []).push(g);
  const zeilen = Object.entries(byFuer).map(([f, gs]) => `${f}:\n${[...gs].sort((a, b) => (a.prio ?? 9) - (b.prio ?? 9)).map((g) => `• ${g.prio === 1 ? '❤️ ' : ''}${g.idee}${g.prio ? ` (${PRIO[g.prio].label})` : ''}${g.preis ? ` (ca. ${euro(g.preis)})` : ''}${g.link ? `\n  ${/^https?:\/\//.test(g.link) ? g.link : `https://${g.link}`}` : ''}`).join('\n')}`);
  return `🎄 ${titel}\n\n${zeilen.join('\n\n')}`;
}
function TeilenSheet({ ctx, all, jahr, people, givers, onClose }) {
  const teile = async (titel, list) => {
    const text = wunschText(list, titel);
    if (navigator.share) { try { await navigator.share({ title: titel, text }); onClose(); return; } catch { return; } }
    await navigator.clipboard?.writeText(text);
    ctx.say('Text kopiert – jetzt z. B. in WhatsApp einfügen');
    onClose();
  };
  const offen = all.filter((g) => !g.von);
  return (
    <Sheet title="Wunschzettel teilen" onClose={onClose}>
      <div className="small" style={{ marginBottom: 8 }}>Geteilt werden Ideen, Preise und Links – keine Notizen und kein Status.</div>
      <div className="gift-share">
        {givers.filter((v) => all.some((g) => g.von === v)).map((v) => (
          <button key={v} className="btn ghost" onClick={() => teile(`Weihnachten ${jahr} – eure Geschenke, ${v}`, all.filter((g) => g.von === v))}>Für {v} ({all.filter((g) => g.von === v).length})</button>
        ))}
        {offen.length > 0 && <button className="btn ghost" onClick={() => teile(`Weihnachtswünsche ${jahr} – noch zu vergeben`, offen)}>Noch nicht vergeben ({offen.length})</button>}
        {people.map((p) => (
          <button key={p} className="btn ghost" onClick={() => teile(`Weihnachtswünsche ${jahr} – ${p}`, all.filter((g) => g.fuer === p))}>Wunschzettel {p}</button>
        ))}
        <button className="btn ghost" onClick={() => teile(`Weihnachtswünsche ${jahr}`, all)}>Alles</button>
      </div>
    </Sheet>
  );
}

function GiftSheet({ ctx, gift, jahr, names, givers, onClose }) {
  const editing = !!gift.id;
  const [fuer, setFuer] = useState(gift.fuer ?? '');
  const [idee, setIdee] = useState(gift.idee ?? '');
  const [preis, setPreis] = useState(gift.preis != null ? String(gift.preis).replace('.', ',') : '');
  const [link, setLink] = useState(gift.link ?? '');
  const [notiz, setNotiz] = useState(gift.notiz ?? '');
  const [von, setVon] = useState(gift.von ?? '');
  const [prio, setPrio] = useState(gift.prio ?? null);
  const [privat, setPrivat] = useState(!!gift.privat);
  const eigenes = !editing || gift.by_who === ctx.me?.id;
  const ok = fuer.trim() && idee.trim();
  const [hilfe, setHilfe] = useState(false);
  const uebernehmen = (v) => {
    setIdee(v.produkt.slice(0, 160));
    const p = preisZahl(v.preis); if (p) setPreis(p);
    const w = (v.wo || []).find((x) => x.link);
    if (w) setLink(w.link);
    if (v.wo?.length) setNotiz([notiz, `bei ${v.wo.map((x) => x.name).filter(Boolean).join(' / ')}`].filter(Boolean).join(' · ').slice(0, 200));
    setHilfe(false);
    ctx.say('Übernommen – zum Sichern „Speichern“ tippen');
  };
  const save = async () => {
    if (!ok) return;
    const p = parseFloat(preis.replace(',', '.'));
    const row = { fuer: fuer.trim(), idee: idee.trim(), preis: Number.isFinite(p) ? p : null, link: link.trim(), notiz: notiz.trim(), von: von.trim() || null, prio, ...(eigenes ? { privat } : {}) };
    const res = editing
      ? await run(supabase.from('gift_ideas').update(row).eq('id', gift.id), ctx.fail)
      : await run(supabase.from('gift_ideas').insert({ ...row, anlass: 'Weihnachten', jahr, by_who: ctx.me.id }), ctx.fail);
    if (res) { ctx.say(editing ? 'Gespeichert' : 'Idee notiert'); onClose(); }
  };
  const nameOpts = names.map((n) => {
    const m = ctx.members.find((x) => x.name === n);
    return { id: n, label: n, color: m?.color, bg: m?.bg };
  });
  return (
    <Sheet title={privat ? '🔒 Geheime Idee' : editing ? 'Geschenk' : 'Geschenkidee'} onClose={onClose}
      actions={<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button className="btn" onClick={save} disabled={!ok}>{editing ? 'Speichern' : 'Eintragen'}</button>
        {editing && gift.link && <a className="btn ghost" href={/^https?:\/\//.test(gift.link) ? gift.link : `https://${gift.link}`} target="_blank" rel="noreferrer">Link öffnen</a>}
      </div>}>
      <div className="field"><span>Für wen?</span>
        <ChipPick options={nameOpts} value={fuer} onPick={(n) => setFuer(fuer === n ? '' : n)} />
        <input className="input" value={fuer} onChange={(e) => setFuer(e.target.value)} placeholder="oder Name eintippen, z. B. Oma" maxLength={60} style={{ marginTop: 8 }} />
      </div>
      <label className="field"><span>Idee</span>
        <input className="input" value={idee} onChange={(e) => setIdee(e.target.value)} placeholder="z. B. Lego Technic Bagger" maxLength={160} autoFocus={!editing} />
      </label>
      {fuer.trim() && idee.trim() && <button type="button" className="btn dashed" onClick={() => setHilfe(true)}>✨ KI-Kaufhilfe: Produkte, Preise, Shops</button>}
      {hilfe && <KaufHilfe ctx={ctx} art="kauf" fuer={fuer.trim()} idee={idee.trim()} budget={preis} notiz={notiz} onUebernehmen={uebernehmen} onClose={() => setHilfe(false)} />}
      <div className="two">
        <label className="field"><span>Preis (optional)</span>
          <input className="input" inputMode="decimal" value={preis} onChange={(e) => setPreis(e.target.value)} placeholder="z. B. 25" />
        </label>
        <label className="field"><span>Link (optional)</span>
          <input className="input" type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
        </label>
      </div>
      {eigenes && (
        <label className="gift-privat"><input type="checkbox" checked={privat} onChange={(e) => setPrivat(e.target.checked)} /> 🔒 Nur für mich sichtbar</label>
      )}
      <div className="field"><span>Wie wichtig ist der Wunsch?</span>
        <div className="chips">{[1, 2, 3].map((n) => (
          <button key={n} className={`chip gift-prio-chip${prio === n ? ' on' : ''}`} aria-pressed={prio === n} onClick={() => setPrio(prio === n ? null : n)}>
            <span className={`gift-prio p${n}`}>{PRIO[n].kurz}</span>{PRIO[n].label}
          </button>
        ))}</div>
      </div>
      <div className="field"><span>Wer schenkt? (optional)</span>
        {givers.length > 0 && <ChipPick options={givers.map((v) => ({ id: v, label: v }))} value={von} onPick={(v) => setVon(von === v ? '' : v)} />}
        <input className="input" value={von} onChange={(e) => setVon(e.target.value)} placeholder="leer = wir, sonst z. B. Oma & Opa Brandes" maxLength={60} style={{ marginTop: givers.length ? 8 : 0 }} />
      </div>
      <label className="field"><span>Notiz (optional)</span>
        <input className="input" value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="z. B. bei Thalia bestellt, Größe 140" maxLength={200} />
      </label>
    </Sheet>
  );
}

// KI-Kaufhilfe: zu einer Idee konkrete Produkte mit Preisen und Shops (art 'kauf')
// oder für eine Person neue Ideen (art 'ideen'). Ergebnisse sind Vorschläge – Preise vor dem Kauf prüfen.
const ALTER = { Emil: '10 Jahre, 5. Klasse', Jonte: '8 Jahre, 2. Klasse' };
function KaufHilfe({ ctx, art, fuer, idee, budget, notiz, vorhanden, onUebernehmen, onClose }) {
  const [hinweis, setHinweis] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const fragen = async () => {
    setBusy(true); setErr(''); setRes(null);
    const { data, error } = await supabase.functions.invoke('geschenk-hilfe', { body: { art, fuer, alter: ALTER[fuer], idee, budget, notiz, vorhanden, hinweis } });
    setBusy(false);
    if (error) {
      let msg = error.message;
      try { msg = (await error.context.json()).error || msg; } catch { /* Standardtext */ }
      setErr(msg);
      return;
    }
    if (data?.error) { setErr(data.error); return; }
    setRes(data);
  };
  return (
    <Sheet title={art === 'ideen' ? `✨ Ideen für ${fuer}` : `✨ Kaufhilfe: ${idee}`} onClose={onClose}
      actions={!res && <button className="btn" onClick={fragen} disabled={busy}>{busy ? 'Die KI sucht … (bis zu 1 Minute)' : art === 'ideen' ? 'Ideen vorschlagen' : 'Produkte und Preise suchen'}</button>}>
      {!res && (
        <label className="field"><span>{art === 'ideen' ? 'Was mag die Person? (optional)' : 'Worauf sollen wir achten? (optional)'}</span>
          <textarea className="input" rows={2} value={hinweis} onChange={(e) => setHinweis(e.target.value)} maxLength={300}
            placeholder={art === 'ideen' ? 'z. B. liest gern, mag Dinos, Fußball' : 'z. B. nicht zu laut, gebraucht ist ok, Lieferung bis 20.12.'} />
        </label>
      )}
      {err && <div className="small" style={{ color: '#B91C1C' }}>{err}</div>}
      {res && (
        <>
          {res.kurz && <div className="sub">{res.kurz}</div>}
          {(res.vorschlaege || []).map((v, i) => (
            <div key={i} className="kh-vorschlag">
              <div className="kh-kopf"><b>{v.produkt}</b>{v.preis && <span className="kh-preis">{v.preis}</span>}</div>
              {v.warum && <div className="small">{v.warum}</div>}
              {v.achtung && <div className="small" style={{ color: '#B45309' }}>{v.achtung}</div>}
              {(v.wo || []).length > 0 && (
                <div className="kh-wo">{v.wo.map((w, j) => (w.link
                  ? <a key={j} href={w.link} target="_blank" rel="noreferrer" className="chip plain">{w.name || 'Shop'} ↗</a>
                  : <span key={j} className="chip plain">{w.name}</span>))}</div>
              )}
              <button className="btn ghost small" onClick={() => onUebernehmen(v)}>{art === 'ideen' ? '+ Auf die Liste' : 'Übernehmen'}</button>
            </div>
          ))}
          {(res.tipps || []).length > 0 && <div className="small">{res.tipps.map((t, i) => <div key={i}>💡 {t}</div>)}</div>}
          <div className="small">Vorschläge der KI aus einer Websuche – Preise und Verfügbarkeit vor dem Kauf prüfen.</div>
          <button className="btn ghost" onClick={() => setRes(null)}>Noch einmal fragen</button>
        </>
      )}
    </Sheet>
  );
}
const preisZahl = (t) => { const m = String(t || '').replace(/\./g, '').match(/(\d+(?:,\d+)?)/); return m ? m[1] : ''; };
