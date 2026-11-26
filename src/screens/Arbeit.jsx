import { useState } from 'react';
import { supabase, run } from '../data.js';
import { Icon, Check, Sheet, Swipe } from '../ui.jsx';
import { addDays, mondayOf, parse, shortLabel, longLabel, hm, expand, WD, weekday } from '../lib/dates.js';

// Arbeitsbereich: private To-dos und Termine (nur ich sehe sie).
// Termine mit „Für die Familie wichtig“ erscheinen zusätzlich im Familienkalender (die Datenbank spiegelt sie).
const familieSetzen = async (ctx, ev, an) => {
  ctx.data.workEvents.local((rows) => rows.map((x) => (x.id === ev.id ? { ...x, familie: an } : x)));
  if (await run(supabase.from('work_events').update({ familie: an }).eq('id', ev.id), ctx.fail)) ctx.say(an ? 'Steht jetzt auch im Familienkalender' : 'Nur noch im Arbeitsbereich');
  else ctx.data.workEvents.reload();
};
const abhakenArbeit = async (ctx, t) => {
  const v = t.done_at ? null : new Date().toISOString();
  ctx.data.workTodos.local((rows) => rows.map((x) => (x.id === t.id ? { ...x, done_at: v } : x)));
  if (!await run(supabase.from('work_todos').update({ done_at: v }).eq('id', t.id), ctx.fail)) ctx.data.workTodos.reload();
  else if (v) ctx.say('Erledigt', () => abhakenArbeit(ctx, { ...t, done_at: v }));
};

// Seiten im Arbeitsmodus
export function ArbeitTodosSeite({ ctx }) {
  return <ArbeitTodos ctx={ctx} />;
}
export function ArbeitKalenderSeite({ ctx }) {
  const [abo, setAbo] = useState(false);
  return (
    <>
      <ArbeitTermine ctx={ctx} />
      <button className="btn ghost" onClick={() => setAbo(!abo)}><Icon name="cal" size={18} />Dienstkalender abonnieren</button>
      {abo && <ArbeitsAbo ctx={ctx} />}
    </>
  );
}

// Arbeit heute: Termine, fällige To-dos – und was privat heute ansteht (damit nichts kollidiert)
export function ArbeitHeuteSeite({ ctx }) {
  const [todo, setTodo] = useState(null);
  const occ = expand(ctx.data.workEvents.rows, ctx.day, ctx.day);
  const woche = expand(ctx.data.workEvents.rows, addDays(ctx.day, 1), addDays(ctx.day, 6));
  const faellig = ctx.data.workTodos.rows.filter((t) => !t.done_at && ((t.am && t.am <= ctx.day) || (t.due && t.due <= addDays(ctx.day, 1))));
  const privat = expand(ctx.data.events.rows.filter((e) => e.src !== 'arbeit' && ((e.who || []).includes(ctx.me.id) || (e.who || []).includes('all') || e.bring_by === ctx.me.name || e.pick_by === ctx.me.name)), ctx.day, ctx.day);
  return (
    <>
      <section className="card tight">
        <div className="h-label" style={{ padding: '12px 0 4px' }}>Termine heute</div>
        {occ.length === 0 && <div className="empty" style={{ padding: '6px 0 12px' }}>Keine Arbeitstermine heute.</div>}
        {occ.map((o) => (
          <div key={o.ev.id} className="row ar-ev">
            <span className="time">{o.ev.all_day ? 'ganzt.' : hm(o.ev.from_time)}</span>
            <span className="row-main"><span className="row-title">{o.ev.title}</span>{(o.ev.to_time || o.ev.note) && <span className="small">{[o.ev.to_time && `bis ${hm(o.ev.to_time)}`, o.ev.note].filter(Boolean).join(' · ')}</span>}</span>
          </div>
        ))}
      </section>
      <section className="card tight">
        <div className="h-label" style={{ padding: '12px 0 4px' }}>Fällig</div>
        {faellig.length === 0 && <div className="empty" style={{ padding: '6px 0 12px' }}>Nichts fällig.</div>}
        {faellig.map((t) => (
          <div key={t.id} className="row">
            <button className="row-check" aria-label={`${t.title} erledigt`} onClick={() => abhakenArbeit(ctx, t)}><Check on={false} /></button>
            <button className="row-open" onClick={() => setTodo(t)}><span className="row-main"><span className="row-title">{t.title}</span>{(t.due || t.kategorie) && <span className="small">{[t.kategorie, t.due && `bis ${shortLabel(t.due)}`].filter(Boolean).join(' · ')}</span>}</span></button>
          </div>
        ))}
      </section>
      {woche.length > 0 && (
        <section className="card tight">
          <div className="h-label" style={{ padding: '12px 0 4px' }}>Nächste Tage</div>
          {woche.slice(0, 6).map((o) => <div key={o.ev.id + o.date} className="small ar-zeile"><b>{shortLabel(o.date)} {o.ev.all_day ? '' : hm(o.ev.from_time)}</b> {o.ev.title}</div>)}
          <div style={{ height: 8 }} />
        </section>
      )}
      {privat.length > 0 && (
        <section className="card tight ar-privat">
          <div className="h-label" style={{ padding: '12px 0 4px' }}>Privat heute</div>
          {privat.map((o) => <div key={o.ev.id} className="small ar-zeile"><b>{o.ev.all_day ? 'ganzt.' : hm(o.ev.from_time)}</b> {o.ev.title}</div>)}
          <div style={{ height: 8 }} />
        </section>
      )}
      {todo && <TodoSheet ctx={ctx} t={todo} onClose={() => setTodo(null)} />}
    </>
  );
}

