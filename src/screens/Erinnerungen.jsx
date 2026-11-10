import { useState } from 'react';
import { supabase, run } from '../data.js';
import { Icon, Check, Swipe, Sheet, Seg, ChipPick } from '../ui.jsx';
import { addDays, longLabel, WD } from '../lib/dates.js';
import { packList, packDay } from './common.jsx';

export default function Erinnerungen({ ctx, seg, setSeg }) {
  const inboxN = ctx.data.inbox.rows.filter((r) => !r.done_at).length;
  const buyN = ctx.data.buy.rows.filter((r) => !r.done).length;
  return (
    <>
      <Seg label="Bereich" value={seg} onPick={setSeg} options={[
        ['mitnehmen', 'Mitnehmen'],
        ['vereinbaren', `Vereinbaren${inboxN ? ` · ${inboxN}` : ''}`],
        ['besorgen', `Besorgen${buyN ? ` · ${buyN}` : ''}`],
      ]} />
      {seg === 'mitnehmen' ? <Mitnehmen ctx={ctx} /> : seg === 'vereinbaren' ? <Vereinbaren ctx={ctx} /> : <Besorgen ctx={ctx} />}
    </>
  );
}

const ART = { mit: 'Mitbringen', an: 'Steht an', bes: 'Besonderheit' };
const kidOpts = (ctx) => ctx.kids.map((k) => ({ id: k.id, label: k.name, color: k.color, bg: k.bg }));

/* ---------------- Mitnehmen ---------------- */
function Mitnehmen({ ctx }) {
  const [date, setDate] = useState(() => packDay(ctx));
  const [sheet, setSheet] = useState(null); // 'one' | 'rule'
  const tomorrow = addDays(ctx.day, 1);
  const label = date === ctx.day ? 'Heute' : date === tomorrow ? 'Morgen' : longLabel(date);

  const toggle = async (kid, item) => {
    const row = { kid, on_date: date, item_key: item.key };
    ctx.data.checks.local((rows) => (item.done ? rows.filter((r) => !(r.kid === kid && r.on_date === date && r.item_key === item.key)) : [...rows, row]));
    const ok = item.done
      ? await run(supabase.from('pack_checks').delete().match(row), ctx.fail)
      : await run(supabase.from('pack_checks').upsert(row), ctx.fail);
    if (!ok) ctx.data.checks.reload();
  };
  const removeOne = async (p) => {
    const ok = await run(supabase.from('pack_items').delete().eq('id', p.id), ctx.fail);
    if (ok) ctx.say('Eintrag gelöscht', () => run(supabase.from('pack_items').insert(p), ctx.fail));
  };

  return (
    <>
      <Seg label="Tag" value={date === ctx.day ? 'h' : date === tomorrow ? 'm' : 'x'} onPick={(v) => setDate(v === 'h' ? ctx.day : tomorrow)}
        options={[['h', 'Heute'], ['m', 'Morgen']]} />
      {ctx.kids.map((k) => {
        const { items, notes } = packList(ctx, k.id, date);
        const allDone = items.length > 0 && items.every((i) => i.done);
        return (
          <section key={k.id} className="card" style={{ gap: 4 }}>
            <div className="card-head">
              <span style={{ fontWeight: 700, fontSize: 18, color: k.color }}>{k.name}</span>
              <span className="small">{label}</span>
            </div>
            {notes.map((n) => (
              <Swipe key={n.id} onLeft={() => removeOne(n)}>
                <div className="row" style={{ minHeight: 40 }}><span className="tag">{ART[n.art]}</span><span className="row-main">{n.text}</span></div>
              </Swipe>
            ))}
            {items.length === 0 && <div className="empty">Nichts einzupacken.</div>}
            {items.map((it) => {
              const btn = (
                <button className="row" onClick={() => toggle(k.id, it)} aria-pressed={it.done}>
                  <Check on={it.done} />
                  <span className="row-main">
                    <span className={`row-title${it.done ? ' done' : ''}`}>{it.text}</span>
                    {it.rule && <span className="small">jede Woche · {it.rule.weekdays.map((w) => WD[w]).join(', ')}</span>}
                  </span>
                </button>
              );
              return it.one ? <Swipe key={it.key} onLeft={() => removeOne(it.one)}>{btn}</Swipe> : <div key={it.key}>{btn}</div>;
            })}
            {allDone && <div className="ok" style={{ fontWeight: 600 }}>Alles eingepackt.</div>}
          </section>
        );
      })}
      <button className="btn" onClick={() => setSheet('one')}><Icon name="plus" size={18} />Mitnehmen eintragen</button>
      <Regeln ctx={ctx} onAdd={() => setSheet('rule')} />
      {sheet === 'one' && <OneSheet ctx={ctx} date={date} onClose={() => setSheet(null)} />}
      {sheet === 'rule' && <RuleSheet ctx={ctx} onClose={() => setSheet(null)} />}
    </>
  );
}

