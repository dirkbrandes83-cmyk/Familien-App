import { useState } from 'react';
import { supabase, run } from '../data.js';
import { Sheet, ChipPick, Icon } from '../ui.jsx';
import { addDays, shortLabel } from '../lib/dates.js';
import { besorgenText } from '../lib/aufgaben.js';
import { ABSCHNITTE } from '../lib/wochenplan.js';

// „Sa 21.11. · 11:00“ bzw. „Sa 21.11. · Nachmittag“
export const amText = (r) => {
  if (!r.am) return '';
  const zeit = r.um ? r.um.slice(0, 5) : ABSCHNITTE.find((a) => a.id === r.abschnitt)?.label;
  return `${shortLabel(r.am)}${zeit ? ` · ${zeit}` : ''}`;
};

// Ein Eintrag (To-do oder Besorgen) – überall dasselbe Menü:
// Erledigt · Wann? · Wer kümmert sich / für wen · Notiz · Löschen
// todo: Zeile aus todo_inbox oder buy_items; bei Besorgen mit _art: 'buy'
export function EintragSheet({ ctx, todo, onClose }) {
  const buy = todo._art === 'buy';
  const tabelle = buy ? 'buy_items' : 'todo_inbox';
  const data = buy ? ctx.data.buy : ctx.data.inbox;
  const erledigt = buy ? !!todo.done : !!todo.done_at;
  const [f, setF] = useState({
    title: todo.title ?? '', am: todo.am || '', um: todo.um ? todo.um.slice(0, 5) : '', abschnitt: todo.abschnitt || '',
    owner: todo.owner || null, for_who: todo.for_who || null, note: todo.note || '', due: todo.due || '',
  });
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const tage = [[0, 'Heute'], [1, 'Morgen'], [2, 'Übermorgen'], [7, 'In 1 Woche']];
  const erwachsene = ctx.members.filter((m) => !m.kid).map((m) => ({ id: m.id, label: m.name, color: m.color, bg: m.bg }));
  const alle = ctx.members.map((m) => ({ id: m.id, label: m.name, color: m.color, bg: m.bg }));

  const patchLokal = (patch) => data.local((rows) => rows.map((x) => (x.id === todo.id ? { ...x, ...patch } : x)));
  const speichern = async () => {
    const patch = {
      am: f.am || null, um: f.am && f.um ? f.um : null, abschnitt: f.am && !f.um && f.abschnitt ? f.abschnitt : null,
      owner: f.owner, for_who: f.for_who, note: f.note.trim() || null, due: f.due || null,
      ...(buy ? {} : { title: f.title.trim() || todo.title }),
    };
    patchLokal(patch);
    const ok = await run(supabase.from(tabelle).update(patch).eq('id', todo.id), ctx.fail);
    if (!ok) data.reload();
    onClose();
  };
  const abhaken = async () => {
    const v = erledigt ? null : new Date().toISOString();
    const patch = buy ? { done: !!v, done_at: v } : { done_at: v };
    patchLokal(patch);
    const ok = await run(supabase.from(tabelle).update(patch).eq('id', todo.id), ctx.fail);
    if (!ok) data.reload(); else ctx.say(v ? 'Erledigt' : 'Wieder offen');
    onClose();
  };
  const loeschen = async () => {
    // Geschenk aus einem Termin nur ausblenden, sonst legt der Kalender es wieder an
    const q = buy && todo.event_id
      ? supabase.from(tabelle).update({ done: true, done_at: new Date().toISOString() }).eq('id', todo.id)
      : supabase.from(tabelle).delete().eq('id', todo.id);
    data.local((rows) => rows.filter((x) => x.id !== todo.id));
    const ok = await run(q, ctx.fail);
    if (!ok) data.reload(); else ctx.say('Gelöscht', () => run(supabase.from(tabelle).upsert(Object.fromEntries(Object.entries(todo).filter(([k]) => !k.startsWith('_')))), ctx.fail).then(() => data.reload()));
    onClose();
  };

  return (
    <Sheet title={buy ? besorgenText(todo) : 'To-do'} onClose={onClose}
      actions={<>
        <button className="btn" onClick={speichern}>Speichern</button>
        <button className="btn ghost" onClick={abhaken}><Icon name="check" size={18} />{erledigt ? 'Wieder offen' : 'Erledigt'}</button>
        <button className="ein-del" onClick={loeschen}><Icon name="trash" size={16} />Löschen</button>
      </>}>
      {!buy && <label className="field"><span>Was?</span><input className="input" value={f.title} onChange={(e) => set({ title: e.target.value })} maxLength={120} /></label>}
      <div className="field"><span>Wann?</span>
        <div className="chips">
          {tage.map(([n, l]) => {
            const d = addDays(ctx.day, n);
            return <button key={n} type="button" className={`chip${f.am === d ? ' on' : ''}`} aria-pressed={f.am === d} onClick={() => set({ am: f.am === d ? '' : d })}>{l}</button>;
          })}
          <input className="input" type="date" aria-label="Anderer Tag" value={f.am} onChange={(e) => set({ am: e.target.value })} style={{ width: 'auto', flex: '1 1 140px' }} />
        </div>
      </div>
      {f.am && (
        <div className="field"><span>Uhrzeit oder Tageszeit</span>
          <div className="chips">
            <input className="input" type="time" aria-label="Uhrzeit" value={f.um} onChange={(e) => set({ um: e.target.value })} style={{ width: 'auto', flex: '0 1 120px' }} />
            {!f.um && ABSCHNITTE.map((a) => <button key={a.id} type="button" className={`chip${f.abschnitt === a.id ? ' on' : ''}`} aria-pressed={f.abschnitt === a.id} onClick={() => set({ abschnitt: f.abschnitt === a.id ? '' : a.id })}>{a.label}</button>)}
          </div>
        </div>
      )}
      <div className="field"><span>Wer kümmert sich?</span><ChipPick options={erwachsene} value={f.owner} onPick={(id) => set({ owner: f.owner === id ? null : id })} /></div>
      <div className="field"><span>Für wen?</span><ChipPick options={alle} value={f.for_who} onPick={(id) => set({ for_who: f.for_who === id ? null : id })} /></div>
      <label className="field"><span>Notiz</span><textarea className="input" rows={2} value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder={buy ? 'Größe, Preis, wo kaufen …' : 'Telefonnummer, Kundennummer …'} /></label>
      <label className="field"><span>Frist (spätestens bis)</span><input className="input" type="date" value={f.due} onChange={(e) => set({ due: e.target.value })} /></label>
    </Sheet>
  );
}
