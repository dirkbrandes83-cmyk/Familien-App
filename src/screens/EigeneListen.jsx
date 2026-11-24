import { useState } from 'react';
import { supabase, run } from '../data.js';
import { Icon, Check, Sheet, Swipe } from '../ui.jsx';

// Eigene Listen (z. B. Packliste Urlaub): geteilt mit der Familie oder nur für mich.
// Abhaken, wieder zurücksetzen (für die nächste Reise), umbenennen, löschen.
export default function EigeneListen({ ctx }) {
  const [offen, setOffen] = useState(null); // id der geöffneten Liste
  const [neu, setNeu] = useState(false);
  const lists = [...ctx.data.lists.rows].sort((a, b) => a.sort - b.sort || a.created_at.localeCompare(b.created_at));
  const items = ctx.data.listItems.rows;
  const liste = lists.find((l) => l.id === offen);
  if (liste) return <Liste ctx={ctx} liste={liste} items={items.filter((i) => i.list_id === liste.id)} onBack={() => setOffen(null)} />;
  return (
    <>
      {lists.length === 0 && (
        <section className="card"><div className="card-title">Eigene Listen</div>
          <div className="sub">Zum Beispiel eine Packliste für den Urlaub. Teilen oder nur für dich – abgehakt wird wie beim Einkauf, und danach kannst du sie fürs nächste Mal zurücksetzen.</div>
        </section>
      )}
      {lists.length > 0 && (
        <section className="card tight">
          {lists.map((l) => {
            const li = items.filter((i) => i.list_id === l.id);
            const done = li.filter((i) => i.done).length;
            const owner = ctx.member(l.owner);
            return (
              <button key={l.id} className="row" style={{ minHeight: 60 }} onClick={() => setOffen(l.id)}>
                <Icon name={l.privat ? 'lock' : 'list'} size={20} />
                <span className="row-main">
                  <span className="row-title" style={{ fontWeight: 700 }}>{l.name}</span>
                  <span className="small">{li.length ? `${done} von ${li.length} abgehakt` : 'leer'} · {l.privat ? 'nur für dich' : `geteilt${owner && owner.id !== ctx.me.id ? ` · von ${owner.name}` : ''}`}</span>
                </span>
                <Icon name="chev" size={18} />
              </button>
            );
          })}
        </section>
      )}
      <button className="btn" onClick={() => setNeu(true)}><Icon name="plus" size={18} />Neue Liste</button>
      {neu && <ListeSheet ctx={ctx} onClose={(id) => { setNeu(false); if (id) setOffen(id); }} />}
    </>
  );
}

