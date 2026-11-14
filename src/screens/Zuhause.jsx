import { useState } from 'react';
import { supabase, run, learnedSections } from '../data.js';
import { Icon, Check, Sheet, Seg, ChipPick, Swipe } from '../ui.jsx';
import Wochenplan from './Wochenplan.jsx';
import { weekendDays } from '../lib/wochenende.js';
import Ideenkiste, { WochenendKarte } from './Wochenende.jsx';
import { addDays, mondayOf, longLabel, parse, WD, weekday, MONTHS, shortLabel } from '../lib/dates.js';
import { sectionOf, splitNames } from '../lib/shop.js';
import { BINS, WASH, muellStatus, binsForWeek, nextCleaning, agoLabel, weekdaysLabel } from '../lib/home.js';

export const DEFAULT_MEAL = 'Brot/Brötchen';
export const PIZZA = 'Pizza';

// Was gibt es an einem Tag? Eintrag im Plan, sonst sonntags Pizza, sonst Brot/Brötchen.
export function mealOf(ctx, date) {
  const m = ctx.data.meals.rows.find((r) => r.on_date === date);
  if (m) return { title: m.title, planned: true, row: m };
  if (weekday(date) === 6) return { title: PIZZA, planned: false, fixed: true };
  return { title: DEFAULT_MEAL, planned: false };
}

export function muellOf(ctx) {
  return ctx.data.settings.rows.find((r) => r.key === 'muell')?.value;
}

export function Bin({ id, size = 22 }) {
  const b = BINS[id];
  if (!b) return null;
  return (
    <svg width={size} height={size * 1.18} viewBox="0 0 22 26" role="img" aria-label={b.label}>
      <rect x="1" y="2" width="20" height="4" rx="1.5" fill={b.color} />
      <rect x="3" y="7" width="16" height="17" rx="2" fill={b.color} />
    </svg>
  );
}

export default function Zuhause({ ctx, seg, setSeg }) {
  return (
    <>
      <Seg label="Bereich" value={seg} onPick={setSeg} options={[['essen', 'Essen'], ['aemtchen', 'Ämtchen'], ['haushalt', 'Haushalt'], ['wochenende', 'Freizeit']]} />
      {seg === 'essen' ? <Essen ctx={ctx} /> : seg === 'aemtchen' ? <Aemtchen ctx={ctx} /> : seg === 'wochenende' ? <><Wochenplan ctx={ctx} days={weekendDays(ctx.day)} onKiste={() => document.querySelector('.wk')?.scrollIntoView({ behavior: 'smooth' })} /><WochenendKarte ctx={ctx} onOpen={() => document.querySelector('.wk')?.scrollIntoView({ behavior: 'smooth' })} /><Ideenkiste ctx={ctx} /></> : <Haushalt ctx={ctx} />}
    </>
  );
}

