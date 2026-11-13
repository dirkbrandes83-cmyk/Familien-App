// Familien-Station: Eintragen (Ist alle, Termin oder Test, Besorgen, Wunsch …)
import { useEffect, useState } from 'react';
import { supabase, run, learnedSections } from '../../data.js';
import { dayChip, pickDays, FAECHER, TEST_ARTEN, testTitle } from '../../lib/tests.js';
import { Icon } from '../../ui.jsx';
import { addDays, WDL, weekday } from '../../lib/dates.js';
import { sectionOf } from '../../lib/shop.js';


// Kinder tragen selbst ein: erst was, dann wann – alles mit großen Knöpfen
const TYPEN = [
  ['test', 'pencil', 'Test oder Klassenarbeit'],
  ['feier', 'party', 'Einladung oder Feier'],
  ['termin', 'cal', 'Anderer Termin'],
];
const STUNDEN = ['8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19'];

function KidTermin({ ctx, by, chip, busy, setBusy, done }) {
  const me = ctx.member(by);
  const [kid, setKid] = useState(me?.kid ? me.id : ctx.kids.length === 1 ? ctx.kids[0].id : null);
  const [typ, setTyp] = useState(null);
  const [fach, setFach] = useState(null);
  const [art, setArt] = useState('Test');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(null);
  const [h, setH] = useState(null);
  const [min, setMin] = useState('00');
  const [other, setOther] = useState(false);
  const k = ctx.member(kid);
  const isTest = typ === 'test';
  const days = pickDays(ctx.day, isTest ? 15 : 14, isTest);
  const finalTitle = isTest ? (fach ? testTitle(art, fach) : '') : title.trim();
  const ready = kid && typ && finalTitle && date;

  const save = async () => {
    if (!ready) return;
    setBusy(true);
    const ok = await run(supabase.from('events').insert({
      title: finalTitle, kind: isTest ? 'test' : 'termin', fach: isTest ? fach : null, who: [kid],
      start_date: date, all_day: isTest || !h, from_time: !isTest && h ? `${h.padStart(2, '0')}:${min}` : null,
      note: note.trim(), src: 'station', created_by: by || kid,
    }), ctx.fail);
    setBusy(false);
    if (ok) done(isTest ? `${finalTitle} ist eingetragen – viel Erfolg!` : `${finalTitle} steht im Kalender`);
  };

  const c = dayChip(ctx.day, date || ctx.day);
  return (
    <>
      {!(me?.kid) && (
        <div className="field"><span>Für wen?</span>
          <div className="chips">{ctx.kids.map((x) => <button key={x.id} className="chip st-chip" style={chip(kid === x.id, x)} aria-pressed={kid === x.id} onClick={() => setKid(x.id)}>{x.name}</button>)}</div>
        </div>
      )}
      <div className="field"><span>Was ist es?</span>
        <div className="st-typen">
          {TYPEN.map(([id, icon, label]) => (
            <button key={id} className={`st-typ${typ === id ? ' on' : ''}`} aria-pressed={typ === id}
              onClick={() => { setTyp(id); setDate(null); if (id === 'test') setH(null); }}>
              <span className="st-typicon" aria-hidden="true"><Icon name={icon} size={36} /></span><span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {isTest && (
        <>
          <div className="field"><span>Welches Fach?</span>
            <div className="chips">{FAECHER.map((f) => <button key={f} className="chip st-chip" style={chip(fach === f)} aria-pressed={fach === f} onClick={() => setFach(f)}>{f}</button>)}</div>
          </div>
          <div className="field"><span>Was für einer?</span>
            <div className="chips">{TEST_ARTEN.map((a) => <button key={a} className="chip st-chip" style={chip(art === a)} aria-pressed={art === a} onClick={() => setArt(a)}>{a}</button>)}</div>
          </div>
          <label className="field"><span>Was kommt dran? (wenn du es weißt)</span>
            <input className="input st-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Einmaleins, Seite 34–36" maxLength={160} />
          </label>
        </>
      )}
      {typ && !isTest && (
        <label className="field"><span>{typ === 'feier' ? 'Was für eine Feier?' : 'Was für ein Termin?'}</span>
          <input className="input st-input" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder={typ === 'feier' ? 'z. B. Geburtstag bei Paul' : 'z. B. Probe für das Theaterstück'} maxLength={120} />
        </label>
      )}

      {typ && (
        <div className="field"><span>Wann?{isTest ? ' (nur Schultage)' : ''}</span>
          <div className="st-days">
            {days.map((d) => {
              const x = dayChip(ctx.day, d);
              return (
                <button key={d} className={`st-day${date === d ? ' on' : ''}`} aria-pressed={date === d} onClick={() => { setDate(d); setOther(false); }}>
                  <b>{x.top}</b><span>{x.sub}</span>
                </button>
              );
            })}
            <button className={`st-day${other ? ' on' : ''}`} onClick={() => setOther(true)}><b>Später</b><span>Datum wählen</span></button>
          </div>
          {other && <input className="input st-input" type="date" min={ctx.day} value={date || ''} onChange={(e) => setDate(e.target.value || null)} style={{ marginTop: 8 }} />}
        </div>
      )}

      {typ && !isTest && date && (
        <div className="field"><span>Um wie viel Uhr?</span>
          <div className="chips">
            <button className="chip st-chip" style={chip(!h)} aria-pressed={!h} onClick={() => setH(null)}>Weiß ich nicht</button>
            {STUNDEN.map((x) => <button key={x} className="chip st-chip" style={chip(h === x)} aria-pressed={h === x} onClick={() => setH(x)}>{x} Uhr</button>)}
          </div>
          {h && (
            <div className="chips" style={{ marginTop: 8 }}>
              {['00', '15', '30', '45'].map((m) => <button key={m} className="chip st-chip" style={chip(min === m)} aria-pressed={min === m} onClick={() => setMin(m)}>{h}:{m}</button>)}
            </div>
          )}
        </div>
      )}

      {ready && (
        <div className={`st-preview${isTest ? ' test' : ''}`}>
          <span className="st-typicon" aria-hidden="true"><Icon name={TYPEN.find((t) => t[0] === typ)[1]} size={32} /></span>
          <span><b>{finalTitle}</b><br />{c.top === 'Heute' || c.top === 'Morgen' ? c.top : weekdayName(date)}, {c.sub.replace(/^\D+ /, '')}{!isTest && h ? ` · ${h}:${min} Uhr` : ''} · {k?.name}</span>
        </div>
      )}
      <button className="btn st-big" disabled={busy || !ready} onClick={save}>In den Kalender</button>
      {!ready && typ && <div className="st-empty">{!kid ? 'Wähle oben, für wen.' : isTest && !fach ? 'Wähle das Fach.' : !finalTitle ? 'Schreib kurz, was es ist.' : 'Wähle den Tag.'}</div>}
    </>
  );
}
const weekdayName = (d) => WDL[weekday(d)];


/* ---------------- Eintragen ---------------- */
const IST_ALLE = ['Milch', 'Brot', 'Müsli', 'Äpfel', 'Bananen', 'Joghurt', 'Käse', 'Butter', 'Toilettenpapier', 'Zahnpasta'];
const ANST = ['Arztbesuch', 'Geburtstagsgeschenk', 'Formular unterschreiben', 'Elternbrief', 'Bastelmaterial', 'Friseur'];
const ARTS = ['Sportbekleidung', 'Hose', 'Schuhe', 'Regenjacke', 'Winterjacke', 'Pullover', 'T-Shirts', 'Socken', 'Unterwäsche', 'Mütze/Handschuhe'];
const KID_SIZES = ['122', '128', '134', '140', '146', '152', '158', '164'];
const SHOE_SIZES = ['28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40'];
const ADULT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

export function Eintragen({ ctx, init, onClose, openKiste }) {
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
    ['termin', 'Termin oder Test', 'Trag es selbst in den Kalender ein'],
    ['shop', 'Ist alle!', 'Etwas ist aufgebraucht'],
    ['mit', 'Muss morgen mit', 'Für die Einpackliste'],
    ['kleidung', 'Kleidung brauche ich', 'Was und welche Größe'],
    ['besorgen', 'Muss besorgt werden', 'z. B. Geschenk, Bastelsachen'],
    ['anst', 'Termin muss gemacht werden', 'Dirk plant es ein'],
    ['wunsch', 'Essenswunsch', 'Catrin plant es ein'],
    ['idee', 'Idee fürs Wochenende', 'Ab in die Ideenkiste'],
  ];
  const titles = { termin: 'Termin oder Test', besorgen: 'Muss besorgt werden', shop: 'Ist alle!', mit: 'Muss morgen mit', kleidung: 'Kleidung brauche ich', anst: 'Termin muss gemacht werden', wunsch: 'Essenswunsch' };
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
              <button key={id} className="st-tile" onClick={() => (id === 'idee' ? openKiste() : setStep(id))}>
                <span className="st-tilelabel">{label}</span><span className="sub">{sub}</span>
              </button>
            ))}
          </div>
        )}

        {step === 'termin' && <KidTermin ctx={ctx} by={by} chip={chip} busy={busy} setBusy={setBusy} done={done} />}

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