function Liste({ ctx, liste, items, onBack }) {
  const [text, setText] = useState('');
  const [edit, setEdit] = useState(false);
  const sorted = [...items].sort((a, b) => a.sort - b.sort || a.created_at.localeCompare(b.created_at));
  const offen = sorted.filter((i) => !i.done);
  const erledigt = sorted.filter((i) => i.done);
  const L = ctx.data.listItems;
  const add = async (e) => {
    e.preventDefault();
    // Mehrere auf einmal: Zeilen oder Kommas
    const neue = text.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
    if (!neue.length) return;
    setText('');
    const max = items.reduce((m, i) => Math.max(m, i.sort), 0);
    const ok = await run(supabase.from('custom_list_items').insert(neue.map((t, n) => ({ list_id: liste.id, text: t.slice(0, 120), sort: max + n + 1 }))), ctx.fail);
    if (ok) L.reload();
  };
  const toggle = async (i) => {
    L.local((rows) => rows.map((x) => (x.id === i.id ? { ...x, done: !i.done } : x)));
    if (!await run(supabase.from('custom_list_items').update({ done: !i.done }).eq('id', i.id), ctx.fail)) L.reload();
  };
  const del = async (i) => {
    L.local((rows) => rows.filter((x) => x.id !== i.id));
    const ok = await run(supabase.from('custom_list_items').delete().eq('id', i.id), ctx.fail);
    if (ok) ctx.say('Gelöscht', () => run(supabase.from('custom_list_items').insert(i), ctx.fail).then(() => L.reload()));
    else L.reload();
  };
  const zuruecksetzen = async () => {
    L.local((rows) => rows.map((x) => (x.list_id === liste.id ? { ...x, done: false } : x)));
    if (await run(supabase.from('custom_list_items').update({ done: false }).eq('list_id', liste.id), ctx.fail)) ctx.say('Alle Häkchen entfernt');
    else L.reload();
  };
  const Zeile = (i) => (
    <Swipe key={i.id} onRight={() => toggle(i)} onLeft={() => del(i)} rightLabel={i.done ? 'Offen' : 'Erledigt'}>
      <button className="row" onClick={() => toggle(i)} aria-pressed={i.done}>
        <Check on={i.done} />
        <span className="row-main"><span className="row-title" style={i.done ? { textDecoration: 'line-through', color: '#78716C' } : undefined}>{i.text}</span></span>
      </button>
    </Swipe>
  );
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="btn ghost small" onClick={onBack}><Icon name="left" size={18} />Listen</button>
        <span style={{ flex: 1 }} />
        <button className="icon-btn" aria-label="Liste bearbeiten" onClick={() => setEdit(true)}><Icon name="pencil" size={18} /></button>
      </div>
      <section className="card tight">
        <div className="card-head" style={{ padding: '10px 0 4px' }}>
          <div><div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{liste.privat && <Icon name="lock" size={16} />}{liste.name}</div>
            <div className="small">{liste.privat ? 'Nur für dich sichtbar' : 'Für die ganze Familie'} · {erledigt.length} von {items.length} abgehakt</div></div>
        </div>
        <form onSubmit={add} style={{ display: 'flex', gap: 8, padding: '6px 0 10px' }}>
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Neu (auch: Sonnencreme, Ladekabel)" aria-label="Neuer Eintrag" />
          <button className="btn" style={{ flex: 'none', width: 52, padding: 0 }} aria-label="Hinzufügen"><Icon name="plus" /></button>
        </form>
        {offen.map(Zeile)}
        {items.length > 0 && offen.length === 0 && <div className="empty">Alles abgehakt.</div>}
        {erledigt.length > 0 && <div className="label" style={{ padding: '12px 0 4px' }}>Abgehakt</div>}
        {erledigt.map(Zeile)}
      </section>
      {erledigt.length > 0 && <button className="btn ghost" onClick={zuruecksetzen}><Icon name="repeat" size={18} />Häkchen zurücksetzen (fürs nächste Mal)</button>}
      {edit && <ListeSheet ctx={ctx} liste={liste} onClose={(weg) => { setEdit(false); if (weg === 'weg') onBack(); }} />}
    </>
  );
}

