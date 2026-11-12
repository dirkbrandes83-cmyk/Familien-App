import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, useTable, useHomeTables, run, learnedSections } from '../data.js';
import { mealOf, muellOf, Bin, choresToday, toggleChore } from './Zuhause.jsx';
import { muellStatus } from '../lib/home.js';
import { Icon, Check, Toast, PersonChips } from '../ui.jsx';
import { addDays, expand, longLabel, shortLabel, today, hm, WDL, weekday } from '../lib/dates.js';
import { sectionOf } from '../lib/shop.js';
import { packList, BringPick } from './common.jsx';

// Familien-Station: gemeinsames iPad. Eigenes Konto mit wenigen Rechten
// (lesen, eintragen, abhaken – nichts löschen, keine Termine ändern).

const IDLE_MS = 120000;

export default function Station({ members }) {
  const kids = members.filter((m) => m.kid);
  const [view, setView] = useState('alle');
  const [day, setDay] = useState(today());
  const [now, setNow] = useState(new Date());
  const [sheet, setSheet] = useState(null);
  const [toast, setToast] = useState(null);
  const idle = useRef(null);
  const hold = useRef(null);

  const data = {
    events: useTable('events'),
    shop: useTable('shopping_items'),
    freq: useTable('frequent_items'),
    rules: useTable('pack_rules'),
    packItems: useTable('pack_items'),
    checks: useTable('pack_checks'),
    inbox: useTable('todo_inbox'),
    buy: useTable('buy_items'),
    ...useHomeTables(),
  };
  const say = useCallback((text) => setToast({ text, k: Math.random() }), []);
  const fail = useCallback((m) => setToast({ text: `Nicht gespeichert: ${m}` }), []);
  const ctx = { members, kids, data, day, say, fail, member: (id) => members.find((m) => m.id === id) };

  // Uhr und Datum
  useEffect(() => {
    const t = setInterval(() => { setNow(new Date()); setDay(today()); }, 15000);
    return () => clearInterval(t);
  }, []);

  // Bildschirm anlassen (Safari ab iOS 16.4)
  useEffect(() => {
    let lock = null;
    const get = async () => { try { lock = await navigator.wakeLock?.request('screen'); } catch { /* nicht unterstützt */ } };
    get();
    const onVis = () => { if (document.visibilityState === 'visible') get(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); lock?.release?.(); };
  }, []);

  // Nach 2 Minuten ohne Berührung zurück zu „Alle“
  useEffect(() => {
    const reset = () => {
      clearTimeout(idle.current);
      idle.current = setTimeout(() => { setView('alle'); setSheet(null); }, IDLE_MS);
    };
    reset();
    window.addEventListener('pointerdown', reset);
    return () => { clearTimeout(idle.current); window.removeEventListener('pointerdown', reset); };
  }, []);

  const faces = [{ id: 'alle', name: 'Alle', color: '#0F766E', bg: '#CCFBF1' }, ...kids];
  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  return (
    <div className="st">
      <header className="st-head">
        <div className="st-clock" onPointerDown={() => { hold.current = setTimeout(() => { if (window.confirm('Station abmelden?')) supabase.auth.signOut(); }, 2500); }}
          onPointerUp={() => clearTimeout(hold.current)} onPointerLeave={() => clearTimeout(hold.current)}>
          <span className="st-time">{clock}</span>
          <span className="st-date">{longLabel(day)}</span>
        </div>
        <nav className="st-faces" aria-label="Ansicht wählen">
          {faces.map((f) => (
            <button key={f.id} className={`st-face${view === f.id ? ' on' : ''}`} aria-pressed={view === f.id}
              style={view === f.id ? { background: f.color, borderColor: f.color, color: '#fff' } : { borderColor: f.bg, color: f.color }}
              onClick={() => setView(f.id)}>
              <span className="st-ini" style={{ background: view === f.id ? 'rgba(255,255,255,0.25)' : f.bg }} aria-hidden="true">{f.name[0]}</span>
              {f.name}
            </button>
          ))}
        </nav>
        <button className="btn st-add" onClick={() => setSheet({ by: view !== 'alle' ? view : null })}><Icon name="plus" size={24} />Eintragen</button>
      </header>

      {view === 'alle' ? <Alle ctx={ctx} openIstAlle={() => setSheet({ step: 'shop' })} />
        : <Kind ctx={ctx} kid={ctx.member(view)} />}

      {sheet && <Eintragen ctx={ctx} init={sheet} onClose={() => setSheet(null)} />}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}

function timeOf(ev) {
  if (ev.all_day) return ev.kind === 'geburtstag' ? 'Geb.' : ev.kind === 'frist' ? 'Frist' : 'ganzt.';
  return hm(ev.from_time);
}

function EvList({ list, ctx, empty = 'Nichts geplant.' }) {
  if (!list.length) return <div className="st-empty">{empty}</div>;
  return list.map((o) => (
    <div key={o.ev.id + o.date} className="st-ev">
      <span className="st-evtime">{timeOf(o.ev)}</span>
      <span className="st-evmain">
        <span className="st-evtitle">{o.ev.title}</span>
        <PersonChips who={o.ev.who} members={ctx.members} />
        <BringPick ev={o.ev} big />
      </span>
    </div>
  ));
}

async function togglePack(ctx, kid, date, item) {
  const row = { kid, on_date: date, item_key: item.key };
  ctx.data.checks.local((rows) => (item.done ? rows.filter((r) => !(r.kid === kid && r.on_date === date && r.item_key === item.key)) : [...rows, row]));
  const ok = item.done
    ? await run(supabase.from('pack_checks').delete().match(row), ctx.fail)
    : await run(supabase.from('pack_checks').upsert(row), ctx.fail);
  if (!ok) ctx.data.checks.reload();
}

function packDate(ctx) {
  return new Date().getHours() < 12 ? ctx.day : addDays(ctx.day, 1);
}

function Alle({ ctx, openIstAlle }) {
  const tomorrow = addDays(ctx.day, 1);
  const occ = expand(ctx.data.events.rows, ctx.day, tomorrow);
  const pd = packDate(ctx);
  const shop = ctx.data.shop.rows.filter((r) => !r.done).sort((a, b) => a.section.localeCompare(b.section) || a.name.localeCompare(b.name, 'de'));
  return (
    <main className="st-grid">
      <section className="st-card">
        <h2>Termine heute</h2>
        <EvList list={occ.filter((o) => o.date === ctx.day)} ctx={ctx} />
        <h3>Morgen · {WDL[weekday(tomorrow)]}</h3>
        <EvList list={occ.filter((o) => o.date === tomorrow)} ctx={ctx} />
      </section>
      <section className="st-card">
        <h2>{pd === ctx.day ? 'Heute mitnehmen' : 'Für morgen einpacken'}</h2>
        {ctx.kids.map((k) => {
          const { items, notes } = packList(ctx, k.id, pd);
          return (
            <div key={k.id} className="st-kid">
              <span className="st-kidname" style={{ color: k.color }}>{k.name}</span>
              {notes.map((n) => <div key={n.id} className="st-note">{n.text}</div>)}
              {items.length === 0 && <div className="st-empty">Nichts einzupacken.</div>}
              {items.map((it) => (
                <button key={it.key} className="st-check" onClick={() => togglePack(ctx, k.id, pd, it)} aria-pressed={it.done}>
                  <Check on={it.done} /><span className={it.done ? 'done' : ''}>{it.text}</span>
                </button>
              ))}
            </div>
          );
        })}
      </section>
      <section className="st-card">
        <div className="st-cardhead"><h2>Einkaufsliste</h2>{shop.length > 0 && <span className="badge">{shop.length}</span>}</div>
        {shop.length === 0 ? <div className="st-empty">Alles da.</div>
          : <ul className="st-shop">{shop.slice(0, 14).map((s) => <li key={s.id}>{s.name}</li>)}</ul>}
        {shop.length > 14 && <div className="st-empty">… und {shop.length - 14} weitere</div>}
        <button className="btn st-big" onClick={openIstAlle}>Ist alle!</button>
      </section>
      <BonusRow ctx={ctx} />
    </main>
  );
}

function BonusRow({ ctx }) {
  const tomorrow = addDays(ctx.day, 1);
  const m = muellOf(ctx);
  const st = m ? muellStatus(m, ctx.day) : null;
  const chores = choresToday(ctx, ctx.day);
  return (
    <>
      <section className="st-card st-small">
        <h2>Essen heute</h2>
        <div className="st-meal">{mealOf(ctx, ctx.day).title}</div>
        <div className="st-empty">Morgen: {mealOf(ctx, tomorrow).title}</div>
        {st && (
          <>
            <h3>Müll</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontWeight: 700, color: st.today ? '#B45309' : undefined, flex: '1 1 auto' }}>{st.text}</span>
              {st.bins.map((b) => <Bin key={b} id={b} size={30} />)}
            </div>
          </>
        )}
      </section>
      <section className="st-card st-wide">
        <h2>Wer macht heute was</h2>
        <div className="st-who">
          {ctx.members.map((p) => {
            const list = chores.filter((c) => c.who === p.id);
            return (
              <div key={p.id} className="st-kid">
                <span className="st-kidname" style={{ color: p.color }}>{p.name}</span>
                {list.length === 0 ? <span className="st-empty">heute frei</span> : list.map((c) => (
                  <button key={c.id} className="st-check" onClick={() => toggleChore(ctx, c, ctx.day, c.done)} aria-pressed={c.done}>
                    <Check on={c.done} /><span className={c.done ? 'done' : ''}>{c.title}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

function Kind({ ctx, kid }) {
  const [which, setWhich] = useState(() => (new Date().getHours() < 12 ? 'h' : 'm'));
  const date = which === 'h' ? ctx.day : addDays(ctx.day, 1);
  const { items, notes } = packList(ctx, kid.id, date);
  const occ = expand(ctx.data.events.rows, ctx.day, addDays(ctx.day, 1)).filter((o) => o.ev.who.includes(kid.id) || o.ev.who.includes('all'));
  const open = items.filter((i) => !i.done);
  const read = () => {
    const parts = [
      `${kid.name}, ${which === 'h' ? 'heute' : 'morgen'}:`,
      ...notes.map((n) => n.text),
      open.length ? `Einpacken: ${open.map((i) => i.text).join(', ')}.` : 'Alles eingepackt.',
    ];
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(parts.join(' '));
      u.lang = 'de-DE';
      window.speechSynthesis.speak(u);
    } catch { /* kein Vorlesen möglich */ }
  };
  return (
    <main className="st-grid two">
      <section className="st-card">
        <div className="st-cardhead">
          <h2 style={{ color: kid.color }}>Einpacken</h2>
          <button className="icon-btn" onClick={read} aria-label="Vorlesen" style={{ width: 56, height: 56 }}><SpeakIcon /></button>
        </div>
        <div className="seg st-seg" role="group" aria-label="Heute oder morgen">
          <button className={which === 'h' ? 'on' : ''} aria-pressed={which === 'h'} onClick={() => setWhich('h')}>Heute</button>
          <button className={which === 'm' ? 'on' : ''} aria-pressed={which === 'm'} onClick={() => setWhich('m')}>Morgen</button>
        </div>
        {notes.length > 0 && (
          <div className="st-notes">
            {notes.map((n) => <div key={n.id} className="st-note big">{n.art === 'bes' ? 'Besonders: ' : 'Steht an: '}{n.text}</div>)}
          </div>
        )}
        {items.length === 0 && <div className="st-empty">Nichts einzupacken.</div>}
        {items.map((it) => (
          <button key={it.key} className="st-check big" onClick={() => togglePack(ctx, kid.id, date, it)} aria-pressed={it.done}>
            <Check on={it.done} /><span className={it.done ? 'done' : ''}>{it.text}</span>
          </button>
        ))}
        {items.length > 0 && open.length === 0 && <div className="st-done">Alles eingepackt!</div>}
      </section>
      <section className="st-card">
        <FuerMich ctx={ctx} kid={kid} />
        <h2>Meine Termine</h2>
        <h3>Heute</h3>
        <EvList list={occ.filter((o) => o.date === ctx.day)} ctx={ctx} />
        <h3>Morgen</h3>
        <EvList list={occ.filter((o) => o.date !== ctx.day)} ctx={ctx} />
        <h3>Meine Ämtchen heute</h3>
        {(() => {
          const mine = choresToday(ctx, ctx.day).filter((c) => c.who === kid.id);
          return mine.length === 0 ? <div className="st-empty">Heute frei.</div> : mine.map((c) => (
            <button key={c.id} className="st-check" onClick={() => toggleChore(ctx, c, ctx.day, c.done)} aria-pressed={c.done}>
              <Check on={c.done} /><span className={c.done ? 'done' : ''}>{c.title}</span>
            </button>
          ));
        })()}
        <h3>Essen heute</h3>
        <div className="st-meal">{mealOf(ctx, ctx.day).title}</div>
      </section>
    </main>
  );
}

// Erinnerungen, die dieses Kind betreffen: Erledigen, Besorgen und Geschenke zu seinen Terminen
function fuerKind(ctx, kidId) {
  const evById = new Map(ctx.data.events.rows.map((e) => [e.id, e]));
  const todos = ctx.data.inbox.rows.filter((r) => !r.done_at && r.for_who === kidId)
    .map((r) => ({ id: 't' + r.id, text: r.title, due: r.due }));
  const buys = ctx.data.buy.rows.filter((r) => {
    if (r.done) return false;
    if (r.for_who === kidId) return true;
    const ev = r.event_id && evById.get(r.event_id);
    return !!ev && ev.kind !== 'geburtstag' && ev.who.includes(kidId);
  }).map((r) => ({ id: 'b' + r.id, text: r.typ === 'kleidung' ? `${r.art}${r.size ? ' (' + r.size + ')' : ''} besorgen` : r.art, due: r.due }));
  return [...todos, ...buys].sort((a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999')));
}

function FuerMich({ ctx, kid }) {
  const list = fuerKind(ctx, kid.id);
  if (!list.length) return null;
  return (
    <>
      <h2>Für mich</h2>
      <div className="st-notes" style={{ marginBottom: 16 }}>
        {list.map((x) => (
          <div key={x.id} className="st-note big">
            {x.text}{x.due ? <span style={{ fontWeight: 500 }}> · bis {shortLabel(x.due)}</span> : null}
          </div>
        ))}
      </div>
    </>
  );
}

function SpeakIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="M16.5 8.5a5 5 0 0 1 0 7" /><path d="M19 6a8.5 8.5 0 0 1 0 12" />
    </svg>
  );
}

/* ---------------- Eintragen ---------------- */
const IST_ALLE = ['Milch', 'Brot', 'Müsli', 'Äpfel', 'Bananen', 'Joghurt', 'Käse', 'Butter', 'Toilettenpapier', 'Zahnpasta'];
const ANST = ['Arztbesuch', 'Geburtstagsgeschenk', 'Formular unterschreiben', 'Elternbrief', 'Bastelmaterial', 'Friseur'];
const ARTS = ['Sportbekleidung', 'Hose', 'Schuhe', 'Regenjacke', 'Winterjacke', 'Pullover', 'T-Shirts', 'Socken', 'Unterwäsche', 'Mütze/Handschuhe'];
const KID_SIZES = ['122', '128', '134', '140', '146', '152', '158', '164'];
const SHOE_SIZES = ['28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40'];
const ADULT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

function Eintragen({ ctx, init, onClose }) {
  const [by, setBy] = useState(init.by ?? null);
  const [step, setStep] = useState(init.step ?? null);
  const [text, setText] = useState('');
  const [picked, setPicked] = useState([]);
  const [kf, setKf] = useState({ forWho: init.by ?? null, art: null, size: '' });
  const [kidFor, setKidFor] = useState(init.by && ctx.member(init.by)?.kid ? init.by : null);
  const [busy, setBusy] = useState(false);
  const who = ctx.member(by);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const done = (msg) => { ctx.say(msg); onClose(); };
  const openShop = new Set(ctx.data.shop.rows.filter((r) => !r.done).map((r) => r.name.toLowerCase()));

  const saveShop = async () => {
    const names = [...picked, ...text.split(/,|\n/).map((s) => s.trim()).filter(Boolean)]
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .filter((n, i, a) => a.findIndex((x) => x.toLowerCase() === n.toLowerCase()) === i && !openShop.has(n.toLowerCase()));
    if (!names.length) { done('Steht schon auf der Liste'); return; }
    setBusy(true);
    const ok = await run(supabase.from('shopping_items').insert(names.map((name) => ({ name, section: sectionOf(name, learnedSections(ctx.data)), added_by: who ? `${who.name} · Ist alle!` : 'Station · Ist alle!' }))), ctx.fail);
    setBusy(false);
    if (ok) done(names.length === 1 ? `${names[0]} steht auf der Liste` : `${names.length} Dinge auf der Liste`);
  };
  const saveAnst = async (title) => {
    if (!title.trim()) return;
    setBusy(true);
    const ok = await run(supabase.from('todo_inbox').insert({ title: title.trim(), for_who: who?.kid ? who.id : null, by_who: by }), ctx.fail);
    setBusy(false);
    if (ok) done('An Dirk zum Einplanen geschickt');
  };
  const saveKleidung = async () => {
    if (!kf.forWho || !kf.art) return;
    setBusy(true);
    const ok = await run(supabase.from('buy_items').insert({ for_who: kf.forWho, art: kf.art, size: kf.size, by_who: by }), ctx.fail);
    setBusy(false);
    if (ok) done('Eingetragen – Catrin und Dirk sehen es');
  };
  const saveMit = async () => {
    if (!kidFor || !text.trim()) return;
    setBusy(true);
    const ok = await run(supabase.from('pack_items').insert({ kid: kidFor, on_date: addDays(ctx.day, 1), art: 'mit', text: text.trim(), by_who: by }), ctx.fail);
    setBusy(false);
    if (ok) done('Steht für morgen auf der Einpackliste');
  };

  const tiles = [
    ['shop', 'Ist alle!', 'Etwas ist aufgebraucht'],
    ['mit', 'Muss morgen mit', 'Für die Einpackliste'],
    ['kleidung', 'Kleidung brauche ich', 'Was und welche Größe'],
    ['besorgen', 'Muss besorgt werden', 'z. B. Geschenk, Bastelsachen'],
    ['anst', 'Termin muss gemacht werden', 'Dirk plant es ein'],
    ['wunsch', 'Essenswunsch', 'Catrin plant es ein'],
  ];
  const titles = { besorgen: 'Muss besorgt werden', shop: 'Ist alle!', mit: 'Muss morgen mit', kleidung: 'Kleidung brauche ich', anst: 'Termin muss gemacht werden', wunsch: 'Essenswunsch' };
  const saveWunsch = async (title) => {
    if (!title.trim()) return;
    setBusy(true);
    const ok = await run(supabase.from('meal_wishes').insert({ who: by, title: title.trim() }), ctx.fail);
    setBusy(false);
    if (ok) done('Wunsch ist bei Catrin angekommen');
  };
  const sizeList = kf.art === 'Schuhe' ? SHOE_SIZES : ctx.member(kf.forWho)?.kid ? KID_SIZES : ADULT_SIZES;
  const chip = (on, p) => (on ? { background: p?.color || '#1C1917', borderColor: p?.color || '#1C1917', color: '#fff' } : { borderColor: p?.bg || '#D6CFC4', color: p?.color || '#1C1917' });

  return (
    <div className="sheet-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet st-sheet" role="dialog" aria-modal="true" aria-label={step ? titles[step] : 'Eintragen'}>
        <div className="sheet-head">
          <h2>{step ? titles[step] : 'Eintragen'}</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            {step && <button className="icon-btn st-icon" onClick={() => { setStep(null); setText(''); setPicked([]); }} aria-label="Zurück"><Icon name="left" /></button>}
            <button className="icon-btn st-icon" onClick={onClose} aria-label="Schließen"><Icon name="x" /></button>
          </div>
        </div>

        <div className="field"><span>Wer bist du?</span>
          <div className="chips">
            {ctx.members.map((m) => (
              <button key={m.id} className="chip st-chip" style={chip(by === m.id, m)} aria-pressed={by === m.id}
                onClick={() => { setBy(m.id); if (!kf.forWho) setKf({ ...kf, forWho: m.id }); if (m.kid && !kidFor) setKidFor(m.id); }}>{m.name}</button>
            ))}
          </div>
        </div>

        {!step && (
          <div className="st-tiles">
            {tiles.map(([id, label, sub]) => (
              <button key={id} className="st-tile" onClick={() => setStep(id)}>
                <span className="st-tilelabel">{label}</span><span className="sub">{sub}</span>
              </button>
            ))}
          </div>
        )}

        {step === 'shop' && (
          <>
            <div className="chips">
              {IST_ALLE.filter((n) => !openShop.has(n.toLowerCase())).map((n) => (
                <button key={n} className="chip st-chip" style={chip(picked.includes(n))} aria-pressed={picked.includes(n)}
                  onClick={() => setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]))}>{n}</button>
              ))}
            </div>
            <label className="field"><span>Oder selbst schreiben</span>
              <input className="input st-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="z. B. Nutella" />
            </label>
            <button className="btn st-big" disabled={busy || (!picked.length && !text.trim())} onClick={saveShop}>Auf die Einkaufsliste</button>
          </>
        )}

        {step === 'mit' && (
          <>
            <div className="field"><span>Für wen?</span>
              <div className="chips">
                {ctx.kids.map((k) => <button key={k.id} className="chip st-chip" style={chip(kidFor === k.id, k)} aria-pressed={kidFor === k.id} onClick={() => setKidFor(k.id)}>{k.name}</button>)}
              </div>
            </div>
            <label className="field"><span>Was muss morgen mit?</span>
              <input className="input st-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="z. B. Turnbeutel" maxLength={200} />
            </label>
            <button className="btn st-big" disabled={busy || !kidFor || !text.trim()} onClick={saveMit}>Auf die Einpackliste für morgen</button>
          </>
        )}

        {step === 'kleidung' && (
          <>
            <div className="field"><span>Für wen?</span>
              <div className="chips">
                {ctx.members.map((m) => <button key={m.id} className="chip st-chip" style={chip(kf.forWho === m.id, m)} aria-pressed={kf.forWho === m.id} onClick={() => setKf({ ...kf, forWho: m.id, size: '' })}>{m.name}</button>)}
              </div>
            </div>
            <div className="field"><span>Was?</span>
              <div className="chips">
                {ARTS.map((a) => <button key={a} className="chip st-chip" style={chip(kf.art === a)} aria-pressed={kf.art === a} onClick={() => setKf({ ...kf, art: a, size: '' })}>{a}</button>)}
              </div>
            </div>
            {kf.forWho && kf.art && (
              <div className="field"><span>Größe (wenn du sie weißt)</span>
                <div className="chips">
                  {sizeList.map((s) => <button key={s} className="chip st-chip" style={chip(kf.size === s)} aria-pressed={kf.size === s} onClick={() => setKf({ ...kf, size: kf.size === s ? '' : s })}>{s}</button>)}
                </div>
              </div>
            )}
            <button className="btn st-big" disabled={busy || !kf.forWho || !kf.art} onClick={saveKleidung}>Eintragen</button>
          </>
        )}

        {step === 'besorgen' && (
          <>
            <div className="chips">
              {['Geburtstagsgeschenk', 'Bastelmaterial', 'Schulmaterial', 'Hefte', 'Stifte'].map((a) => (
                <button key={a} className="chip st-chip" style={chip(text === a)} onClick={() => setText(a)}>{a}</button>
              ))}
            </div>
            <label className="field"><span>Was genau?</span>
              <input className="input st-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="z. B. Geschenk für Paul (Feier am Samstag)" maxLength={160} />
            </label>
            <button className="btn st-big" disabled={busy || !text.trim()} onClick={async () => {
              setBusy(true);
              const ok = await run(supabase.from('buy_items').insert({ typ: 'sonstiges', art: text.trim(), for_who: who?.kid ? who.id : null, by_who: by }), ctx.fail);
              setBusy(false);
              if (ok) done('Eingetragen – Catrin und Dirk sehen es');
            }}>Eintragen</button>
          </>
        )}

        {step === 'wunsch' && (
          <>
            <div className="chips">
              {[...ctx.data.recipes.rows].sort((a, b) => a.name.localeCompare(b.name, 'de')).filter((r) => r.name !== 'Pizza').map((r) => (
                <button key={r.id} className="chip st-chip" disabled={busy || !by} onClick={() => saveWunsch(r.name)}>{r.name}</button>
              ))}
            </div>
            <label className="field"><span>Oder selbst schreiben</span>
              <input className="input st-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="z. B. Milchreis" maxLength={120} />
            </label>
            {!by && <div className="st-empty">Bitte oben antippen, wer du bist.</div>}
            <button className="btn st-big" disabled={busy || !by || !text.trim()} onClick={() => saveWunsch(text)}>Wunsch abschicken</button>
          </>
        )}

        {step === 'anst' && (
          <>
            <div className="chips">
              {ANST.map((a) => <button key={a} className="chip st-chip" disabled={busy} onClick={() => saveAnst(a)}>{a}</button>)}
            </div>
            <label className="field"><span>Oder selbst schreiben</span>
              <input className="input st-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="z. B. Laterne basteln" maxLength={200} />
            </label>
            <button className="btn st-big" disabled={busy || !text.trim()} onClick={() => saveAnst(text)}>An Dirk zum Einplanen</button>
          </>
        )}
      </div>
    </div>
  );
}