/* ---------------- Essen ---------------- */
function Essen({ ctx }) {
  const [week, setWeek] = useState(mondayOf(ctx.day));
  const [sheet, setSheet] = useState(null); // { date, wish }
  const [recipes, setRecipes] = useState(false);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const wishes = ctx.data.wishes.rows.filter((w) => !w.done_at).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const isThis = week === mondayOf(ctx.day);

  const ingredientsToShop = async () => {
    const from = isThis ? ctx.day : week;
    const want = [];
    for (const d of days.filter((x) => x >= from)) {
      const m = mealOf(ctx, d);
      const rec = ctx.data.recipes.rows.find((r) => r.id === m.row?.recipe_id || (!m.row && m.fixed && r.name === PIZZA));
      for (const i of rec?.ingredients || []) if (!want.some((w) => w.toLowerCase() === i.toLowerCase())) want.push(i);
    }
    const open = new Set(ctx.data.shop.rows.filter((r) => !r.done).map((r) => r.name.toLowerCase()));
    const fresh = want.filter((w) => !open.has(w.toLowerCase()));
    if (!fresh.length) { ctx.say(want.length ? 'Alle Zutaten stehen schon auf der Liste' : 'Keine Gerichte mit Zutaten geplant'); return; }
    const ok = await run(supabase.from('shopping_items').insert(fresh.map((name) => ({ name, section: sectionOf(name, learnedSections(ctx.data)), added_by: `${ctx.me.name} · Essensplan` }))), ctx.fail);
    if (ok) ctx.say(`${fresh.length} Zutaten auf der Einkaufsliste`);
  };
  const wishDone = async (w) => {
    const ok = await run(supabase.from('meal_wishes').update({ done_at: new Date().toISOString() }).eq('id', w.id), ctx.fail);
    if (ok) ctx.say('Wunsch erledigt', () => run(supabase.from('meal_wishes').update({ done_at: null }).eq('id', w.id), ctx.fail));
  };

  const s = parse(week);
  return (
    <>
      {wishes.length > 0 && (
        <section className="card tight">
          <div className="card-title" style={{ padding: '10px 0 4px' }}>Wünsche</div>
          {wishes.map((w) => {
            const p = ctx.member(w.who);
            return (
              <Swipe key={w.id} onRight={() => wishDone(w)} onLeft={() => wishDone(w)} leftLabel="Erledigt">
                <div className="row">
                  <span className="row-main"><span><b style={{ color: p?.color }}>{p?.name ?? 'Jemand'}</b> wünscht sich {w.title}</span></span>
                  <button className="btn small" onClick={() => setSheet({ date: null, wish: w })}>Einplanen</button>
                </div>
              </Swipe>
            );
          })}
        </section>
      )}

      <div className="card-head">
        <button className="icon-btn" aria-label="Vorige Woche" onClick={() => setWeek(addDays(week, -7))}><Icon name="left" /></button>
        <span style={{ fontWeight: 700 }}>{isThis ? 'Diese Woche' : `Woche ab ${s.getDate()}. ${MONTHS[s.getMonth()]}`}</span>
        <button className="icon-btn" aria-label="Nächste Woche" onClick={() => setWeek(addDays(week, 7))}><Icon name="chev" /></button>
      </div>
      <section className="card tight">
        {days.map((d) => {
          const m = mealOf(ctx, d);
          const isToday = d === ctx.day;
          return (
            <button key={d} className="row" style={{ minHeight: 60, opacity: d < ctx.day ? 0.55 : 1 }} onClick={() => setSheet({ date: d })}>
              <span style={{ width: 44, display: 'flex', flexDirection: 'column', alignItems: 'center', color: isToday ? '#0F766E' : undefined }}>
                <span className="small" style={{ fontWeight: 700, color: 'inherit' }}>{WD[weekday(d)]}</span>
                <span style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 20, fontWeight: 700 }}>{parse(d).getDate()}</span>
              </span>
              <span className="row-main">
                <span style={{ fontWeight: m.planned || m.fixed ? 600 : 400, color: m.planned || m.fixed ? undefined : '#78716C' }}>{m.title}</span>
                {m.fixed && <span className="small">fester Pizza-Sonntag</span>}
                {m.row?.note && <span className="small">{m.row.note}</span>}
              </span>
              <Icon name="chev" size={18} className="chev" />
            </button>
          );
        })}
      </section>
      <button className="btn" onClick={ingredientsToShop}><Icon name="cart" size={18} />Zutaten auf die Einkaufsliste</button>
      <button className="btn ghost" onClick={() => setRecipes(true)}>Gerichte und Zutaten</button>
      <div className="small">Ohne Eintrag gibt es Brot/Brötchen, sonntags Pizza.</div>

      {sheet && <MealSheet ctx={ctx} date={sheet.date} wish={sheet.wish} onClose={() => setSheet(null)} />}
      {recipes && <RecipesSheet ctx={ctx} onClose={() => setRecipes(false)} />}
    </>
  );
}

