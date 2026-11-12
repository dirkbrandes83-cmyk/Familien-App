import { useState } from 'react';
import { supabase, run } from '../data.js';
import { Sheet, ChipPick, Seg } from '../ui.jsx';
import { hm, longLabel } from '../lib/dates.js';
import { KINDS, NICHT } from './common.jsx';
import { FAECHER, TEST_ARTEN, testTitle } from '../lib/tests.js';
import { careFromEvent } from './Betreuung.jsx';

const REPS = ['keine', 'täglich', 'wöchentlich', 'alle 2 Wochen', 'monatlich', 'jährlich'];

export default function EventSheet({ ctx, ev, preset = {}, onClose }) {
  if (ev?.src === 'abo') return <AboEvent ctx={ctx} ev={ev} date={preset.date} onClose={onClose} />;
  return <EditEvent ctx={ctx} ev={ev} preset={preset} onClose={onClose} />;
}

function AboEvent({ ctx, ev, date, onClose }) {
  const sub = ctx.data.subs.rows.find((x) => x.id === ev.sub_id);
  const hasCare = ctx.data.care.rows.some((c) => c.event_id === ev.id);
  return (
    <Sheet title={ev.title} onClose={onClose}
      actions={!hasCare && <button className="btn ghost" onClick={async () => { if (await careFromEvent(ctx, { ...ev, start_date: date || ev.start_date })) { ctx.say('Betreuung angelegt – unter „Betreuung“ anfragen'); onClose(); } }}>Kinderbetreuung dafür eintragen</button>}>
      <div className="card">
        <div style={{ fontWeight: 700 }}>{longLabel(date || ev.start_date)}</div>
        <div className="sub">{ev.all_day ? 'ganztägig' : `${hm(ev.from_time)}${ev.to_time ? ` – ${hm(ev.to_time)}` : ''}`}{ev.rep !== 'keine' ? ` · ${ev.rep}` : ''}</div>
        {ev.note && <div className="sub" style={{ whiteSpace: 'pre-wrap' }}>{ev.note}</div>}
      </div>
      <div className="small">Aus dem Abo „{sub?.name ?? 'Kalender'}“ – nur lesbar. Ändern geht im ursprünglichen Kalender.{hasCare ? ' Betreuung ist schon eingetragen.' : ''}</div>
    </Sheet>
  );
}

// Bei diesen Wörtern im Titel wird automatisch eine Geschenk-Aufgabe angelegt (wie in der Datenbank)
const GIFT_WORDS = /geburtstag|party|feier|einladung|hochzeit|jubil|taufe|einschulung|konfirmation|kommunion/i;