// Kategorien der Arbeits-To-dos (aus den vorhandenen Einträgen, alphabetisch)
export const kategorienVon = (todos) => [...new Set(todos.map((t) => t.kategorie).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'de'));

function ArbeitTodos({ ctx }) {
  const [todo, setTodo] = useState(null);
  const [filter, setFilter] = useState('alle');
  const todos = ctx.data.workTodos.rows;
  const kats = kategorienVon(todos);
  const offen = todos.filter((t) => !t.done_at).sort((a, b) => String(a.am || a.due || '9999').localeCompare(String(b.am || b.due || '9999')) || a.created_at.localeCompare(b.created_at));
  const abhaken = (t) => abhakenArbeit(ctx, t);
  const zeigen = filter === 'alle' ? offen : offen.filter((t) => (t.kategorie || '') === (filter === 'ohne' ? '' : filter));
  // Gruppen: bei „Alle“ nach Kategorie, Einträge ohne Kategorie zum Schluss
  const gruppen = filter === 'alle'
    ? [...kats.map((k) => [k, zeigen.filter((t) => t.kategorie === k)]), ['', zeigen.filter((t) => !t.kategorie)]].filter(([, l]) => l.length)
    : [[filter === 'ohne' ? '' : filter, zeigen]];
  const Zeile = (t) => {
    const faellig = (t.due && t.due <= ctx.day) || (t.am && t.am <= ctx.day);
    return (
      <Swipe key={t.id} onRight={() => abhaken(t)} onLeft={() => loeschen(ctx, t)}>
        <div className="row">
          <button className="row-check" aria-label={`${t.title} erledigt`} onClick={() => abhaken(t)}><Check on={false} /></button>
          <button className="row-open" onClick={() => setTodo(t)}>
            <span className="row-main">
              <span className="row-title">{t.title}</span>
              {(t.am || t.due || t.note) && <span className="small">{[t.am && `${shortLabel(t.am)}${t.um ? ` ${hm(t.um)}` : ''}`, t.due && <b key="d" style={{ color: faellig ? '#B45309' : undefined }}>bis {shortLabel(t.due)}</b>, t.note].filter(Boolean).reduce((acc, x, i) => (i ? [...acc, ' · ', x] : [x]), [])}</span>}
            </span>
          </button>
        </div>
      </Swipe>
    );
  };
  return (
    <>
      {kats.length > 0 && (
        <div className="chips ar-kats" role="group" aria-label="Nach Kategorie filtern">
          {[['alle', `Alle ${offen.length}`], ...kats.map((k) => [k, `${k} ${offen.filter((t) => t.kategorie === k).length}`]), ...(offen.some((t) => !t.kategorie) ? [['ohne', 'Ohne']] : [])].map(([id, l]) => (
            <button key={id} className={`chip${filter === id ? ' on' : ''}`} aria-pressed={filter === id} onClick={() => setFilter(id)}>{l}</button>
          ))}
        </div>
      )}
      <section className="card tight">
        <div className="card-head" style={{ padding: '10px 0 6px' }}>
          <div className="card-title">{filter === 'alle' ? 'To-dos Arbeit' : filter === 'ohne' ? 'Ohne Kategorie' : filter}</div>
          <button className="icon-btn" aria-label="Neues Arbeits-To-do" onClick={() => setTodo({ kategorie: filter !== 'alle' && filter !== 'ohne' ? filter : null })}><Icon name="plus" size={18} /></button>
        </div>
        {zeigen.length === 0 && <div className="empty" style={{ padding: '8px 0' }}>Nichts offen.</div>}
        {gruppen.map(([k, l]) => (
          <div key={k || '-'}>
            {filter === 'alle' && kats.length > 0 && <div className="label ar-kat-label">{k || 'Ohne Kategorie'}</div>}
            {l.map(Zeile)}
          </div>
        ))}
      </section>
      {todo && <TodoSheet ctx={ctx} t={todo} onClose={() => setTodo(null)} />}
    </>
  );
}

