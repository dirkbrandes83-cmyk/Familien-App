// Familien-Station: Kinderseite – Einpacken | Stundenplan | Nach der Schule
import { useState } from 'react';
import { supabase, run } from '../../data.js';
import { choresToday } from '../Zuhause.jsx';
import { upcomingTests, urgency, dayChip } from '../../lib/tests.js';
import { lessonsFor, schoolDay, fachFarbe, istSchultag, naechsterSchultag, tagName, schulfrei } from '../../lib/stundenplan.js';
import { TIERE } from '../../lib/kinder.js';
import { useWetter } from '../Wochenende.jsx';
import Wochenplan from '../Wochenplan.jsx';
import { anziehen } from '../../lib/wochenende.js';
import { Icon, Check } from '../../ui.jsx';
import { addDays, expand, shortLabel } from '../../lib/dates.js';
import { packList } from '../common.jsx';
import { aufgaben, offen } from '../../lib/aufgaben.js';

import { EvList, toggleChoreFeier, togglePack, SpeakIcon } from './teile.jsx';

// Schulfrei (Wochenende, Ferien, Feiertag): Stundenplan erst am Vorabend des nächsten Schultags ab 17 Uhr
// Der heutige freie Tag und – falls auch frei – der nächste (Sa → So)
export const freieTage = (heute) => (istSchultag(addDays(heute, 1)) ? [heute] : [heute, addDays(heute, 1)]);

export function freieZeit(heute, stunde) {
  return !istSchultag(heute) && !(istSchultag(addDays(heute, 1)) && stunde >= 17);
}