function MealSheet({ ctx, date: initDate, wish, onClose }) {
  const [date, setDate] = useState(initDate || ctx.day);
  const cur = ctx.data.meals.rows.find((r) => r.on_date === date);
  const [title, setTitle] = useState(wish?.title ?? cur?.title ?? '');
  const [recipeId, setRecipeId] = useState(cur?.recipe_id ?? null);
  const [note, setNote] = useState(cur?.note ?? '');
  const recipes = [...ctx.data.recipes.rows].sort((a, b) => a.name.localeCompare(b.name, 'de'));

  const save = async () => {
    if (!title.trim()) return;
    const rec = recipes.find((r) => r.name.toLowerCase() === title.trim().toLowerCase());
    const ok = await run(supabase.from('meals').upsert({ on_date: date, title: title.trim(), recipe_id: rec?.id ?? recipeId, note: note.trim(), by_who: ctx.me.id, updated_at: new Date().toISOString() }), ctx.fail);
    if (ok && wish) await run(supabase.from('meal_wishes').update({ done_at: new Date().toISOString() }).eq('id', wish.id), ctx.fail);
    if (ok) { ctx.say(`${title.trim()} eingeplant`); onClose(); }
  };
  const reset = async () => {
    const ok = await run(supabase.from('meals').delete().eq('on_date', date), ctx.fail);
    if (ok) { ctx.say(weekday(date) === 6 ? 'Zurück auf Pizza' : 'Zurück auf Brot/Brötchen'); onClose(); }
  };
  return (
    <Sheet title={wish ? `Wunsch: ${wish.title}` : longLabel(date)} onClose={onClose}
      actions={<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button className="btn" onClick={save} disabled={!title.trim()}>Eintragen</button>
        {cur && <button className="btn ghost" onClick={reset}>{weekday(date) === 6 ? 'Wieder Pizza' : 'Wieder Brot/Brötchen'}</button>}
      </div>}>
      {wish && <label className="field"><span>An welchem Tag?</span><input className="input" type="date" value={date} min={ctx.day} onChange={(e) => setDate(e.target.value)} /></label>}
      <div className="field"><span>Gericht</span>
        <ChipPick options={recipes.map((r) => ({ id: r.id, label: r.name }))} value={recipeId}
          onPick={(id) => { const r = recipes.find((x) => x.id === id); setRecipeId(id); setTitle(r.name); }} />
      </div>
      <label className="field"><span>Oder frei eintragen</span>
        <input className="input" value={title} onChange={(e) => { setTitle(e.target.value); setRecipeId(null); }} placeholder="z. B. Reste vom Vortag" maxLength={120} />
      </label>
      <label className="field"><span>Notiz (optional)</span>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Oma kommt mit" maxLength={200} />
      </label>
    </Sheet>
  );
}

function RecipesSheet({ ctx, onClose }) {
  const [edit, setEdit] = useState(null); // {id?, name, ingr}
  const recipes = [...ctx.data.recipes.rows].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const save = async () => {
    const row = { name: edit.name.trim(), ingredients: splitNames(edit.ingr) };
    if (!row.name) return;
    const ok = edit.id ? await run(supabase.from('recipes').update(row).eq('id', edit.id), ctx.fail) : await run(supabase.from('recipes').insert(row), ctx.fail);
    if (ok) setEdit(null);
  };
  const del = async () => {
    const ok = await run(supabase.from('recipes').delete().eq('id', edit.id), ctx.fail);
    if (ok) setEdit(null);
  };
  if (edit) {
    return (
      <Sheet title={edit.id ? 'Gericht' : 'Neues Gericht'} onClose={() => setEdit(null)}
        actions={<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn" onClick={save} disabled={!edit.name.trim()}>Speichern</button>
          {edit.id && <button className="btn danger" onClick={del}>Löschen</button>}
        </div>}>
        <label className="field"><span>Name</span><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} maxLength={120} /></label>
        <label className="field"><span>Zutaten (mit Komma getrennt)</span><textarea className="input" value={edit.ingr} onChange={(e) => setEdit({ ...edit, ingr: e.target.value })} placeholder="Spaghetti, Hackfleisch, Tomaten" /></label>
      </Sheet>
    );
  }
  return (
    <Sheet title="Gerichte" onClose={onClose}>
      <div className="card tight">
        {recipes.map((r) => (
          <button key={r.id} className="row" onClick={() => setEdit({ id: r.id, name: r.name, ingr: r.ingredients.join(', ') })}>
            <span className="row-main"><span className="row-title">{r.name}</span><span className="small">{r.ingredients.join(', ') || 'keine Zutaten'}</span></span>
            <Icon name="chev" size={18} />
          </button>
        ))}
      </div>
      <button className="btn ghost" onClick={() => setEdit({ name: '', ingr: '' })}><Icon name="plus" size={18} />Neues Gericht</button>
    </Sheet>
  );
}

/* ---------------- Ämtchen ---------------- */
export async function toggleChore(ctx, chore, date, done) {
  const row = { chore_id: chore.id, on_date: date };
  ctx.data.choreChecks.local((rows) => (done ? rows.filter((r) => !(r.chore_id === chore.id && r.on_date === date)) : [...rows, row]));
  const ok = done ? await run(supabase.from('chore_checks').delete().match(row), ctx.fail) : await run(supabase.from('chore_checks').upsert(row), ctx.fail);
  if (!ok) ctx.data.choreChecks.reload();
}