function ArbeitTermine({ ctx }) {
  const [start, setStart] = useState(mondayOf(ctx.day));
  const [termin, setTermin] = useState(null);
  const [todo, setTodo] = useState(null);
  const todos = ctx.data.workTodos.rows;
  const occ = expand(ctx.data.workEvents.rows, start, addDays(start, 6));
  const tage = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const isThis = start === mondayOf(ctx.day);
  const s = parse(start), e = parse(addDays(start, 6));
  const familie = (ev, an) => familieSetzen(ctx, ev, an);
  const abhaken = (t) => abhakenArbeit(ctx, t);
  return (
    <>
      <section className="card tight">
        <div className="card-head" style={{ padding: '10px 0 6px' }}>
          <div className="card-title">Termine Arbeit</div>
          <button className="icon-btn" aria-label="Neuer Arbeitstermin" onClick={() => setTermin({ start_date: ctx.day })}><Icon name="plus" size={18} /></button>
        </div>
        <div className="cal-row cal-week" style={{ padding: '0 0 6px' }}>
          <button className="icon-btn" aria-label="Vorige Woche" onClick={() => setStart(addDays(start, -7))}><Icon name="left" size={18} /></button>
          <button className="cal-range" onClick={() => setStart(mondayOf(ctx.day))} disabled={isThis}>{isThis ? 'Diese Woche' : `${s.getDate()}.${s.getMonth() + 1}. – ${e.getDate()}.${e.getMonth() + 1}. · zu heute`}</button>
          <button className="icon-btn" aria-label="Nächste Woche" onClick={() => setStart(addDays(start, 7))}><Icon name="chev" size={18} /></button>
        </div>
        {tage.map((d) => {
          const list = occ.filter((o) => o.date === d);
          const tt = todos.filter((t) => t.am === d);
          if (!list.length && !tt.length) return null;
          return (
            <div key={d} className="ar-tag">
              <div className={`label${d === ctx.day ? ' heute' : ''}`}>{d === ctx.day ? 'Heute' : `${WD[weekday(d)]} ${parse(d).getDate()}.`}</div>
              {list.map((o) => (
                <div key={o.ev.id + d} className="row ar-ev">
                  <span className="time">{o.ev.all_day ? 'ganzt.' : hm(o.ev.from_time)}</span>
                  <button className="row-open" onClick={() => !o.ev.sub_id && setTermin(o.ev)} disabled={!!o.ev.sub_id}>
                    <span className="row-main"><span className="row-title">{o.ev.title}</span>
                      {(o.ev.to_time || o.ev.note) && <span className="small">{[o.ev.to_time && `bis ${hm(o.ev.to_time)}`, o.ev.note].filter(Boolean).join(' · ')}</span>}</span>
                  </button>
                  <button className={`ar-fam${o.ev.familie ? ' an' : ''}`} aria-pressed={o.ev.familie} aria-label={o.ev.familie ? 'Aus dem Familienkalender nehmen' : 'Auch im Familienkalender zeigen'} onClick={() => familie(o.ev, !o.ev.familie)}>
                    <Icon name="users" size={15} />Familie
                  </button>
                </div>
              ))}
              {tt.map((t) => (
                <div key={t.id} className="row ar-ev" style={{ opacity: t.done_at ? 0.55 : 1 }}>
                  <button className="row-check" onClick={() => abhaken(t)} aria-label={`${t.title} erledigt`}><Check on={!!t.done_at} /></button>
                  <button className="row-open" onClick={() => setTodo(t)}><span className="row-main"><span className="row-title">{t.title}</span><span className="small">To-do{t.um ? ` · ${hm(t.um)}` : ''}</span></span></button>
                </div>
              ))}
            </div>
          );
        })}
        {occ.length === 0 && !todos.some((t) => t.am && t.am >= start && t.am <= addDays(start, 6)) && <div className="empty" style={{ padding: '8px 0' }}>Keine Arbeitstermine in dieser Woche.</div>}
      </section>
      {termin && <TerminSheet ctx={ctx} ev={termin} onClose={() => setTermin(null)} />}
      {todo && <TodoSheet ctx={ctx} t={todo} onClose={() => setTodo(null)} />}
    </>
  );
}