function Regeln({ ctx, onAdd }) {
  const [open, setOpen] = useState(false);
  const rules = ctx.data.rules.rows;
  const del = async (r) => {
    const ok = await run(supabase.from('pack_rules').delete().eq('id', r.id), ctx.fail);
    if (ok) ctx.say('Erinnerung gelöscht', () => run(supabase.from('pack_rules').insert(r), ctx.fail));
  };
  return (
    <section className="card tight">
      <button className="row" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="row-main">
          <span style={{ fontWeight: 700 }}>Jede Woche mitnehmen</span>
          <span className="small">{rules.length} feste Erinnerungen, z. B. Fußballsachen</span>
        </span>
        <Icon name="down" size={18} style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <>
          {ctx.kids.map((k) => rules.filter((r) => r.kid === k.id).map((r) => (
            <div key={r.id} className="row">
              <span className="row-main">
                <span className="row-title">{r.item}</span>
                <span className="small" style={{ color: k.color, fontWeight: 600 }}>{k.name} · {r.weekdays.slice().sort().map((w) => WD[w]).join(', ') || 'kein Tag'}</span>
              </span>
              <button className="icon-btn" style={{ border: 'none' }} aria-label={`${r.item} löschen`} onClick={() => del(r)}><Icon name="trash" size={18} /></button>
            </div>
          )))}
          <div style={{ padding: '8px 0 12px' }}><button className="btn ghost small" onClick={onAdd}><Icon name="plus" size={16} />Feste Erinnerung</button></div>
        </>
      )}
    </section>
  );
}

function OneSheet({ ctx, date, onClose }) {
  const [kid, setKid] = useState(ctx.kids[0]?.id);
  const [d, setD] = useState(date);
  const [art, setArt] = useState('mit');
  const [text, setText] = useState('');
  const save = async () => {
    if (!text.trim()) return;
    const ok = await run(supabase.from('pack_items').insert({ kid, on_date: d, art, text: text.trim(), by_who: ctx.me.id }), ctx.fail);
    if (ok) { ctx.say('Eingetragen'); onClose(); }
  };
  return (
    <Sheet title="Mitnehmen eintragen" onClose={onClose} actions={<button className="btn" onClick={save} disabled={!text.trim()}>Eintragen</button>}>
      <div className="field"><span>Für wen?</span><ChipPick options={kidOpts(ctx)} value={kid} onPick={setKid} /></div>
      <div className="field"><span>Was ist es?</span><Seg label="Art" value={art} onPick={setArt} options={Object.entries(ART)} /></div>
      <label className="field"><span>{art === 'mit' ? 'Was muss mit?' : 'Was steht an?'}</span>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={art === 'mit' ? 'z. B. Geld für den Ausflug' : 'z. B. Fotograf kommt'} maxLength={200} autoFocus />
      </label>
      <label className="field"><span>An welchem Tag?</span>
        <input className="input" type="date" value={d} min={ctx.day} onChange={(e) => setD(e.target.value)} />
      </label>
    </Sheet>
  );
}

function RuleSheet({ ctx, onClose }) {
  const [kid, setKid] = useState(ctx.kids[0]?.id);
  const [days, setDays] = useState([]);
  const [text, setText] = useState('');
  const save = async () => {
    if (!text.trim() || !days.length) return;
    const ok = await run(supabase.from('pack_rules').insert({ kid, item: text.trim(), weekdays: days.sort() }), ctx.fail);
    if (ok) { ctx.say('Feste Erinnerung angelegt'); onClose(); }
  };
  return (
    <Sheet title="Jede Woche mitnehmen" onClose={onClose} actions={<button className="btn" onClick={save} disabled={!text.trim() || !days.length}>Anlegen</button>}>
      <div className="field"><span>Für wen?</span><ChipPick options={kidOpts(ctx)} value={kid} onPick={setKid} /></div>
      <label className="field"><span>Was?</span>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="z. B. Turnbeutel" maxLength={200} autoFocus />
      </label>
      <div className="field"><span>An welchen Tagen?</span>
        <ChipPick multi options={WD.map((w, i) => ({ id: i, label: w }))} value={days} onPick={(i) => setDays((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i]))} />
      </div>
    </Sheet>
  );
}