export function Kind({ ctx, kid, openKiste }) {
  // Einpacken: heute (nur an Schultagen) oder nächster Schultag (Fr → Montag, Wochenende → Montag)
  const schule = istSchultag(ctx.day);
  const naechster = naechsterSchultag(ctx.day);
  const [which, setWhich] = useState(() => (schule && new Date().getHours() < 15 ? 'h' : 'm'));
  const date = which === 'h' && schule ? ctx.day : naechster;
  const naechsterName = tagName(ctx.day, naechster);
  const { items, notes } = packList(ctx, kid.id, date);
  const occ = expand(ctx.data.events.rows, ctx.day, addDays(ctx.day, 1)).filter((o) => o.ev.who.includes(kid.id) || o.ev.who.includes('all'));
  const open = items.filter((i) => !i.done);
  const wetter = useWetter(ctx);
  const kleid = anziehen(wetter(date));
  const read = () => {
    const parts = [
      `${kid.name}, ${date === ctx.day ? 'heute' : naechsterName === 'Morgen' ? 'morgen' : `für ${naechsterName}`}:`,
      ...(kleid ? [`Anziehen: ${kleid.text}.`] : []),
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
  // „Nach der Schule“: heutige Termine nach Uhrzeit, dann Ämtchen und Hinweise
  const heute = occ.filter((o) => o.date === ctx.day && o.ev.kind !== 'test');
  const morgen = occ.filter((o) => o.date !== ctx.day && o.ev.kind !== 'test');
  const mine = choresToday(ctx, ctx.day).filter((c) => c.who === kid.id);
  const extra = fuerKind(ctx, kid.id);
  return (
    <main className="st-grid kid">
      <section className={`st-card st-pack`}>
        <div className="st-cardhead">
          <h2>Einpacken</h2>
          <button className="icon-btn" onClick={read} aria-label="Vorlesen" style={{ width: 56, height: 56 }}><SpeakIcon /></button>
        </div>
        {schule ? (
          <div className="seg st-seg" role="group" aria-label="Heute oder nächster Schultag">
            <button className={date === ctx.day ? 'on' : ''} aria-pressed={date === ctx.day} onClick={() => setWhich('h')}>Heute</button>
            <button className={date !== ctx.day ? 'on' : ''} aria-pressed={date !== ctx.day} onClick={() => setWhich('m')}>{naechsterName}</button>
          </div>
        ) : <div className="st-weekend">{schulfrei(ctx.day) ? `${schulfrei(ctx.day)} – keine Schule.` : 'Wochenende – keine Schule.'} Hier packst du schon für <b>{naechsterName}</b>{naechsterName.endsWith('.') ? '' : '.'}</div>}
        {kleid && (
          <div className="st-wear">
            <Icon name={kleid.icon} size={30} />
            <span><b>{kleid.text}</b><span className="st-wear-sub">{tagName(ctx.day, date)} {kleid.temp} · {kleid.label}</span></span>
          </div>
        )}
        {notes.length > 0 && (
          <div className="st-notes">
            {notes.map((n) => <div key={n.id} className="st-note big">{n.art === 'bes' ? 'Besonders: ' : n.art === 'test' ? '' : 'Steht an: '}{n.text}</div>)}
          </div>
        )}
        {items.length === 0 && <div className="st-empty">Nichts einzupacken.</div>}
        {items.map((it) => (
          <button key={it.key} className="st-check big" onClick={() => togglePack(ctx, kid.id, date, it, open.length === 1)} aria-pressed={it.done}>
            <Check on={it.done} /><span className={it.done ? 'done' : ''}>{it.text}</span>
          </button>
        ))}
        {items.length > 0 && open.length > 0 && <div className="st-progressbar" aria-label={`${items.length - open.length} von ${items.length} eingepackt`}><span style={{ width: `${((items.length - open.length) / items.length) * 100}%` }} /><b>{items.length - open.length} von {items.length} eingepackt</b></div>}
        {items.length > 0 && open.length === 0 && <div className="st-done">Alles eingepackt!</div>}
      </section>
      {freieZeit(ctx.day, new Date().getHours())
        ? <Wochenplan ctx={ctx} station days={freieTage(ctx.day)} onKiste={openKiste} />
        : <StundenplanKarte ctx={ctx} kid={kid} date={date} />}
      <section className="st-card">
        <h2>{schule ? 'Nach der Schule' : 'Heute'}</h2>
        {heute.length === 0 && !mine.length && !extra.length && <div className="st-empty">Heute nichts weiter.</div>}
        <EvList list={heute} ctx={ctx} empty="" />
        {mine.map((c) => (
          <button key={c.id} className="st-check" onClick={() => toggleChoreFeier(ctx, c)} aria-pressed={c.done}>
            <Check on={c.done} /><span className={c.done ? 'done' : ''}>{c.title}</span>
          </button>
        ))}
        {extra.map((x) => (
          <div key={x.id} className="st-note big">{x.text}{x.due ? <span style={{ fontWeight: 500 }}> · bis {shortLabel(x.due)}</span> : null}</div>
        ))}
        {morgen.length > 0 && (
          <>
            <h3>Morgen</h3>
            <EvList list={morgen} ctx={ctx} />
          </>
        )}
      </section>
    </main>
  );
}

// Tier wählen (öffnet sich über die Begrüßung in der Kopfzeile)
export function TierWahl({ ctx, kid, onClose }) {
  return (
    <div className="sheet-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet st-sheet" role="dialog" aria-modal="true" aria-label="Tier wählen">
        <div className="sheet-head"><h2>{kid.name}, welches Tier bist du?</h2><button className="icon-btn st-icon" onClick={onClose} aria-label="Schließen"><Icon name="x" /></button></div>
        <div className="st-tiere">
          {TIERE.map((t) => (
            <button key={t} className={`st-tier${kid.tier === t ? ' on' : ''}`} aria-pressed={kid.tier === t} onClick={async () => {
              const ok = await run(supabase.rpc('tier_setzen', { kind: kid.id, t }), ctx.fail);
              if (ok) { ctx.reloadMembers?.(); onClose(); ctx.say(`Hallo, ${kid.name} ${t}`); }
            }}>{t}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Stundenplan des gewählten Tages (Wochenende → Montag), Tests in dem Fach markiert
function StundenplanKarte({ ctx, kid, date }) {
  const tt = ctx.data.timetables.rows.find((r) => r.kid === kid.id);
  const day = schoolDay(date);
  const lessons = lessonsFor(tt, day);
  const tests = expand(ctx.data.events.rows.filter((e) => e.kind === 'test' && e.who.includes(kid.id)), day, day).map((o) => o.ev);
  const testIn = (fach) => fach && tests.find((t) => t.fach === fach || t.title.includes(fach));
  const label = tagName(ctx.day, day);
  const last = [...lessons].reverse().find((l) => l.fach);
  // weitere Tests der nächsten 7 Tage – nur wenn es welche gibt
  const bald = upcomingTests(ctx.data.events.rows, ctx.day, 7, kid.id).filter((o) => o.date !== day);
  return (
    <section className="st-card st-ttcard">
      <div className="st-cardhead"><h2>Stundenplan</h2><span className="st-ttday">{label}</span></div>
      {!tt ? <div className="st-empty">Noch kein Stundenplan. Mama oder Papa tragen ihn in der App unter „Mehr“ ein.</div>
        : lessons.length === 0 ? <div className="st-empty">Kein Unterricht eingetragen.</div>
        : (
          <div className="st-tt">
            {lessons.map((l) => {
              const [, fg] = fachFarbe(l.fach);
              const t = testIn(l.fach);
              return (
                <div key={l.n} className={`st-ttrow${l.fach ? '' : ' frei'}`}>
                  <span className="st-ttn">{l.n}</span>
                  <span className="st-tttime">{l.von}</span>
                  <span className="st-ttfach" style={l.fach ? { '--fach': fg } : undefined}>
                    {l.fach || 'frei'}{t && <span className="st-tttest"><Icon name="pencil" size={13} /> {t.title.replace(l.fach, '').trim() || 'Test'}</span>}
                  </span>
                </div>
              );
            })}
            {last && <div className="st-ttend">Schluss um {last.bis} Uhr</div>}
          </div>
        )}
      {bald.length > 0 && (
        <div className="st-ttsoon">
          {bald.map((o) => (
            <div key={o.ev.id + o.date} className={`st-ttsoonrow ${urgency(ctx.day, o.date)}`}>
              <span><Icon name="pencil" size={16} /> <b>{o.ev.title}</b></span>
              <span>{o.date === ctx.day ? 'heute' : o.date === addDays(ctx.day, 1) ? 'morgen' : `${dayChip(ctx.day, o.date).top} ${dayChip(ctx.day, o.date).sub}`}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// Erinnerungen, die dieses Kind betreffen: Erledigen, Besorgen und Geschenke zu seinen Terminen
export function fuerKind(ctx, kidId) {
  // Aus dem gemeinsamen Aufgaben-Modell: Erledigen und Besorgen, die dieses Kind betreffen
  return offen(aufgaben(ctx)).filter((a) => a.forWho === kidId && (a.art === 'erledigen' || a.art === 'besorgen'))
    .map((a) => ({ id: a.key, text: a.text, due: a.due }));
}