async function loeschen(ctx, t) {
  ctx.data.workTodos.local((rows) => rows.filter((x) => x.id !== t.id));
  if (await run(supabase.from('work_todos').delete().eq('id', t.id), ctx.fail)) ctx.say('Gelöscht', () => run(supabase.from('work_todos').insert(t), ctx.fail).then(() => ctx.data.workTodos.reload()));
  else ctx.data.workTodos.reload();
}

export function TodoSheet({ ctx, t, onClose }) {
  const neu = !t.id;
  const [f, setF] = useState({ title: t.title ?? '', am: t.am ?? '', um: t.um ? hm(t.um) : '', due: t.due ?? '', note: t.note ?? '', kategorie: t.kategorie ?? '' });
  const kats = kategorienVon(ctx.data.workTodos.rows);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const speichern = async () => {
    if (!f.title.trim()) return;
    const row = { title: f.title.trim().slice(0, 160), am: f.am || null, um: f.am && f.um ? f.um : null, due: f.due || null, note: f.note.trim() || null, kategorie: f.kategorie.trim().slice(0, 40) || null };
    const ok = neu ? await run(supabase.from('work_todos').insert({ ...row, owner: ctx.me.id }), ctx.fail) : await run(supabase.from('work_todos').update(row).eq('id', t.id), ctx.fail);
    if (ok) { ctx.data.workTodos.reload(); onClose(); }
  };
  return (
    <Sheet title={neu ? 'To-do Arbeit' : 'To-do bearbeiten'} onClose={onClose}
      actions={<>
        <button className="btn" disabled={!f.title.trim()} onClick={speichern}>{neu ? 'Eintragen' : 'Speichern'}</button>
        {!neu && <button className="ein-del" onClick={() => { loeschen(ctx, t); onClose(); }}><Icon name="trash" size={16} />Löschen</button>}
      </>}>
      <label className="field"><span>Was?</span><input className="input" value={f.title} onChange={(e) => set({ title: e.target.value })} autoFocus={neu} maxLength={160} placeholder="z. B. LEBs Klasse 6b korrigieren" /></label>
      <div className="field"><span>Kategorie</span>
        {kats.length > 0 && (
          <div className="chips">
            {kats.map((k) => <button key={k} type="button" className={`chip${f.kategorie === k ? ' on' : ''}`} aria-pressed={f.kategorie === k} onClick={() => set({ kategorie: f.kategorie === k ? '' : k })}>{k}</button>)}
          </div>
        )}
        <input className="input" value={f.kategorie} onChange={(e) => set({ kategorie: e.target.value })} maxLength={40} placeholder={kats.length ? 'oder neue Kategorie' : 'z. B. Jahrgang 6, Deutsch, Schulentwicklung'} style={{ marginTop: kats.length ? 8 : 0 }} />
      </div>
      <div className="two">
        <label className="field"><span>An welchem Tag? (optional)</span><input className="input" type="date" value={f.am} onChange={(e) => set({ am: e.target.value })} /></label>
        <label className="field"><span>Uhrzeit</span><input className="input" type="time" value={f.um} disabled={!f.am} onChange={(e) => set({ um: e.target.value })} /></label>
      </div>
      <label className="field"><span>Frist (spätestens bis)</span><input className="input" type="date" value={f.due} onChange={(e) => set({ due: e.target.value })} /></label>
      <label className="field"><span>Notiz</span><textarea className="input" rows={2} value={f.note} onChange={(e) => set({ note: e.target.value })} maxLength={500} /></label>
    </Sheet>
  );
}