/* ---------------- Termine vereinbaren ---------------- */
function Vereinbaren({ ctx }) {
  const [text, setText] = useState('');
  const [forWho, setForWho] = useState(null);
  const open = ctx.data.inbox.rows.filter((r) => !r.done_at).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const add = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    const ok = await run(supabase.from('todo_inbox').insert({ title: text.trim(), for_who: forWho, by_who: ctx.me.id }), ctx.fail);
    if (ok) { setText(''); setForWho(null); ctx.say(ctx.isDirk ? 'Eingetragen' : 'Eingetragen – Dirk plant es ein'); }
  };
  const finish = async (r) => {
    const ok = await run(supabase.from('todo_inbox').update({ done_at: new Date().toISOString() }).eq('id', r.id), ctx.fail);
    if (ok) ctx.say('Erledigt', () => run(supabase.from('todo_inbox').update({ done_at: null }).eq('id', r.id), ctx.fail));
  };
  const del = async (r) => {
    const ok = await run(supabase.from('todo_inbox').delete().eq('id', r.id), ctx.fail);
    if (ok) ctx.say('Gelöscht', () => run(supabase.from('todo_inbox').insert(r), ctx.fail));
  };
  const plan = (r) => ctx.openEvent(null, { title: r.title, who: r.for_who ? [r.for_who] : ['all'], inboxId: r.id, start_date: ctx.day });
  const whoOpts = ctx.members.map((m) => ({ id: m.id, label: m.name, color: m.color, bg: m.bg }));

  return (
    <>
      <section className="card">
        <div className="card-head">
          <div><div className="card-title">Termine vereinbaren</div><div className="small">Ohne Datum – Dirk macht daraus einen Termin oder eine Frist.</div></div>
          <span className="badge">{open.length}</span>
        </div>
        {open.length === 0 && <div className="empty">Alles eingeplant.</div>}
        <div>
          {open.map((r) => {
            const who = ctx.member(r.for_who);
            const by = ctx.member(r.by_who);
            return (
              <Swipe key={r.id} onRight={() => finish(r)} onLeft={() => del(r)}>
                <div className="row">
                  <span className="row-main">
                    <span className="row-title" style={{ fontWeight: 600 }}>{r.title}</span>
                    <span className="small">{who ? <b style={{ color: who.color }}>{who.name}</b> : 'Familie'}{by ? ` · eingetragen von ${by.name}` : ''}</span>
                  </span>
                  {ctx.isDirk && <button className="btn small" onClick={() => plan(r)}>Einplanen</button>}
                </div>
              </Swipe>
            );
          })}
        </div>
        {!ctx.isDirk && open.length > 0 && <div className="small">Dirk plant das ein. Wischen: rechts = erledigt, links = löschen.</div>}
      </section>
      <form className="card" onSubmit={add}>
        <label className="field"><span>Was muss vereinbart werden?</span>
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="z. B. Zahnarzt Emil" maxLength={200} />
        </label>
        <div className="field"><span>Für wen? (optional)</span><ChipPick options={whoOpts} value={forWho} onPick={(id) => setForWho(forWho === id ? null : id)} /></div>
        <button className="btn" disabled={!text.trim()}><Icon name="plus" size={18} />Eintragen</button>
      </form>
    </>
  );
}

/* ---------------- Besorgen (Kleidung) ---------------- */
const ARTS = ['Sportbekleidung', 'Arbeitskleidung', 'Hose', 'Schuhe', 'Regenjacke', 'Winterjacke', 'Pullover', 'T-Shirts', 'Socken', 'Unterwäsche', 'Schlafanzug', 'Mütze/Handschuhe'];
const KID_SIZES = ['122', '128', '134', '140', '146', '152', '158', '164'];
const SHOE_SIZES = ['28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40'];
const ADULT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