function ListeSheet({ ctx, liste, onClose }) {
  const [name, setName] = useState(liste?.name ?? '');
  const [privat, setPrivat] = useState(liste?.privat ?? false);
  const darfTeilen = !liste || liste.owner === ctx.me.id;
  const speichern = async () => {
    const n = name.trim();
    if (!n) return;
    if (liste) {
      ctx.data.lists.local((rows) => rows.map((x) => (x.id === liste.id ? { ...x, name: n, privat } : x)));
      if (!await run(supabase.from('custom_lists').update({ name: n, privat }).eq('id', liste.id), ctx.fail)) ctx.data.lists.reload();
      onClose();
      return;
    }
    const { data, error } = await supabase.from('custom_lists').insert({ name: n, privat, owner: ctx.me.id, sort: ctx.data.lists.rows.length }).select('id').single();
    if (error) { ctx.fail(error.message); return; }
    ctx.data.lists.reload();
    onClose(data.id);
  };
  const loeschen = async () => {
    if (!window.confirm(`Liste „${liste.name}“ mit allen Einträgen löschen?`)) return;
    if (await run(supabase.from('custom_lists').delete().eq('id', liste.id), ctx.fail)) { ctx.data.lists.reload(); ctx.data.listItems.reload(); ctx.say('Liste gelöscht'); onClose('weg'); }
  };
  return (
    <Sheet title={liste ? 'Liste bearbeiten' : 'Neue Liste'} onClose={() => onClose()}
      actions={<>
        <button className="btn" disabled={!name.trim()} onClick={speichern}>{liste ? 'Speichern' : 'Anlegen'}</button>
        {liste && <button className="ein-del" onClick={loeschen}><Icon name="trash" size={16} />Liste löschen</button>}
      </>}>
      <label className="field"><span>Name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Packliste Urlaub" maxLength={60} autoFocus={!liste} /></label>
      {darfTeilen && (
        <div className="field"><span>Wer sieht die Liste?</span>
          <div className="chips">
            <button type="button" className={`chip${!privat ? ' on' : ''}`} aria-pressed={!privat} onClick={() => setPrivat(false)}>Ganze Familie</button>
            <button type="button" className={`chip${privat ? ' on' : ''}`} aria-pressed={privat} onClick={() => setPrivat(true)}><Icon name="lock" size={15} /> Nur ich</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

// Station: geteilte Listen als Karte; Antippen öffnet die Liste groß zum Abhaken und Ergänzen
export function StationListen({ ctx }) {
  const [offen, setOffen] = useState(null);
  const lists = [...ctx.data.lists.rows].filter((l) => !l.privat).sort((a, b) => a.sort - b.sort || a.created_at.localeCompare(b.created_at));
  if (!lists.length) return null;
  const liste = lists.find((l) => l.id === offen);
  return (
    <section className="st-card st-fix">
      <h2>Unsere Listen</h2>
      {lists.map((l) => {
        const li = ctx.data.listItems.rows.filter((i) => i.list_id === l.id);
        return (
          <button key={l.id} className="st-liste" onClick={() => setOffen(l.id)}>
            <Icon name="list" size={22} /><span className="st-liste-name">{l.name}</span>
            <span className="st-progress">{li.filter((i) => i.done).length} von {li.length}</span>
          </button>
        );
      })}
      {liste && (
        <div className="sheet-bg" onClick={(e) => { if (e.target === e.currentTarget) setOffen(null); }}>
          <div className="sheet st-sheet" role="dialog" aria-modal="true" aria-label={liste.name}>
            <div className="sheet-head"><h2>{liste.name}</h2><button className="icon-btn st-icon" onClick={() => setOffen(null)} aria-label="Schließen"><Icon name="x" /></button></div>
            <StationListe ctx={ctx} liste={liste} />
          </div>
        </div>
      )}
    </section>
  );
}

function StationListe({ ctx, liste }) {
  const [text, setText] = useState('');
  const L = ctx.data.listItems;
  const items = L.rows.filter((i) => i.list_id === liste.id).sort((a, b) => Number(a.done) - Number(b.done) || a.sort - b.sort || a.created_at.localeCompare(b.created_at));
  const toggle = async (i) => {
    L.local((rows) => rows.map((x) => (x.id === i.id ? { ...x, done: !i.done } : x)));
    if (!await run(supabase.from('custom_list_items').update({ done: !i.done }).eq('id', i.id), ctx.fail)) L.reload();
  };
  const add = async (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText('');
    const max = L.rows.filter((i) => i.list_id === liste.id).reduce((m, i) => Math.max(m, i.sort), 0);
    if (await run(supabase.from('custom_list_items').insert({ list_id: liste.id, text: t.slice(0, 120), sort: max + 1 }), ctx.fail)) L.reload();
  };
  return (
    <>
      <form onSubmit={add} style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <input className="input st-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Etwas ergänzen" aria-label="Neuer Eintrag" />
        <button className="btn" style={{ flex: 'none', width: 64 }} aria-label="Hinzufügen"><Icon name="plus" /></button>
      </form>
      <div className="st-liste-items">
        {items.map((i) => (
          <button key={i.id} className="st-check" onClick={() => toggle(i)} aria-pressed={i.done}>
            <Check on={i.done} /><span className={i.done ? 'done' : ''}>{i.text}</span>
          </button>
        ))}
        {items.length === 0 && <div className="st-empty">Noch leer.</div>}
      </div>
    </>
  );
}
