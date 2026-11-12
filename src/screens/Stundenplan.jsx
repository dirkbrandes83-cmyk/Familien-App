// Stundenpläne der Kinder bearbeiten (Eltern-App → Mehr → Stundenplan)
import { useState } from 'react';
import { supabase, run } from '../data.js';
import { Icon, ChipPick, Seg } from '../ui.jsx';
import { FAECHER } from '../lib/tests.js';
import { DEFAULT_ZEITEN, fachFarbe } from '../lib/stundenplan.js';

const TAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];

export default function Stundenplan({ ctx, onBack }) {
  const [kid, setKid] = useState(ctx.kids[0]?.id);
  const [tag, setTag] = useState(() => { const d = (new Date().getDay() + 6) % 7; return String(d > 4 ? 0 : d); });
  const [sel, setSel] = useState(null); // Index der Stunde, deren Fach gerade gewählt wird
  const [eigen, setEigen] = useState('');
  const [zeitenEdit, setZeitenEdit] = useState(false);
  const tt = ctx.data.timetables.rows.find((r) => r.kid === kid) || { kid, zeiten: DEFAULT_ZEITEN, tage: {} };
  const zeiten = tt.zeiten?.length ? tt.zeiten : DEFAULT_ZEITEN;
  const tagList = tt.tage?.[tag] || [];
  // eigene Fächer, die schon irgendwo im Plan stehen (z. B. „AG Fußball“)
  const extra = [...new Set(Object.values(tt.tage || {}).flat().filter((f) => f && !FAECHER.includes(f)))];

  const save = async (patch) => {
    const row = { kid, zeiten, tage: tt.tage || {}, ...patch, updated_at: new Date().toISOString() };
    ctx.data.timetables.local((rows) => [...rows.filter((r) => r.kid !== kid), row]);
    const ok = await run(supabase.from('timetables').upsert(row), ctx.fail);
    if (!ok) ctx.data.timetables.reload();
  };
  const setFach = (i, fach) => {
    const list = [...tagList];
    while (list.length <= i) list.push('');
    list[i] = fach;
    save({ tage: { ...(tt.tage || {}), [tag]: list } });
    setSel(i + 1 < zeiten.length ? i + 1 : null); // gleich zur nächsten Stunde springen
    setEigen('');
  };
  const copyFrom = (from) => save({ tage: { ...(tt.tage || {}), [tag]: [...(tt.tage?.[from] || [])] } });
  const setZeit = (i, key, v) => save({ zeiten: zeiten.map((z, j) => (j === i ? { ...z, [key]: v } : z)) });

  return (
    <>
      <button className="btn ghost" onClick={onBack} style={{ alignSelf: 'flex-start' }}><Icon name="left" size={18} />Zurück</button>
      <section className="card">
        <div className="card-title">Stundenplan</div>
        <div className="small">Erscheint auf dem Familien-iPad auf der Seite des Kindes – passend zu „Heute“ oder „Morgen“.</div>
        <ChipPick options={ctx.kids.map((k) => ({ id: k.id, label: k.name, color: k.color, bg: k.bg }))} value={kid} onPick={(k) => { setKid(k); setSel(null); }} />
        <Seg label="Wochentag" value={tag} onPick={(t) => { setTag(t); setSel(null); }} options={TAGE.map((t, i) => [String(i), t])} />
      </section>

      <section className="card tight">
        {zeiten.map((z, i) => {
          const fach = tagList[i] || '';
          const [bg, fg] = fachFarbe(fach);
          return (
            <div key={i}>
              <button className="row tt-row" onClick={() => setSel(sel === i ? null : i)} aria-expanded={sel === i}>
                <span className="tt-n">{i + 1}</span>
                <span className="tt-time">{z.von}–{z.bis}</span>
                <span className="tt-fach" style={fach ? { background: bg, color: fg } : undefined}>{fach || 'frei'}</span>
              </button>
              {sel === i && (
                <div className="tt-pick">
                  <ChipPick options={[...FAECHER, ...extra].map((f) => ({ id: f, label: f }))} value={fach} onPick={(f) => setFach(i, f)} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input className="input" value={eigen} onChange={(e) => setEigen(e.target.value)} placeholder="Anderes, z. B. AG Fußball" maxLength={40}
                      onKeyDown={(e) => { if (e.key === 'Enter' && eigen.trim()) setFach(i, eigen.trim()); }} />
                    <button className="btn" style={{ width: 'auto' }} disabled={!eigen.trim()} onClick={() => setFach(i, eigen.trim())}>OK</button>
                    {fach && <button className="btn ghost" style={{ width: 'auto' }} onClick={() => setFach(i, '')}>frei</button>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="card">
        <div className="label">Übernehmen von</div>
        <div className="chips">
          {TAGE.map((t, i) => String(i) !== tag && (tt.tage?.[String(i)] || []).some(Boolean) && (
            <button key={t} className="chip" onClick={() => copyFrom(String(i))}>{t}</button>
          ))}
        </div>
        <button className="btn ghost" onClick={() => setZeitenEdit(!zeitenEdit)}>{zeitenEdit ? 'Zeiten fertig' : 'Unterrichtszeiten ändern'}</button>
        {zeitenEdit && (
          <>
            {zeiten.map((z, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="tt-n">{i + 1}</span>
                <input className="input" type="time" value={z.von} onChange={(e) => setZeit(i, 'von', e.target.value)} />
                <span>–</span>
                <input className="input" type="time" value={z.bis} onChange={(e) => setZeit(i, 'bis', e.target.value)} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn ghost" onClick={() => save({ zeiten: [...zeiten, { von: '', bis: '' }] })}>+ Stunde</button>
              {zeiten.length > 1 && <button className="btn ghost" onClick={() => save({ zeiten: zeiten.slice(0, -1) })}>− letzte Stunde</button>}
            </div>
            <div className="small">Die Zeiten gelten für alle Wochentage von {ctx.member(kid)?.name}.</div>
          </>
        )}
      </section>
    </>
  );
}