function Besorgen({ ctx }) {
  const [sheet, setSheet] = useState(null);
  const open = ctx.data.buy.rows.filter((r) => !r.done).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const done = async (r) => {
    ctx.data.buy.local((rows) => rows.map((x) => (x.id === r.id ? { ...x, done: true } : x)));
    const ok = await run(supabase.from('buy_items').update({ done: true, done_at: new Date().toISOString() }).eq('id', r.id), ctx.fail);
    if (ok) ctx.say(`${r.art} besorgt`, () => run(supabase.from('buy_items').update({ done: false, done_at: null }).eq('id', r.id), ctx.fail));
    else ctx.data.buy.reload();
  };
  const del = async (r) => {
    const ok = await run(supabase.from('buy_items').delete().eq('id', r.id), ctx.fail);
    if (ok) ctx.say('Gelöscht', () => run(supabase.from('buy_items').insert(r), ctx.fail));
  };
  return (
    <>
      <div className="chips">
        <button className="btn" onClick={() => setSheet({})}><Icon name="plus" size={18} />Kleidung eintragen</button>
        {ctx.me.id === 'catrin' && <button className="btn ghost" style={{ color: '#7E22CE', borderColor: '#7E22CE', borderWidth: 2 }} onClick={() => setSheet({ for_who: 'catrin', art: 'Arbeitskleidung' })}>Brauche Arbeitskleidung</button>}
        <button className="btn ghost" onClick={() => setSheet({ art: 'Sportbekleidung' })}>Sportbekleidung</button>
      </div>
      <section className="card tight">
        {open.length === 0 && <div className="empty" style={{ padding: '14px 0' }}>Nichts zu besorgen.</div>}
        {open.map((r) => {
          const w = ctx.member(r.for_who);
          const by = ctx.member(r.by_who);
          return (
            <Swipe key={r.id} onRight={() => done(r)} onLeft={() => del(r)}>
              <button className="row" style={{ minHeight: 56 }} onClick={() => done(r)}>
                <Check on={false} />
                <span className="row-main">
                  <span className="row-title">{r.art}{r.size ? ` · Gr. ${r.size}` : ''}</span>
                  <span className="small">{[r.note, by && by.id !== r.for_who ? `von ${by.name}` : null].filter(Boolean).join(' · ')}</span>
                </span>
                {w && <span className="pchip" style={{ background: w.bg, color: w.color }}>{w.name}</span>}
              </button>
            </Swipe>
          );
        })}
      </section>
      {open.length > 0 && <div className="small">Antippen = besorgt. Nach links wischen = löschen.</div>}
      {sheet && <BuySheet ctx={ctx} preset={sheet} onClose={() => setSheet(null)} />}
    </>
  );
}

function BuySheet({ ctx, preset, onClose }) {
  const [forWho, setForWho] = useState(preset.for_who ?? null);
  const [art, setArt] = useState(preset.art ?? null);
  const [size, setSize] = useState('');
  const [note, setNote] = useState('');
  const who = ctx.member(forWho);
  const sizes = art === 'Schuhe' ? SHOE_SIZES : who?.kid ? KID_SIZES : ADULT_SIZES;
  const save = async () => {
    if (!forWho || !art) return;
    const ok = await run(supabase.from('buy_items').insert({ for_who: forWho, art, size, note: note.trim(), by_who: ctx.me.id }), ctx.fail);
    if (ok) { ctx.say('Eingetragen'); onClose(); }
  };
  return (
    <Sheet title="Kleidung besorgen" onClose={onClose} actions={<button className="btn" onClick={save} disabled={!forWho || !art}>Eintragen</button>}>
      <div className="field"><span>Für wen?</span>
        <ChipPick options={ctx.members.map((m) => ({ id: m.id, label: m.name, color: m.color, bg: m.bg }))} value={forWho} onPick={(id) => { setForWho(id); setSize(''); }} />
      </div>
      <div className="field"><span>Was?</span>
        <ChipPick options={ARTS.map((a) => ({ id: a, label: a }))} value={art} onPick={(a) => { setArt(a); setSize(''); }} />
      </div>
      {forWho && art && (
        <div className="field"><span>Größe (optional)</span>
          <ChipPick options={sizes.map((s) => ({ id: s, label: s }))} value={size} onPick={(s) => setSize(size === s ? '' : s)} />
        </div>
      )}
      <label className="field"><span>Notiz (optional)</span>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Hallenschuhe, helle Sohle" maxLength={200} />
      </label>
    </Sheet>
  );
}
