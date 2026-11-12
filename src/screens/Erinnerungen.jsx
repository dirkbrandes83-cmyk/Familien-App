import { useState } from 'react';
import { supabase, run } from '../data.js';
import { Icon, Check, Swipe, Sheet, Seg, ChipPick, CatIcon } from '../ui.jsx';
import { addDays, longLabel, shortLabel, WD } from '../lib/dates.js';
import { packList, packDay } from './common.jsx';
import Geschenke from './Geschenke.jsx';

export default function Erinnerungen({ ctx, seg, setSeg }) {
  const inboxN = ctx.data.inbox.rows.filter((r) => !r.done_at).length;
  const buyN = ctx.data.buy.rows.filter((r) => !r.done).length;
  return (
    <>
      <Seg label="Bereich" value={seg} onPick={setSeg} options={[
        ['vereinbaren', <SegIcon name="todo" n={inboxN} />, `Erledigen${inboxN ? `, ${inboxN} offen` : ''}`],
        ['mitnehmen', <SegIcon name="backpack" />, 'Mitnehmen'],
        ['besorgen', <SegIcon name="bag" n={buyN} />, `Besorgen${buyN ? `, ${buyN} offen` : ''}`],
        ['geschenke', <SegIcon name="gift" />, 'Geschenke'],
      ]} />
      {seg !== 'geschenke' && <button className="btn dashed" onClick={ctx.openScan}>Elternbrief scannen</button>}
      {seg === 'mitnehmen' ? <Mitnehmen ctx={ctx} /> : seg === 'vereinbaren' ? <Vereinbaren ctx={ctx} /> : seg === 'geschenke' ? <Geschenke ctx={ctx} /> : <Besorgen ctx={ctx} />}
    </>
  );
}

const ART = { mit: 'Mitbringen', an: 'Steht an', bes: 'Besonderheit' };
const ART_ICON = { mit: 'backpack', an: 'bell', bes: 'star' };
const TYP_ICON = { termin: 'cal', anrufen: 'phone', ausfuellen: 'form', kuendigen: 'cancel', ueberweisen: 'euro', sonstiges: 'dots' };