export function choresToday(ctx, date) {
  const wd = weekday(date);
  const checks = new Set(ctx.data.choreChecks.rows.filter((c) => c.on_date === date).map((c) => c.chore_id));
  return ctx.data.chores.rows.filter((c) => (c.weekdays || []).includes(wd)).sort((a, b) => a.sort - b.sort).map((c) => ({ ...c, done: checks.has(c.id) }));
}

function Aemtchen({ ctx }) {
  const [edit, setEdit] = useState(null);
  const today = choresToday(ctx, ctx.day);
  const all = [...ctx.data.chores.rows].sort((a, b) => a.sort - b.sort);
  return (
    <>
      <section className="card">
        <div className="card-title">Heute</div>
        {ctx.members.map((p) => {
          const list = today.filter((c) => c.who === p.id);
          return (
            <div key={p.id} style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 700, color: p.color, paddingTop: 6 }}>{p.name}</span>
              {list.length === 0 ? <span className="small" style={{ padding: '4px 0 6px' }}>heute frei</span> : list.map((c) => (
                <button key={c.id} className="row" onClick={() => toggleChore(ctx, c, ctx.day, c.done)} aria-pressed={c.done}>
                  <Check on={c.done} /><span className={`row-title${c.done ? ' done' : ''}`}>{c.title}</span>
                </button>
              ))}
            </div>
          );
        })}
      </section>
      <section className="card tight">
        <div className="card-title" style={{ padding: '10px 0 4px' }}>Wer macht was, wie oft</div>
        {all.map((c) => {
          const p = ctx.member(c.who);
          return (
            <button key={c.id} className="row" onClick={() => setEdit({ ...c })}>
              <span className="row-main"><span className="row-title">{c.title}</span><span className="small"><b style={{ color: p?.color }}>{p?.name}</b> · {weekdaysLabel(c.weekdays)}</span></span>
              <Icon name="chev" size={18} />
            </button>
          );
        })}
        <div style={{ padding: '8px 0 12px' }}><button className="btn ghost small" onClick={() => setEdit({ title: '', who: null, weekdays: [] })}><Icon name="plus" size={16} />Neues Ämtchen</button></div>
      </section>
      {edit && <ChoreSheet ctx={ctx} chore={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function ChoreSheet({ ctx, chore, onClose }) {
  const [c, setC] = useState(chore);
  const save = async () => {
    if (!c.title.trim() || !c.who) return;
    const row = { title: c.title.trim(), who: c.who, weekdays: [...c.weekdays].sort() };
    const ok = c.id ? await run(supabase.from('chores').update(row).eq('id', c.id), ctx.fail)
      : await run(supabase.from('chores').insert({ ...row, sort: Math.max(0, ...ctx.data.chores.rows.map((x) => x.sort)) + 1 }), ctx.fail);
    if (ok) { ctx.say('Gespeichert'); onClose(); }
  };
  const del = async () => {
    const ok = await run(supabase.from('chores').delete().eq('id', c.id), ctx.fail);
    if (ok) { ctx.say('Ämtchen gelöscht'); onClose(); }
  };
  return (
    <Sheet title={c.id ? 'Ämtchen' : 'Neues Ämtchen'} onClose={onClose}
      actions={<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button className="btn" onClick={save} disabled={!c.title.trim() || !c.who}>Speichern</button>
        {c.id && <button className="btn danger" onClick={del}>Löschen</button>}
      </div>}>
      <label className="field"><span>Was?</span><input className="input" value={c.title} onChange={(e) => setC({ ...c, title: e.target.value })} placeholder="z. B. Spülmaschine ausräumen" maxLength={120} /></label>
      <div className="field"><span>Wer?</span><ChipPick options={ctx.members.map((m) => ({ id: m.id, label: m.name, color: m.color, bg: m.bg }))} value={c.who} onPick={(id) => setC({ ...c, who: id })} /></div>
      <div className="field"><span>An welchen Tagen?</span>
        <ChipPick multi options={WD.map((w, i) => ({ id: i, label: w }))} value={c.weekdays} onPick={(i) => setC({ ...c, weekdays: c.weekdays.includes(i) ? c.weekdays.filter((x) => x !== i) : [...c.weekdays, i] })} />
        <div className="chips">
          <button type="button" className="btn ghost small" onClick={() => setC({ ...c, weekdays: [0, 1, 2, 3, 4, 5, 6] })}>täglich</button>
          <button type="button" className="btn ghost small" onClick={() => setC({ ...c, weekdays: [0, 1, 2, 3, 4] })}>Mo–Fr</button>
          <button type="button" className="btn ghost small" onClick={() => setC({ ...c, weekdays: [5, 6] })}>Wochenende</button>
        </div>
      </div>
    </Sheet>
  );
}

/* ---------------- Haushalt: Wäsche, Putzen, Müll ---------------- */
function Haushalt({ ctx }) {
  return (<><Waesche ctx={ctx} /><Putzen ctx={ctx} /><Muell ctx={ctx} /></>);
}

function Waesche({ ctx }) {
  const last = {};
  for (const r of ctx.data.laundry.rows) if (!last[r.cat] || r.washed_on > last[r.cat].washed_on) last[r.cat] = r;
  const oldest = [...WASH].sort((a, b) => String(last[a]?.washed_on || '').localeCompare(String(last[b]?.washed_on || '')))[0];
  const wash = async (cat) => {
    const res = await run(supabase.from('laundry_log').insert({ cat, washed_on: ctx.day, by_who: ctx.me.id }).select('id').single(), ctx.fail);
    if (res) ctx.say(`${cat} gewaschen`, () => run(supabase.from('laundry_log').delete().eq('id', res.id), ctx.fail));
  };
  return (
    <section className="card">
      <div className="card-head"><div className="card-title">Wäsche</div><span className="small">Antippen = heute gewaschen</span></div>
      <div className="two">
        {WASH.map((c) => (
          <button key={c} className="btn ghost" style={{ flexDirection: 'column', alignItems: 'flex-start', minHeight: 64, gap: 2, borderColor: c === oldest ? '#B45309' : undefined, borderWidth: c === oldest ? 2 : 1 }} onClick={() => wash(c)}>
            <span>{c}</span>
            <span className="small" style={{ fontWeight: 500, color: c === oldest ? '#B45309' : undefined }}>{agoLabel(last[c]?.washed_on, ctx.day)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function Putzen({ ctx }) {
  const [note, setNote] = useState(null); // { area, text }
  const week = mondayOf(ctx.day);
  const done = new Set(ctx.data.areaChecks.rows.filter((c) => c.week_start === week).map((c) => c.area_id));
  const areas = [...ctx.data.areas.rows].sort((a, b) => a.sort - b.sort);
  const notes = ctx.data.notes.rows.filter((n) => !n.done_at);
  const toggle = async (a) => {
    const row = { area_id: a.id, week_start: week };
    const was = done.has(a.id);
    ctx.data.areaChecks.local((rows) => (was ? rows.filter((r) => !(r.area_id === a.id && r.week_start === week)) : [...rows, row]));
    const ok = was ? await run(supabase.from('cleaning_checks').delete().match(row), ctx.fail) : await run(supabase.from('cleaning_checks').upsert(row), ctx.fail);
    if (!ok) ctx.data.areaChecks.reload();
  };
  const noteDone = async (n) => {
    const ok = await run(supabase.from('cleaning_notes').update({ done_at: new Date().toISOString() }).eq('id', n.id), ctx.fail);
    if (ok) ctx.say('Erledigt', () => run(supabase.from('cleaning_notes').update({ done_at: null }).eq('id', n.id), ctx.fail));
  };
  const saveNote = async () => {
    if (!note.text.trim()) return;
    const ok = await run(supabase.from('cleaning_notes').insert({ area_id: note.area, text: note.text.trim(), by_who: ctx.me.id }), ctx.fail);
    if (ok) { ctx.say('Notiz gespeichert'); setNote(null); }
  };
  return (
    <section className="card">
      <div className="card-head"><div className="card-title">Putzen diese Woche</div><span className="small">{done.size}/{areas.length}</span></div>
      {ctx.members.map((p) => {
        const list = areas.filter((a) => a.who === p.id);
        if (!list.length) return null;
        return (
          <div key={p.id}>
            <span style={{ fontWeight: 700, color: p.color }}>{p.name}</span>
            {list.map((a) => (
              <div key={a.id}>
                <button className="row" onClick={() => toggle(a)} aria-pressed={done.has(a.id)}>
                  <Check on={done.has(a.id)} /><span className={`row-title${done.has(a.id) ? ' done' : ''}`}>{a.name}</span>
                </button>
                {notes.filter((n) => n.area_id === a.id).map((n) => (
                  <div key={n.id} className="row" style={{ minHeight: 40, paddingLeft: 38, borderTop: 'none' }}>
                    <span className="row-main"><span className="small" style={{ color: '#92400E' }}>„{n.text}“ · {ctx.member(n.by_who)?.name}</span></span>
                    <button className="btn ghost small" style={{ minHeight: 36 }} onClick={() => noteDone(n)}>Erledigt</button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      })}
      <button className="btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={() => setNote({ area: null, text: '' })}>Putz-Wunsch oder Rückmeldung</button>
      {note && (
        <Sheet title="Putz-Wunsch" onClose={() => setNote(null)} actions={<button className="btn" onClick={saveNote} disabled={!note.text.trim()}>Speichern</button>}>
          <div className="field"><span>Welcher Bereich? (optional)</span>
            <ChipPick options={areas.filter((a) => !ctx.member(a.who)?.kid).map((a) => ({ id: a.id, label: a.name }))} value={note.area} onPick={(id) => setNote({ ...note, area: note.area === id ? null : id })} />
          </div>
          <label className="field"><span>Was?</span><input className="input" value={note.text} onChange={(e) => setNote({ ...note, text: e.target.value })} placeholder="z. B. Spiegel bitte mitputzen" maxLength={300} /></label>
          <div className="small">Nur Catrin und Dirk sehen und schreiben Putz-Wünsche.</div>
        </Sheet>
      )}
      {notes.filter((n) => !n.area_id).map((n) => (
        <div key={n.id} className="row">
          <span className="row-main"><span className="small" style={{ color: '#92400E' }}>„{n.text}“ · {ctx.member(n.by_who)?.name}</span></span>
          <button className="btn ghost small" style={{ minHeight: 36 }} onClick={() => noteDone(n)}>Erledigt</button>
        </div>
      ))}
    </section>
  );
}

function Muell({ ctx }) {
  const m = muellOf(ctx);
  const [newDate, setNewDate] = useState('');
  if (!m) return null;
  const st = muellStatus(m, ctx.day);
  const nextWeek = addDays(mondayOf(ctx.day), 9);
  const cleaning = nextCleaning(m, ctx.day);
  const saveDates = (dates) => run(supabase.from('settings').update({ value: { ...m, cleaning_dates: dates } }).eq('key', 'muell'), ctx.fail);
  return (
    <section className="card">
      <div className="card-title">Müll</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="row-main"><span style={{ fontWeight: 700, color: st.today ? '#B45309' : undefined }}>{st.text}</span><span className="small">{ctx.member(m.out_by)?.name ?? 'Dirk'} stellt raus · Abholung mittwochs</span></span>
        {st.bins.map((b) => <Bin key={b} id={b} size={24} />)}
      </div>
      <div className="small" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        Nächste Woche: {binsForWeek(m, nextWeek).map((b) => <span key={b} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><Bin id={b} size={14} />{BINS[b].label}</span>)}
      </div>
      <div className="divider" style={{ paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontWeight: 600 }}>Tonnenreinigung{cleaning ? `: ${longLabel(cleaning)}` : ''}</span>
        {!cleaning && <span className="small">Kein Termin eingetragen.</span>}
        {(m.cleaning_dates || []).filter((d) => d >= ctx.day).sort().map((d) => (
          <div key={d} className="row" style={{ minHeight: 40 }}>
            <span className="row-main">{shortLabel(d)}</span>
            <button className="icon-btn" style={{ border: 'none' }} aria-label={`${shortLabel(d)} entfernen`} onClick={() => saveDates((m.cleaning_dates || []).filter((x) => x !== d))}><Icon name="trash" size={18} /></button>
          </div>
        ))}
        <div className="add-row">
          <input className="input" type="date" value={newDate} min={ctx.day} onChange={(e) => setNewDate(e.target.value)} aria-label="Termin Tonnenreinigung" />
          <button className="btn" aria-label="Termin hinzufügen" disabled={!newDate} onClick={async () => { if (await saveDates([...new Set([...(m.cleaning_dates || []), newDate])])) setNewDate(''); }}><Icon name="plus" /></button>
        </div>
      </div>
    </section>
  );
}