function EditEvent({ ctx, ev, preset = {}, onClose }) {
  const editing = !!ev;
  const [f, setF] = useState(() => ({
    title: ev?.title ?? preset.title ?? '',
    kind: ev?.kind ?? preset.kind ?? 'termin',
    who: ev?.who ?? preset.who ?? ['all'],
    start_date: ev?.start_date ?? preset.start_date ?? ctx.day,
    end_date: ev?.end_date ?? '',
    all_day: ev?.all_day ?? preset.all_day ?? false,
    from_time: hm(ev?.from_time) || preset.from_time || '',
    to_time: hm(ev?.to_time) || '',
    rep: ev?.rep ?? 'keine',
    rep_until: ev?.rep_until ?? '',
    note: ev?.note ?? '',
    bring_by: ev?.bring_by ?? '',
    pick_by: ev?.pick_by ?? '',
    gift: ev?.gift ?? null,
    fach: ev?.fach ?? null, // null = automatisch (Geburtstag, Party …)
  }));
  const [busy, setBusy] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const occDate = preset.date; // angetippter Tag eines Serientermins

  const pickWho = (id) => {
    if (id === 'all') return set({ who: ['all'] });
    const cur = f.who.filter((w) => w !== 'all');
    const next = cur.includes(id) ? cur.filter((w) => w !== id) : [...cur, id];
    set({ who: next.length ? next : ['all'] });
  };

  const save = async () => {
    if (!f.title.trim()) return;
    setBusy(true);
    const row = {
      title: f.title.trim(),
      kind: f.kind,
      who: f.who,
      start_date: f.start_date,
      end_date: f.all_day && f.end_date && f.end_date > f.start_date ? f.end_date : null,
      all_day: f.all_day || f.kind === 'frist' || f.kind === 'geburtstag' ? true : !f.from_time,
      from_time: f.all_day || !f.from_time ? null : f.from_time,
      to_time: f.all_day || !f.to_time ? null : f.to_time,
      rep: f.kind === 'geburtstag' ? 'jährlich' : f.rep,
      rep_until: f.rep !== 'keine' && f.rep_until ? f.rep_until : null,
      note: f.note.trim(),
      bring_by: kidEvent ? f.bring_by || null : null,
      pick_by: kidEvent ? f.pick_by || null : null,
      gift: f.gift,
      fach: f.kind === 'test' ? f.fach : null,
    };
    let ok;
    if (editing) ok = await run(supabase.from('events').update(row).eq('id', ev.id), ctx.fail);
    else {
      const res = await run(supabase.from('events').insert({ ...row, src: preset.inboxId ? 'inbox' : 'fam', created_by: ctx.me.id }).select('id').single(), ctx.fail);
      ok = res;
      if (res && preset.inboxId) await run(supabase.from('todo_inbox').update({ done_at: new Date().toISOString(), event_id: res.id }).eq('id', preset.inboxId), ctx.fail);
    }
    setBusy(false);
    if (ok) { ctx.say((editing ? 'Termin gespeichert' : 'Termin angelegt') + (giftOn && giftPossible && !(editing && (ev.gift ?? GIFT_WORDS.test(ev.title))) ? ' · Geschenk unter Besorgen' : '')); onClose(); }
  };

  const remove = async (onlyThis) => {
    setBusy(true);
    const ok = onlyThis
      ? await run(supabase.from('events').update({ exdates: [...(ev.exdates || []), occDate] }).eq('id', ev.id), ctx.fail)
      : await run(supabase.from('events').delete().eq('id', ev.id), ctx.fail);
    setBusy(false);
    if (ok) {
      const copy = { ...ev };
      ctx.say(onlyThis ? 'Dieser Termin fällt aus' : 'Termin gelöscht', onlyThis
        ? () => run(supabase.from('events').update({ exdates: copy.exdates || [] }).eq('id', copy.id), ctx.fail)
        : () => run(supabase.from('events').insert(copy), ctx.fail));
      onClose();
    }
  };

  const whoOpts = [{ id: 'all', label: 'Alle', color: '#0F766E', bg: '#CCFBF1' }, ...ctx.members.map((m) => ({ id: m.id, label: m.name, color: m.color, bg: m.bg }))];
  const fixedAllDay = f.kind !== 'termin';
  const giftAuto = GIFT_WORDS.test(f.title);
  const giftOn = f.gift ?? giftAuto;
  const giftPossible = f.kind !== 'geburtstag' && f.kind !== 'test' && f.rep === 'keine';
  const kidEvent = f.kind === 'termin' && f.who.some((w) => ctx.member(w)?.kid);
  // Wer kann bringen/abholen? Eltern zuerst, dann die Betreuungspersonen
  const drivers = [...new Set(['Dirk', 'Catrin', ...[...ctx.data.caregivers.rows].sort((a, b) => a.sort - b.sort).map((g) => g.name)])];
  const driverColor = (n) => ctx.members.find((m) => m.name === n);

  return (
    <Sheet title={editing ? 'Termin' : 'Neuer Termin'} onClose={onClose}
      actions={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn" onClick={save} disabled={busy || !f.title.trim()}>{editing ? 'Speichern' : 'Anlegen'}</button>
          {editing && !askDelete && <button className="btn danger" onClick={() => setAskDelete(true)}>Löschen</button>}
          {editing && askDelete && (ev.rep !== 'keine' && occDate ? (
            <div className="two">
              <button className="btn danger" onClick={() => remove(true)} disabled={busy}>Nur am {longLabel(occDate).split(',')[1]}</button>
              <button className="btn danger" onClick={() => remove(false)} disabled={busy}>Ganze Serie</button>
            </div>
          ) : <button className="btn danger" onClick={() => remove(false)} disabled={busy}>Wirklich löschen</button>)}
        </div>
      }>
      <label className="field"><span>Was?</span>
        <input className="input" value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="z. B. Elternabend" autoFocus={!editing} maxLength={200} />
      </label>
      <Seg label="Art" value={f.kind} onPick={(k) => set({ kind: k, ...(k !== 'termin' ? { all_day: true } : {}) })} options={Object.entries(KINDS)} />
      {f.kind === 'test' && (
        <div className="field"><span>Fach</span>
          <ChipPick options={FAECHER.map((x) => ({ id: x, label: x }))} value={f.fach}
            onPick={(x) => set({ fach: f.fach === x ? null : x, ...(!f.title.trim() || /^(Test|Klassenarbeit|Vokabeltest|Lernkontrolle) /.test(f.title) ? { title: testTitle(f.title.split(' ')[0] && TEST_ARTEN.includes(f.title.split(' ')[0]) ? f.title.split(' ')[0] : 'Test', x) } : {}) })} />
        </div>
      )}
      <div className="field"><span>Wer?</span>
        <ChipPick multi options={whoOpts} value={f.who} onPick={pickWho} />
      </div>
      {kidEvent && f.kind !== 'test' && (
        <>
          <div className="field"><span>Bringt hin</span>
            <ChipPick options={[...drivers.map((n) => ({ id: n, label: n, color: driverColor(n)?.color, bg: driverColor(n)?.bg })), { id: NICHT, label: 'Nicht nötig' }]} value={f.bring_by} onPick={(n) => set({ bring_by: f.bring_by === n ? '' : n })} />
          </div>
          <div className="field"><span>Holt ab</span>
            <ChipPick options={[...drivers.map((n) => ({ id: n, label: n, color: driverColor(n)?.color, bg: driverColor(n)?.bg })), { id: NICHT, label: 'Nicht nötig' }]} value={f.pick_by} onPick={(n) => set({ pick_by: f.pick_by === n ? '' : n })} />
          </div>
        </>
      )}
      <div className="two">
        <label className="field"><span>{f.all_day && f.kind === 'termin' ? 'Von' : 'Tag'}</span>
          <input className="input" type="date" value={f.start_date} required onChange={(e) => set({ start_date: e.target.value })} />
        </label>
        {f.all_day && f.kind === 'termin'
          ? <label className="field"><span>Bis (mehrtägig)</span><input className="input" type="date" value={f.end_date || ''} min={f.start_date} onChange={(e) => set({ end_date: e.target.value })} /></label>
          : <div />}
      </div>
      {!fixedAllDay && (
        <label className="toggle-row">
          <span style={{ fontWeight: 600 }}>Ganztägig</span>
          <input type="checkbox" checked={f.all_day} onChange={(e) => set({ all_day: e.target.checked })} style={{ width: 24, height: 24 }} />
        </label>
      )}
      {!f.all_day && !fixedAllDay && (
        <div className="two">
          <label className="field"><span>Beginn</span><input className="input" type="time" value={f.from_time} onChange={(e) => set({ from_time: e.target.value })} /></label>
          <label className="field"><span>Ende</span><input className="input" type="time" value={f.to_time} onChange={(e) => set({ to_time: e.target.value })} /></label>
        </div>
      )}
      {f.kind !== 'geburtstag' && (
        <div className="two">
          <label className="field"><span>Wiederholen</span>
            <select className="input" value={f.rep} onChange={(e) => set({ rep: e.target.value })}>
              {REPS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          {f.rep !== 'keine'
            ? <label className="field"><span>Bis (optional)</span><input className="input" type="date" value={f.rep_until || ''} min={f.start_date} onChange={(e) => set({ rep_until: e.target.value })} /></label>
            : <div />}
        </div>
      )}
      {f.kind === 'geburtstag' && <div className="small">Geburtstage wiederholen sich jedes Jahr.</div>}
      {giftPossible && (
        <label className="toggle-row">
          <span><span style={{ fontWeight: 600 }}>🎁 Geschenk besorgen</span>
            <span className="small" style={{ display: 'block' }}>Aufgabe unter Erinnerungen → Besorgen, fällig 2 Tage vorher</span></span>
          <input type="checkbox" checked={giftOn} onChange={(e) => set({ gift: e.target.checked === giftAuto ? null : e.target.checked })} style={{ width: 24, height: 24 }} />
        </label>
      )}
      <label className="field"><span>Notiz</span>
        <textarea className="input" value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="z. B. Geschenk mitnehmen" maxLength={1000} />
      </label>
      {editing && ev.rep !== 'keine' && <div className="small">Änderungen gelten für die ganze Serie.</div>}
      {editing && ev.src === 'klender' && <div className="small">Aus Klender übernommen.</div>}
      {editing && !ctx.data.care.rows.some((c) => c.event_id === ev.id) && (
        <button type="button" className="btn ghost small" style={{ alignSelf: 'flex-start' }}
          onClick={async () => { if (await careFromEvent(ctx, { ...ev, start_date: occDate || ev.start_date })) { ctx.say('Betreuung angelegt – unter „Betreuung“ anfragen'); onClose(); } }}>Kinderbetreuung dafür eintragen</button>
      )}
    </Sheet>
  );
}