export function TerminSheet({ ctx, ev, onClose }) {
  const neu = !ev.id;
  const [f, setF] = useState({ title: ev.title ?? '', start_date: ev.start_date ?? ctx.day, all_day: !!ev.all_day, from_time: ev.from_time ? hm(ev.from_time) : '', to_time: ev.to_time ? hm(ev.to_time) : '', note: ev.note ?? '', familie: !!ev.familie });
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const ok = f.title.trim() && f.start_date && (f.all_day || f.from_time);
  const speichern = async () => {
    if (!ok) return;
    const row = { title: f.title.trim().slice(0, 200), start_date: f.start_date, all_day: f.all_day, from_time: f.all_day ? null : f.from_time, to_time: f.all_day || !f.to_time ? null : f.to_time, note: f.note.trim(), familie: f.familie };
    const res = neu ? await run(supabase.from('work_events').insert({ ...row, owner: ctx.me.id }), ctx.fail) : await run(supabase.from('work_events').update(row).eq('id', ev.id), ctx.fail);
    if (res) { ctx.data.workEvents.reload(); ctx.data.events.reload(); onClose(); }
  };
  const loesch = async () => {
    if (await run(supabase.from('work_events').delete().eq('id', ev.id), ctx.fail)) { ctx.data.workEvents.reload(); ctx.data.events.reload(); ctx.say('Termin gelöscht'); onClose(); }
  };
  return (
    <Sheet title={neu ? 'Arbeitstermin' : longLabel(ev.start_date)} onClose={onClose}
      actions={<>
        <button className="btn" disabled={!ok} onClick={speichern}>{neu ? 'Eintragen' : 'Speichern'}</button>
        {!neu && <button className="ein-del" onClick={loesch}><Icon name="trash" size={16} />Löschen</button>}
      </>}>
      <label className="field"><span>Was?</span><input className="input" value={f.title} onChange={(e) => set({ title: e.target.value })} autoFocus={neu} maxLength={200} placeholder="z. B. Zeugniskonferenz" /></label>
      <label className="field"><span>Tag</span><input className="input" type="date" value={f.start_date} onChange={(e) => set({ start_date: e.target.value })} /></label>
      <label className="gift-privat"><input type="checkbox" checked={f.all_day} onChange={(e) => set({ all_day: e.target.checked })} /> ganztägig</label>
      {!f.all_day && (
        <div className="two">
          <label className="field"><span>Von</span><input className="input" type="time" value={f.from_time} onChange={(e) => set({ from_time: e.target.value })} /></label>
          <label className="field"><span>Bis</span><input className="input" type="time" value={f.to_time} onChange={(e) => set({ to_time: e.target.value })} /></label>
        </div>
      )}
      <label className="toggle-row">
        <span><span style={{ fontWeight: 600 }}>Für die Familie wichtig</span><span className="small" style={{ display: 'block' }}>Erscheint dann auch im Familienkalender (bei dir)</span></span>
        <input type="checkbox" checked={f.familie} onChange={(e) => set({ familie: e.target.checked })} style={{ width: 24, height: 24 }} />
      </label>
      <label className="field"><span>Notiz / Ort</span><textarea className="input" rows={2} value={f.note} onChange={(e) => set({ note: e.target.value })} maxLength={1000} /></label>
    </Sheet>
  );
}