function SegIcon({ name, n }) {
  return <span className="seg-icon" aria-hidden="true"><Icon name={name} size={22} />{n ? <span className="seg-n">{n}</span> : null}</span>;
}
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
            {notes.map((n) => n.art === 'test' ? (
              <div key={n.id} className="row" style={{ minHeight: 40 }}><span className="row-main" style={{ fontWeight: 600 }}>{n.text}</span></div>
            ) : (
              <Swipe key={n.id} onLeft={() => removeOne(n)}>
                <div className="row" style={{ minHeight: 40 }}><CatIcon name={ART_ICON[n.art] || 'bell'} label={ART[n.art]} /><span className="row-main">{n.text}</span></div>
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

/* ---------------- Erledigen (Termin vereinbaren, anrufen, ausfüllen …) ---------------- */
export const TYP = {
  termin: 'Termin vereinbaren',
  anrufen: 'Anrufen',
  ausfuellen: 'Ausfüllen / unterschreiben',
  kuendigen: 'Kündigen',
  ueberweisen: 'Überweisen / bezahlen',
  sonstiges: 'Sonstiges',
};
const TYP_KURZ = { termin: 'Termin', anrufen: 'Anrufen', ausfuellen: 'Ausfüllen', kuendigen: 'Kündigen', ueberweisen: 'Bezahlen', sonstiges: 'Erledigen' };
const PLACEHOLDER = {
  termin: 'z. B. Zahnarzt Emil', anrufen: 'z. B. Versicherung wegen Fahrrad', ausfuellen: 'z. B. Anmeldung Ganztag',
  kuendigen: 'z. B. Zeitschriften-Abo', ueberweisen: 'z. B. Klassenkasse 10 €', sonstiges: 'z. B. Fahrrad zur Werkstatt',
};

function Vereinbaren({ ctx }) {
  const [f, setF] = useState({ typ: 'termin', title: '', forWho: null, owner: null, due: '' });
  const [filter, setFilter] = useState('alle');
  const all = ctx.data.inbox.rows.filter((r) => !r.done_at)
    .sort((a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999')) || a.created_at.localeCompare(b.created_at));
  const open = filter === 'mir' ? all.filter((r) => (r.owner ?? (r.typ === 'termin' || !r.typ ? 'dirk' : null)) === ctx.me.id) : all;
  const add = async (e) => {
    e.preventDefault();
    if (!f.title.trim()) return;
    const ok = await run(supabase.from('todo_inbox').insert({ typ: f.typ, title: f.title.trim(), for_who: f.forWho, owner: f.owner, due: f.due || null, by_who: ctx.me.id }), ctx.fail);
    if (ok) {
      setF({ ...f, title: '', forWho: null, due: '' });
      ctx.say(f.owner && f.owner !== ctx.me.id ? `Eingetragen – ${ctx.member(f.owner)?.name} kümmert sich` : f.typ === 'termin' && !ctx.isDirk && !f.owner ? 'Eingetragen – Dirk plant es ein' : 'Eingetragen');
    }
  };
  const finish = async (r) => {
    const ok = await run(supabase.from('todo_inbox').update({ done_at: new Date().toISOString() }).eq('id', r.id), ctx.fail);
    if (ok) ctx.say('Erledigt', () => run(supabase.from('todo_inbox').update({ done_at: null }).eq('id', r.id), ctx.fail));
  };
  const del = async (r) => {
    const ok = await run(supabase.from('todo_inbox').delete().eq('id', r.id), ctx.fail);
    if (ok) ctx.say('Gelöscht', () => run(supabase.from('todo_inbox').insert(r), ctx.fail));
  };
  const plan = (r) => ctx.openEvent(null, { title: r.title, who: r.for_who ? [r.for_who] : ['all'], inboxId: r.id, start_date: r.due || ctx.day });
  const whoOpts = ctx.members.map((m) => ({ id: m.id, label: m.name, color: m.color, bg: m.bg }));
  const adults = ctx.members.filter((m) => !m.kid).map((m) => ({ id: m.id, label: m.name, color: m.color, bg: m.bg }));

  return (
    <>
      <section className="card">
        <div className="card-head">
          <div><div className="card-title">Zu erledigen</div><div className="small">Wischen: rechts = erledigt, links = löschen</div></div>
          <span className="badge">{all.length}</span>
        </div>
        <Seg label="Filter" value={filter} onPick={setFilter} options={[['alle', 'Alle'], ['mir', 'Für mich']]} />
        {open.length === 0 && <div className="empty">Nichts offen.</div>}
        <div>
          {open.map((r) => {
            const who = ctx.member(r.for_who);
            const owner = ctx.member(r.owner);
            const by = ctx.member(r.by_who);
            const typ = r.typ || 'termin';
            const soon = r.due && r.due <= addDays(ctx.day, 2);
            return (
              <Swipe key={r.id} onRight={() => finish(r)} onLeft={() => del(r)}>
                <div className="row">
                  <CatIcon name={TYP_ICON[typ]} label={TYP_KURZ[typ]} size={18} />
                  <span className="row-main">
                    <span className="row-title" style={{ fontWeight: 600 }}>{r.title}</span>
                    <span className="small" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      {r.due && <b style={{ color: soon ? '#B45309' : undefined }}>bis {shortLabel(r.due)}</b>}
                      {who && <b style={{ color: who.color }}>{who.name}</b>}
                      {owner ? <span>· {owner.id === ctx.me.id ? 'du kümmerst dich' : `${owner.name} kümmert sich`}</span> : typ === 'termin' ? <span>· Dirk plant ein</span> : null}
                      {by && by.id !== ctx.me.id && <span>· von {by.name}</span>}
                    </span>
                  </span>
                  {typ === 'termin' && ctx.isDirk
                    ? <button className="btn small" onClick={() => plan(r)}>Einplanen</button>
                    : <button className="btn ghost small" onClick={() => finish(r)}>Erledigt</button>}
                </div>
              </Swipe>
            );
          })}
        </div>
        <ZuletztErledigt ctx={ctx} />
      </section>
      <form className="card" onSubmit={add}>
        <div className="field"><span>Was ist zu tun?</span>
          <ChipPick options={Object.entries(TYP).map(([id, label]) => ({ id, label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name={TYP_ICON[id]} size={17} />{label}</span> }))} value={f.typ} onPick={(t) => setF({ ...f, typ: t })} />
        </div>
        <label className="field"><span>{TYP[f.typ]}: was genau?</span>
          <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={PLACEHOLDER[f.typ]} maxLength={200} />
        </label>
        <label className="field"><span>Bis wann? (optional)</span>
          <input className="input" type="date" value={f.due} min={ctx.day} onChange={(e) => setF({ ...f, due: e.target.value })} />
        </label>
        <div className="field"><span>Wer kümmert sich? (optional)</span>
          <ChipPick options={adults} value={f.owner} onPick={(id) => setF({ ...f, owner: f.owner === id ? null : id })} />
        </div>
        <div className="field"><span>Betrifft (optional)</span><ChipPick options={whoOpts} value={f.forWho} onPick={(id) => setF({ ...f, forWho: f.forWho === id ? null : id })} /></div>
        <button className="btn" disabled={!f.title.trim()}><Icon name="plus" size={18} />Eintragen</button>
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
  const open = ctx.data.buy.rows.filter((r) => !r.done).sort((a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999')) || a.created_at.localeCompare(b.created_at));
  const done = async (r) => {
    ctx.data.buy.local((rows) => rows.map((x) => (x.id === r.id ? { ...x, done: true } : x)));
    const ok = await run(supabase.from('buy_items').update({ done: true, done_at: new Date().toISOString() }).eq('id', r.id), ctx.fail);
    if (ok) ctx.say(`${r.art} besorgt`, () => run(supabase.from('buy_items').update({ done: false, done_at: null }).eq('id', r.id), ctx.fail));
    else ctx.data.buy.reload();
  };
  const del = async (r) => {
    // Geschenk aus einem Termin: nur ausblenden, sonst legt der Kalender sie morgen wieder an
    if (r.event_id) {
      const ok = await run(supabase.from('buy_items').update({ done: true, done_at: new Date().toISOString() }).eq('id', r.id), ctx.fail);
      if (ok) ctx.say('Gelöscht', () => run(supabase.from('buy_items').update({ done: false, done_at: null }).eq('id', r.id), ctx.fail));
      return;
    }
    const ok = await run(supabase.from('buy_items').delete().eq('id', r.id), ctx.fail);
    if (ok) ctx.say('Gelöscht', () => run(supabase.from('buy_items').insert(r), ctx.fail));
  };
  return (
    <>
      <div className="chips">
        <button className="btn" onClick={() => setSheet({ typ: 'sonstiges' })}><Icon name="plus" size={18} />Etwas besorgen</button>
        <button className="btn ghost" onClick={() => setSheet({})}>Kleidung</button>
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
                  <span className="small">{[r.due ? <b key="d" style={{ color: r.due <= addDays(ctx.day, 2) ? '#B45309' : undefined }}>bis {shortLabel(r.due)}</b> : null, r.note, by && by.id !== r.for_who ? `von ${by.name}` : null].filter(Boolean).reduce((acc, x, i) => (i ? [...acc, ' · ', x] : [x]), [])}</span>
                </span>
                {w && <span className="pchip" style={{ background: w.bg, color: w.color }}>{w.name}</span>}
              </button>
            </Swipe>
          );
        })}
      </section>
      {open.length > 0 && <div className="small">Antippen = besorgt. Nach links wischen = löschen.</div>}
      {sheet && (sheet.typ === 'sonstiges' ? <OtherSheet ctx={ctx} onClose={() => setSheet(null)} /> : <BuySheet ctx={ctx} preset={sheet} onClose={() => setSheet(null)} />)}
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

const OTHER = ['Geburtstagsgeschenk', 'Geburtstagskarte', 'Bastelmaterial', 'Schulmaterial', 'Hefte', 'Geschenk für Lehrkraft', 'Batterien'];

function OtherSheet({ ctx, onClose }) {
  const [art, setArt] = useState('');
  const [forWho, setForWho] = useState(null);
  const [note, setNote] = useState('');
  const [due, setDue] = useState('');
  const save = async () => {
    if (!art.trim()) return;
    const ok = await run(supabase.from('buy_items').insert({ typ: 'sonstiges', art: art.trim(), for_who: forWho, note: note.trim(), due: due || null, by_who: ctx.me.id }), ctx.fail);
    if (ok) { ctx.say('Eingetragen'); onClose(); }
  };
  return (
    <Sheet title="Etwas besorgen" onClose={onClose} actions={<button className="btn" onClick={save} disabled={!art.trim()}>Eintragen</button>}>
      <label className="field"><span>Was?</span>
        <input className="input" value={art} onChange={(e) => setArt(e.target.value)} placeholder="z. B. Geschenk für Paul" maxLength={160} autoFocus />
      </label>
      <div className="chips">{OTHER.map((o) => <button key={o} type="button" className="chip plain" onClick={() => setArt(o)}>{o}</button>)}</div>
      <label className="field"><span>Bis wann? (optional)</span>
        <input className="input" type="date" value={due} min={ctx.day} onChange={(e) => setDue(e.target.value)} />
      </label>
      <div className="field"><span>Für wen? (optional)</span>
        <ChipPick options={ctx.members.map((m) => ({ id: m.id, label: m.name, color: m.color, bg: m.bg }))} value={forWho} onPick={(id) => setForWho(forWho === id ? null : id)} />
      </div>
      <label className="field"><span>Notiz (optional)</span>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Paul wünscht sich Lego, ca. 15 €" maxLength={200} />
      </label>
    </Sheet>
  );
}

// Versehentlich abgehakt? Die letzten 7 Tage lassen sich zurückholen.
function ZuletztErledigt({ ctx }) {
  const [open, setOpen] = useState(false);
  const seit = Date.now() - 7 * 86400000;
  const list = ctx.data.inbox.rows.filter((r) => r.done_at && Date.parse(r.done_at) > seit).sort((a, b) => b.done_at.localeCompare(a.done_at));
  if (!list.length) return null;
  const back = async (r) => {
    const ok = await run(supabase.from('todo_inbox').update({ done_at: null }).eq('id', r.id), ctx.fail);
    if (ok) ctx.say(`„${r.title}“ ist wieder offen`);
  };
  return (
    <div style={{ borderTop: '1px solid #F0EBE3', paddingTop: 6 }}>
      <button className="h-more" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Zuletzt erledigt ausblenden' : `Zuletzt erledigt (${list.length})`}</button>
      {open && list.map((r) => (
        <div key={r.id} className="row" style={{ minHeight: 44 }}>
          <span className="row-main"><span className="row-title done">{r.title}</span><span className="small">erledigt {shortLabel(r.done_at.slice(0, 10))}</span></span>
          <button className="btn ghost small" style={{ width: 'auto' }} onClick={() => back(r)}>Zurückholen</button>
        </div>
      ))}
    </div>
  );
}
