// Sonntags-Check-in: Rückblick auf die Woche, Blick auf die neue Woche, Danke-Runde.
// Läuft auf dem Familien-iPad (groß, für alle) und in der Eltern-App.
import { useEffect, useMemo, useState } from 'react';
import { supabase, run } from '../data.js';
import { Icon, PersonChips } from '../ui.jsx';
import { addDays, expand, weekday, WDL, hm, shortLabel } from '../lib/dates.js';
import { muellStatus, BINS } from '../lib/home.js';
import { rankIdeas } from '../lib/wochenende.js';
import { toggleVote } from './Wochenende.jsx';

const FACES = [[1, '😢', 'schlecht'], [2, '😕', 'nicht so gut'], [3, '😐', 'geht so'], [4, '🙂', 'gut'], [5, '😄', 'super']];
const STEPS = ['Wer ist dabei?', 'Wie war deine Woche?', 'Das Schönste', 'Die neue Woche', 'Was steht an?', 'Danke-Runde', 'Unser Vorhaben', 'Nächstes Wochenende', 'Fertig'];

// Der Sonntag, zu dem der Check-in gehört: heute (So) oder der kommende Sonntag
export function checkinSunday(day) {
  const wd = weekday(day);
  return wd === 6 ? day : addDays(day, 6 - wd);
}

