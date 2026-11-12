// Geschenkelisten (Weihnachten) – nur in der Erwachsenen-App, auf der Station nicht sichtbar.
import { useState } from 'react';
import { supabase, run } from '../data.js';
import { Icon, Swipe, Sheet, ChipPick } from '../ui.jsx';

const STATUS = {
  idee: { label: 'Idee', icon: '💡', next: 'gekauft' },
  gekauft: { label: 'Gekauft', icon: '🛍️', next: 'verpackt' },
  verpackt: { label: 'Verpackt', icon: '🎁', next: 'idee' },
};
const euro = (n) => `${Number(n).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}\u00a0€`;

export function thisChristmasYear() {
  const d = new Date();
  return d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear(); // im Januar noch die alte Liste
}

export default function Geschenke({ ctx }) {
  const [jahr, setJahr] = useState(thisChristmasYear);
  const [sheet, setSheet] = useState(null);
  const all = ctx.data.gifts.rows.filter((g) => g.anlass === 'Weihnachten' && g.jahr === jahr);

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
          <div className="small">{all.length ? `${n('idee')} Ideen · ${n('gekauft')} gekauft · ${n('verpackt')} verpackt${summe ? ` · ${euro(summe)}` : ''}` : 'Noch nichts eingetragen'}</div>
        </div>
        <button className="icon-btn" aria-label="Jahr vor" onClick={() => setJahr(jahr + 1)}>›</button>
      </div>
      <button className="btn" onClick={() => setSheet({})}><Icon name="plus" size={18} />Geschenkidee</button>
      {people.map((p) => {
        const list = all.filter((g) => g.fuer === p).sort((a, b) => a.created_at.localeCompare(b.created_at));
        const m = ctx.members.find((x) => x.name === p);
        const fertig = list.every((g) => g.status === 'verpackt');
        return (
          <section key={p} className="card tight">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0 4px' }}>
              <h3 style={{ margin: 0, color: m?.color }}>{p}</h3>
              <span className="small">{fertig ? 'alles verpackt ✓' : `${list.filter((g) => g.status !== 'idee').length}/${list.length} besorgt`}</span>
            </div>
            {list.map((g) => (
              <Swipe key={g.id} onRight={() => step(g)} rightLabel={STATUS[STATUS[g.status].next].label} onLeft={() => del(g)}>
                <div className="row" style={{ minHeight: 56 }}>
                  <button className="gift-status" onClick={() => step(g)} aria-label={`Status: ${STATUS[g.status].label}, weiter`} data-s={g.status}>
                    <span aria-hidden="true">{STATUS[g.status].icon}</span><span>{STATUS[g.status].label}</span>
                  </button>
                  <button className="row-main" style={{ textAlign: 'left', background: 'none', border: 0, padding: 0, font: 'inherit', color: 'inherit' }} onClick={() => setSheet(g)}>
                    <span className="row-title" style={{ textDecoration: g.status === 'verpackt' ? 'line-through' : undefined, opacity: g.status === 'verpackt' ? 0.6 : 1 }}>{g.idee}</span>
                    {(g.preis || g.notiz || g.link) && <span className="small">{[g.preis ? euro(g.preis) : null, g.notiz || null, g.link ? '🔗 Link' : null].filter(Boolean).join(' · ')}</span>}
                  </button>
                </div>
              </Swipe>
            ))}
            <button className="btn ghost small-btn" style={{ margin: '6px 0 10px' }} onClick={() => setSheet({ fuer: p })}>+ für {p}</button>
          </section>
        );
      })}
      <div className="small">Nur in der App für Erwachsene – auf dem Familien-iPad nicht sichtbar. Status antippen: Idee → Gekauft → Verpackt.</div>
      {sheet && <GiftSheet ctx={ctx} gift={sheet} jahr={jahr} names={knownNames} onClose={() => setSheet(null)} />}
    </>
  );
}

function GiftSheet({ ctx, gift, jahr, names, onClose }) {
  const editing = !!gift.id;
  const [fuer, setFuer] = useState(gift.fuer ?? '');
  const [idee, setIdee] = useState(gift.idee ?? '');
  const [preis, setPreis] = useState(gift.preis != null ? String(gift.preis).replace('.', ',') : '');
  const [link, setLink] = useState(gift.link ?? '');
  const [notiz, setNotiz] = useState(gift.notiz ?? '');
  const ok = fuer.trim() && idee.trim();
  const save = async () => {
    if (!ok) return;
    const p = parseFloat(preis.replace(',', '.'));
    const row = { fuer: fuer.trim(), idee: idee.trim(), preis: Number.isFinite(p) ? p : null, link: link.trim(), notiz: notiz.trim() };
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
    <Sheet title={editing ? 'Geschenk' : 'Geschenkidee'} onClose={onClose}
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
      <div className="two">
        <label className="field"><span>Preis (optional)</span>
          <input className="input" inputMode="decimal" value={preis} onChange={(e) => setPreis(e.target.value)} placeholder="z. B. 25" />
        </label>
        <label className="field"><span>Link (optional)</span>
          <input className="input" type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
        </label>
      </div>
      <label className="field"><span>Notiz (optional)</span>
        <input className="input" value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="z. B. bei Thalia bestellt, Größe 140" maxLength={200} />
      </label>
    </Sheet>
  );
}
