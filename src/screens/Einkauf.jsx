import { useState } from 'react';
import { supabase, run, learnedSections } from '../data.js';
import { Icon, Check, Swipe, Sheet } from '../ui.jsx';
import { ORDER, sectionOf, splitNames } from '../lib/shop.js';

export default function Einkauf({ ctx }) {
  const { data, me } = ctx;
  const [draft, setDraft] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [editFreq, setEditFreq] = useState(false);
  const [hint, setHint] = useState(() => !localStorage.getItem('swipeHint'));
  const [move, setMove] = useState(null); // Artikel, dessen Kategorie geändert wird

  const open = data.shop.rows.filter((r) => !r.done);
  const done = data.shop.rows.filter((r) => r.done).sort((a, b) => String(b.done_at).localeCompare(String(a.done_at)));
  const openNames = new Set(open.map((r) => r.name.toLowerCase()));
  const freq = [...data.freq.rows].sort((a, b) => a.sort - b.sort);
  const standardMissing = freq.filter((f) => f.standard && !openNames.has(f.name.toLowerCase()));

  const add = async (names, how) => {
    const fresh = names.filter((n) => !openNames.has(n.toLowerCase()));
    if (!fresh.length) { ctx.say('Steht schon auf der Liste'); return; }
    // War es schon erledigt? Dann wieder öffnen statt doppelt anlegen.
    const reopen = done.filter((d) => fresh.some((n) => n.toLowerCase() === d.name.toLowerCase()));
    const newOnes = fresh.filter((n) => !reopen.some((d) => d.name.toLowerCase() === n.toLowerCase()));
    if (reopen.length) await run(supabase.from('shopping_items').update({ done: false, done_at: null, added_by: me.name }).in('id', reopen.map((r) => r.id)), ctx.fail);
    if (newOnes.length) await run(supabase.from('shopping_items').insert(newOnes.map((name) => ({ name, section: sectionOf(name, learnedSections(data)), added_by: how ? `${me.name} · ${how}` : me.name }))), ctx.fail);
    ctx.say(fresh.length === 1 ? `${fresh[0]} steht auf der Liste` : `${fresh.length} Dinge auf der Liste`);
  };

  const submit = (e) => {
    e.preventDefault();
    const names = splitNames(draft);
    if (!names.length) return;
    setDraft('');
    add(names);
  };

  const setDone = async (item, val) => {
    data.shop.local((rows) => rows.map((r) => (r.id === item.id ? { ...r, done: val, done_at: val ? new Date().toISOString() : null } : r)));
    const ok = await run(supabase.from('shopping_items').update({ done: val, done_at: val ? new Date().toISOString() : null }).eq('id', item.id), ctx.fail);
    if (!ok) data.shop.reload();
    else if (val) ctx.say(`${item.name} erledigt`, () => setDone(item, false));
  };
  const remove = async (item) => {
    data.shop.local((rows) => rows.filter((r) => r.id !== item.id));
    const ok = await run(supabase.from('shopping_items').delete().eq('id', item.id), ctx.fail);
    if (!ok) data.shop.reload();
    else ctx.say(`${item.name} gelöscht`, () => run(supabase.from('shopping_items').insert(item), ctx.fail));
  };
  const clearDone = async () => {
    const ids = done.map((d) => d.id);
    data.shop.local((rows) => rows.filter((r) => !r.done));
    await run(supabase.from('shopping_items').delete().in('id', ids), ctx.fail);
    setShowDone(false);
  };

  const groups = ORDER.map((name) => ({ name, items: open.filter((r) => r.section === name).sort((a, b) => a.name.localeCompare(b.name, 'de')) })).filter((g) => g.items.length);
  const extra = open.filter((r) => !ORDER.includes(r.section));
  if (extra.length) groups.push({ name: 'Sonstiges', items: extra });

  return (
    <>
      <form className="add-row" onSubmit={submit}>
        <label htmlFor="neu" className="sr">Was fehlt?</label>
        <input id="neu" className="input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Was fehlt? (auch: Milch, Brot)" enterKeyHint="done" autoComplete="off" />
        <button className="btn" aria-label="Hinzufügen"><Icon name="plus" /></button>
      </form>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="card-head">
          <span className="label">Häufig gekauft</span>
          <button className="btn ghost small" style={{ minHeight: 32, border: 'none', background: 'none', color: '#115E59' }} onClick={() => setEditFreq(true)}>Bearbeiten</button>
        </div>
        <div className="chips scroll">
          {freq.filter((f) => !openNames.has(f.name.toLowerCase())).map((f) => (
            <button key={f.id} className="chip plain" onClick={() => add([f.name], 'häufig gekauft')}>+ {f.name}</button>
          ))}
        </div>
        {standardMissing.length > 0 && (
          <button className="btn dashed" onClick={() => add(standardMissing.map((f) => f.name), 'Wocheneinkauf')}>Standard-Wocheneinkauf hinzufügen ({standardMissing.length})</button>
        )}
      </div>

      {hint && open.length > 0 && (
        <div className="card" style={{ flexDirection: 'row', alignItems: 'center', padding: '6px 6px 6px 14px', fontSize: 13 }}>
          <span style={{ flex: '1 1 auto' }}>Tipp: antippen oder nach rechts wischen = erledigt, nach links = löschen</span>
          <button className="icon-btn" style={{ border: 'none' }} aria-label="Hinweis schließen" onClick={() => { localStorage.setItem('swipeHint', '1'); setHint(false); }}><Icon name="x" size={16} /></button>
        </div>
      )}

      {open.length === 0 && <div className="card empty">Alles da – die Liste ist leer.</div>}

      {groups.map((g) => (
        <section key={g.name} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="label">{g.name}</div>
          <div className="card tight">
            {g.items.map((it) => (
              <Swipe key={it.id} onRight={() => setDone(it, true)} onLeft={() => remove(it)}>
                <div className="row" style={{ padding: 0 }}>
                  <button className="row" style={{ borderTop: 'none', flex: '1 1 auto' }} onClick={() => setDone(it, true)}>
                    <Check on={false} round />
                    <span className="row-main">
                      <span className="row-title">{it.name}</span>
                      {it.added_by && <span className="small">{it.added_by}</span>}
                    </span>
                  </button>
                  <button className="icon-btn" style={{ border: 'none', width: 40, color: '#78716C' }} aria-label={`Kategorie von ${it.name} ändern`} onClick={() => setMove(it)}><Icon name="menu" size={18} /></button>
                </div>
              </Swipe>
            ))}
          </div>
        </section>
      ))}

      {done.length > 0 && (
        <section className="card tight">
          <button className="row" onClick={() => setShowDone(!showDone)} aria-expanded={showDone}>
            <span className="row-main"><span style={{ fontWeight: 600 }}>Erledigt ({done.length})</span></span>
            <Icon name="down" size={18} style={{ transform: showDone ? 'rotate(180deg)' : 'none' }} />
          </button>
          {showDone && (
            <>
              {done.slice(0, 40).map((it) => (
                <button key={it.id} className="row" onClick={() => setDone(it, false)} aria-label={`${it.name} wieder auf die Liste`}>
                  <Check on round />
                  <span className="row-main"><span className="row-title done">{it.name}</span></span>
                </button>
              ))}
              <div style={{ padding: '8px 0 12px' }}><button className="btn ghost small" onClick={clearDone}>Erledigte entfernen</button></div>
            </>
          )}
        </section>
      )}

      {editFreq && <FreqSheet ctx={ctx} freq={freq} onClose={() => setEditFreq(false)} />}
      {move && (
        <Sheet title={`${move.name}: Kategorie`} onClose={() => setMove(null)}>
          <div className="small">Die App merkt sich das für das nächste Mal.</div>
          <div className="card tight">
            {ORDER.map((name) => ({ name })).map((sec) => (
              <button key={sec.name} className="row" onClick={async () => {
                data.shop.local((rows) => rows.map((r) => (r.id === move.id ? { ...r, section: sec.name } : r)));
                await run(supabase.from('shopping_items').update({ section: sec.name }).eq('id', move.id), ctx.fail);
                await run(supabase.from('shop_sections').upsert({ name: move.name.trim().toLowerCase(), section: sec.name }), ctx.fail);
                setMove(null);
              }}>
                <Check on={move.section === sec.name} round />
                <span className="row-title">{sec.name}</span>
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </>
  );
}

function FreqSheet({ ctx, freq, onClose }) {
  const [name, setName] = useState('');
  const add = async (e) => {
    e.preventDefault();
    const n = splitNames(name)[0];
    if (!n || freq.some((f) => f.name.toLowerCase() === n.toLowerCase())) return;
    setName('');
    await run(supabase.from('frequent_items').insert({ name: n, sort: (freq.at(-1)?.sort ?? 0) + 1 }), ctx.fail);
  };
  return (
    <Sheet title="Häufig gekauft" onClose={onClose}>
      <div className="small">Mit Haken: gehört zum Standard-Wocheneinkauf.</div>
      <div className="card tight">
        {freq.map((f) => (
          <div key={f.id} className="row">
            <button style={{ background: 'none', border: 'none', padding: 0, display: 'flex', gap: 12, alignItems: 'center', flex: '1 1 auto', minHeight: 44, textAlign: 'left' }}
              aria-pressed={f.standard} aria-label={`${f.name}: Standard-Wocheneinkauf ${f.standard ? 'an' : 'aus'}`}
              onClick={() => run(supabase.from('frequent_items').update({ standard: !f.standard }).eq('id', f.id), ctx.fail)}>
              <Check on={f.standard} />
              <span>{f.name}</span>
            </button>
            <button className="icon-btn" style={{ border: 'none' }} aria-label={`${f.name} entfernen`} onClick={() => run(supabase.from('frequent_items').delete().eq('id', f.id), ctx.fail)}><Icon name="trash" size={18} /></button>
          </div>
        ))}
      </div>
      <form className="add-row" onSubmit={add}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Neu, z. B. Haferflocken" aria-label="Neuer häufiger Artikel" />
        <button className="btn" aria-label="Hinzufügen"><Icon name="plus" /></button>
      </form>
    </Sheet>
  );
}