export default function CheckIn({ ctx, onClose }) {
  const sonntag = checkinSunday(ctx.day);
  const saved = ctx.data.checkins.rows.find((r) => r.sonntag === sonntag);
  const last = [...ctx.data.checkins.rows].filter((r) => r.sonntag < sonntag && r.fertig).sort((a, b) => b.sonntag.localeCompare(a.sonntag))[0];
  const [step, setStep] = useState(0);
  const [dabei, setDabei] = useState(() => saved ? Object.keys(saved.stimmung).length ? Object.keys(saved.stimmung) : ctx.members.map((m) => m.id) : ctx.members.map((m) => m.id));
  const [f, setF] = useState(() => ({
    stimmung: saved?.stimmung ?? {}, schoenstes: saved?.schoenstes ?? {}, danke: saved?.danke ?? [], vorhaben: saved?.vorhaben ?? '',
  }));
  const [dk, setDk] = useState({ von: null, an: null, text: '' });
  const people = ctx.members.filter((m) => dabei.includes(m.id));

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async (fertig = false) => {
    const row = { sonntag, ...f, fertig: fertig || !!saved?.fertig, updated_at: new Date().toISOString() };
    ctx.data.checkins.local((rows) => [...rows.filter((r) => r.sonntag !== sonntag), row]);
    await run(supabase.from('checkins').upsert(row), ctx.fail);
  };
  const next = async () => {
    if (step >= 1) await save(step === STEPS.length - 2);
    setStep(step + 1);
  };

  // Die neue Woche: Montag bis Sonntag nach dem Check-in
  const from = addDays(sonntag, 1), to = addDays(sonntag, 7);
  const woche = useMemo(() => expand(ctx.data.events.rows, from, to), [ctx.data.events.rows, from, to]);
  const muell = ctx.data.settings.rows.find((r) => r.key === 'muell')?.value;

  return (
    <div className="ci-bg" role="dialog" aria-modal="true" aria-label="Sonntags-Check-in">
      <div className="ci">
        <header className="ci-head">
          <div>
            <div className="ci-kicker">☀️ Sonntags-Check-in · {shortLabel(sonntag)}</div>
            <h2>{STEPS[step]}</h2>
          </div>
          <button className="icon-btn st-icon" onClick={onClose} aria-label="Schließen"><Icon name="x" /></button>
        </header>
        <div className="ci-dots" aria-hidden="true">{STEPS.map((s, i) => <span key={s} className={i <= step ? 'on' : ''} />)}</div>

        <div className="ci-body">
          {step === 0 && (
            <>
              {last?.vorhaben && <div className="ci-note">Letzte Woche wolltet ihr: <b>{last.vorhaben}</b> – hat es geklappt?</div>}
              <div className="ci-people">
                {ctx.members.map((m) => {
                  const on = dabei.includes(m.id);
                  return (
                    <button key={m.id} className={`ci-person${on ? ' on' : ''}`} aria-pressed={on} style={on ? { borderColor: m.color, background: m.bg } : undefined}
                      onClick={() => setDabei(on ? dabei.filter((x) => x !== m.id) : [...dabei, m.id])}>
                      <span className="ci-ini" style={{ background: m.color }}>{m.name[0]}</span>{m.name}{on && <Icon name="check" size={22} stroke={3} />}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {step === 1 && people.map((m) => (
            <div key={m.id} className="ci-row">
              <span className="ci-name" style={{ color: m.color }}>{m.name}</span>
              <div className="ci-faces">
                {FACES.map(([v, face, label]) => (
                  <button key={v} className={`ci-face${f.stimmung[m.id] === v ? ' on' : ''}`} aria-label={`${m.name}: ${label}`} aria-pressed={f.stimmung[m.id] === v}
                    onClick={() => setF({ ...f, stimmung: { ...f.stimmung, [m.id]: v } })}>{face}</button>
                ))}
              </div>
            </div>
          ))}

          {step === 2 && (
            <>
              <div className="ci-note">Was war diese Woche richtig schön? Jeder darf, keiner muss.</div>
              {people.map((m) => (
                <label key={m.id} className="ci-row">
                  <span className="ci-name" style={{ color: m.color }}>{m.name}</span>
                  <input className="input st-input" value={f.schoenstes[m.id] ?? ''} maxLength={120} placeholder="z. B. Fußballspiel gewonnen"
                    onChange={(e) => setF({ ...f, schoenstes: { ...f.schoenstes, [m.id]: e.target.value } })} />
                </label>
              ))}
            </>
          )}

          {step === 3 && (
            <div className="ci-week">
              {Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((d) => {
                const list = woche.filter((o) => o.date === d);
                const st = muell && weekday(d) === (muell.out_weekday ?? 1) ? muellStatus(muell, d) : null;
                return (
                  <div key={d} className="ci-day">
                    <div className="ci-dayname">{WDL[weekday(d)]}</div>
                    <div className="ci-dayitems">
                      {list.length === 0 && !st && <span className="st-empty">frei</span>}
                      {list.map((o) => {
                        const kidEv = o.ev.who.some((w) => ctx.member(w)?.kid) && !o.ev.all_day && o.ev.kind === 'termin';
                        const open = kidEv && (!o.ev.bring_by || !o.ev.pick_by);
                        return (
                          <div key={o.ev.id + d} className={`ci-ev${o.ev.kind === 'test' ? ' test' : ''}`}>
                            <span className="ci-evtime">{o.ev.kind === 'test' ? '📝' : o.ev.kind === 'geburtstag' ? '🎂' : o.ev.all_day ? '' : hm(o.ev.from_time)}</span>
                            <span className="ci-evtitle">{o.ev.title}</span>
                            <PersonChips who={o.ev.who} members={ctx.members} />
                            {open && <span className="ci-warn">{!o.ev.bring_by && !o.ev.pick_by ? 'Wer bringt, wer holt?' : !o.ev.bring_by ? 'Wer bringt?' : 'Wer holt?'}</span>}
                          </div>
                        );
                      })}
                      {st && <div className="ci-ev"><span className="ci-evtime">🗑</span><span className="ci-evtitle">Müll raus: {st.bins.map((b) => BINS[b]?.label).join(' + ')}</span></div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {step === 4 && <Anstehend ctx={ctx} to={to} />}

          {step === 5 && (
            <>
              {f.danke.length > 0 && (
                <div className="ci-thanks">
                  {f.danke.map((t, i) => (
                    <div key={i} className="ci-thank">
                      <span>💛 <b>{ctx.member(t.von)?.name}</b> sagt Danke an <b>{ctx.member(t.an)?.name}</b>{t.text ? ` – ${t.text}` : ''}</span>
                      <button className="icon-btn" aria-label="Entfernen" onClick={() => setF({ ...f, danke: f.danke.filter((_, j) => j !== i) })}><Icon name="x" size={18} /></button>
                    </div>
                  ))}
                </div>
              )}
              <div className="field"><span>Wer möchte Danke sagen?</span>
                <div className="chips">{people.map((m) => <button key={m.id} className="chip st-chip" style={dk.von === m.id ? { background: m.color, borderColor: m.color, color: '#fff' } : { borderColor: m.bg, color: m.color }} onClick={() => setDk({ ...dk, von: m.id, an: dk.an === m.id ? null : dk.an })}>{m.name}</button>)}</div>
              </div>
              {dk.von && (
                <div className="field"><span>An wen?</span>
                  <div className="chips">{ctx.members.filter((m) => m.id !== dk.von).map((m) => <button key={m.id} className="chip st-chip" style={dk.an === m.id ? { background: m.color, borderColor: m.color, color: '#fff' } : { borderColor: m.bg, color: m.color }} onClick={() => setDk({ ...dk, an: m.id })}>{m.name}</button>)}</div>
                </div>
              )}
              {dk.von && dk.an && (
                <>
                  <label className="field"><span>Wofür? (wenn du magst)</span>
                    <input className="input st-input" value={dk.text} onChange={(e) => setDk({ ...dk, text: e.target.value })} maxLength={120} placeholder="z. B. fürs Vorlesen" />
                  </label>
                  <button className="btn st-big" onClick={() => { setF({ ...f, danke: [...f.danke, dk] }); setDk({ von: null, an: null, text: '' }); }}>💛 Danke eintragen</button>
                </>
              )}
            </>
          )}

          {step === 6 && (
            <>
              <div className="ci-note">Habt ihr etwas, das ihr euch als Familie diese Woche vornehmt?</div>
              <div className="chips">
                {['Mehr draußen spielen', 'Gemeinsam kochen', 'Spieleabend', 'Früher ins Bett', 'Weniger Bildschirm', 'Zusammen Rad fahren'].map((v) => (
                  <button key={v} className="chip st-chip" style={f.vorhaben === v ? { background: '#1C1917', color: '#fff' } : undefined} onClick={() => setF({ ...f, vorhaben: v })}>{v}</button>
                ))}
              </div>
              <input className="input st-input" value={f.vorhaben} onChange={(e) => setF({ ...f, vorhaben: e.target.value })} maxLength={120} placeholder="oder selbst schreiben" />
            </>
          )}

          {step === 7 && (
            <>
              <div className="ci-note">Was machen wir nächstes Wochenende? Jeder tippt auf die Ideen, die ihm gefallen.</div>
              {rankIdeas(ctx.data.ideas.rows, ctx.data.ideaVotes.rows).slice(0, 6).map((i) => (
                <div key={i.id} className="ci-idea">
                  <span className="ci-ideatitle">{i.title}</span>
                  <span className="ci-ideavotes">
                    {people.map((m) => {
                      const on = ctx.data.ideaVotes.rows.some((v) => v.idea_id === i.id && v.member === m.id);
                      return <button key={m.id} className={`ci-vote${on ? ' on' : ''}`} aria-pressed={on} aria-label={`${m.name}: ${i.title}`}
                        style={on ? { background: m.color, borderColor: m.color, color: '#fff' } : { borderColor: m.bg, color: m.color }}
                        onClick={() => toggleVote(ctx, i, m.id)}>{on ? '❤️' : ''}{m.name}</button>;
                    })}
                  </span>
                </div>
              ))}
            </>
          )}

          {step === 8 && (
            <div className="ci-done">
              <div className="ci-big">🎉 Schöne Woche!</div>
              <div className="ci-moods">
                {people.map((m) => <span key={m.id} className="ci-mood"><b style={{ color: m.color }}>{m.name}</b> {FACES.find((x) => x[0] === f.stimmung[m.id])?.[1] ?? '–'}</span>)}
              </div>
              {f.danke.length > 0 && <div>💛 {f.danke.length} × Danke</div>}
              {f.vorhaben && <div>Vorhaben: <b>{f.vorhaben}</b></div>}
            </div>
          )}
        </div>

        <footer className="ci-foot">
          {step > 0 && step < STEPS.length - 1 && <button className="btn ghost st-big" onClick={() => setStep(step - 1)}>Zurück</button>}
          {step < STEPS.length - 1
            ? <button className="btn st-big" disabled={step === 0 && !dabei.length} onClick={next}>{step === STEPS.length - 2 ? 'Abschließen' : 'Weiter'}</button>
            : <button className="btn st-big" onClick={onClose}>Fertig</button>}
        </footer>
      </div>
    </div>
  );
}

function Anstehend({ ctx, to }) {
  const inbox = ctx.data.inbox.rows.filter((r) => !r.done_at);
  const buy = ctx.data.buy.rows.filter((r) => !r.done);
  const soon = buy.filter((r) => r.due && r.due <= to);
  const wishes = ctx.data.wishes.rows.filter((w) => !w.done_at);
  const Block = ({ icon, title, items, empty }) => (
    <section className="ci-block">
      <h3>{icon} {title}</h3>
      {items.length === 0 ? <div className="st-empty">{empty}</div>
        : <ul>{items.slice(0, 6).map((x, i) => <li key={i}>{x}</li>)}{items.length > 6 && <li className="st-empty">… und {items.length - 6} weitere</li>}</ul>}
    </section>
  );
  return (
    <div className="ci-blocks">
      <Block icon="✅" title="Zu erledigen" empty="Nichts offen." items={inbox.map((r) => r.title + (r.due ? ` (bis ${shortLabel(r.due)})` : ''))} />
      <Block icon="🛍️" title="Diese Woche besorgen" empty="Nichts mit Frist." items={soon.map((r) => (r.typ === 'kleidung' ? `${r.art}${r.size ? ` (${r.size})` : ''}` : r.art) + ` – bis ${shortLabel(r.due)}`)} />
      <Block icon="🍝" title="Essenswünsche" empty="Keine Wünsche offen." items={wishes.map((w) => `${w.title}${ctx.member(w.who) ? ` (${ctx.member(w.who).name})` : ''}`)} />
    </div>
  );
}