// Privates Kalender-Abo (z. B. Schulkalender): Termine landen nur im Arbeitsbereich
function ArbeitsAbo({ ctx }) {
  const meine = ctx.data.subs.rows.filter((x) => x.arbeit_von === ctx.me.id);
  const [f, setF] = useState({ name: 'Schulkalender', url: '' });
  const [busy, setBusy] = useState(false);
  const sync = async (id) => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('abo-sync', { body: { sub_id: id } });
    setBusy(false);
    const r = Object.values(data?.ergebnis || {})[0];
    if (error || r?.fehler) ctx.fail(r?.fehler || 'Abgleich fehlgeschlagen');
    else if (r) { ctx.say(`Abgeglichen: ${r.neu} neu, ${r.geaendert} geändert, ${r.entfernt} entfernt`); ctx.data.workEvents.reload(); }
  };
  const add = async (e) => {
    e.preventDefault();
    if (!f.name.trim() || !/^(https?|webcal):\/\//i.test(f.url.trim())) { ctx.fail('Bitte einen Link mit https:// oder webcal:// einfügen'); return; }
    const res = await run(supabase.from('calendar_subscriptions').insert({ name: f.name.trim(), url: f.url.trim(), who: [ctx.me.id], arbeit_von: ctx.me.id }).select('id').single(), ctx.fail);
    if (res) { setF({ name: '', url: '' }); ctx.data.subs.reload(); await sync(res.id); }
  };
  return (
    <section className="card">
      <div className="card-title">Dienstkalender</div>
      <div className="sub">Termine aus dem Abo sind nur für dich sichtbar und werden stündlich aktualisiert. Mit „Familie“ zeigst du einzelne Termine auch im Familienkalender.</div>
      {meine.map((x) => (
        <div key={x.id} className="row" style={{ gap: 8 }}>
          <span className="row-main"><span className="row-title">{x.name}</span>{x.last_error && <span className="small" style={{ color: '#B91C1C' }}>Fehler: {x.last_error}</span>}</span>
          <button className="btn small" disabled={busy} onClick={() => sync(x.id)}>{busy ? '…' : 'Abgleichen'}</button>
          <button className="btn ghost small" style={{ color: '#B91C1C' }} onClick={async () => { if (window.confirm(`Abo „${x.name}“ und seine Termine entfernen?`) && await run(supabase.from('calendar_subscriptions').delete().eq('id', x.id), ctx.fail)) { ctx.data.subs.reload(); ctx.data.workEvents.reload(); } }}>Entfernen</button>
        </div>
      ))}
      <form onSubmit={add} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
        <label className="field"><span>Name</span><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={80} /></label>
        <label className="field"><span>Abo-Link (.ics oder webcal://)</span>
          <input className="input" type="url" inputMode="url" autoCapitalize="off" spellCheck={false} value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://… oder webcal://…" />
        </label>
        <button className="btn" disabled={!f.url.trim() || !f.name.trim() || busy}>Abonnieren und abgleichen</button>
      </form>
    </section>
  );
}

