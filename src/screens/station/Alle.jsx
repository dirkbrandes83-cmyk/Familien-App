// Familien-Station: Ansicht „Alle“ – Termine+Einpacken | Wer macht was+Essen | Wochenende+Einkauf
import { mealOf, muellOf, Bin, choresToday } from '../Zuhause.jsx';
import { WochenendKarte } from '../Wochenende.jsx';
import Wochenplan from '../Wochenplan.jsx';
import { freieZeit, freieTage } from './Kind.jsx';
import { muellHeute } from '../../lib/home.js';
import { Icon, Check } from '../../ui.jsx';
import { addDays, expand, WDL, weekday } from '../../lib/dates.js';
import { packList } from '../common.jsx';

import { tagName } from '../../lib/stundenplan.js';
import { EvList, toggleChoreFeier, togglePack, packDate, morgens } from './teile.jsx';

export function Alle({ ctx, openIstAlle, openKiste }) {
  const tomorrow = addDays(ctx.day, 1);
  const occ = expand(ctx.data.events.rows, ctx.day, tomorrow);
  const pd = packDate(ctx);
  const shop = ctx.data.shop.rows.filter((r) => !r.done).sort((a, b) => a.section.localeCompare(b.section) || a.name.localeCompare(b.name, 'de'));
  const einkauf = (
    <section className="st-card st-grow">
      <div className="st-cardhead"><h2>Einkaufsliste{shop.length > 0 && <span className="badge" style={{ marginLeft: 8, verticalAlign: '3px' }}>{shop.length}</span>}</h2>
        <button className="st-roundplus" onClick={openIstAlle} aria-label="Ist alle – etwas auf die Einkaufsliste"><Icon name="plus" size={26} stroke={2.6} /></button></div>
      {shop.length === 0 ? <div className="st-empty">Alles da.</div>
        : <ul className="st-shop">{shop.slice(0, 14).map((s) => <li key={s.id}>{s.name}</li>)}</ul>}
      {shop.length > 14 && <div className="st-empty">… und {shop.length - 14} weitere</div>}
    </section>
  );
  // Wochenende (bis Sonntag 17 Uhr): der Plan groß, daneben klein Ämtchen, Essen, Einkauf. Einpacken kommt Sonntagabend wieder.
  if (freieZeit(ctx.day, new Date().getHours())) {
    return (
      <main className="st-grid two we">
        <Wochenplan ctx={ctx} station nebeneinander ohneListen days={freieTage(ctx.day)} onKiste={openKiste} />
        <div className="st-col">
          <WerMacht ctx={ctx} />
          <EssenKarte ctx={ctx} />
          {einkauf}
        </div>
      </main>
    );
  }
  return (
    <main className="st-grid alle3">
      <div className="st-col">
        <section className="st-card st-auto">
          <h2>Termine heute</h2>
          <EvList list={occ.filter((o) => o.date === ctx.day)} ctx={ctx} />
          <h3>Morgen · {WDL[weekday(tomorrow)]}</h3>
          <EvList list={occ.filter((o) => o.date === tomorrow)} ctx={ctx} />
        </section>
        <section className={`st-card st-grow${morgens() ? ' st-first' : ''}`}>
          <h2>{pd === ctx.day ? 'Heute mitnehmen' : `Für ${tagName(ctx.day, pd) === 'Morgen' ? 'morgen' : tagName(ctx.day, pd)} einpacken`}</h2>
          {ctx.kids.map((k) => {
            const { items, notes } = packList(ctx, k.id, pd);
            return (
              <div key={k.id} className="st-kid">
                <span className="st-kidname" style={{ color: k.color }}>{k.tier ? `${k.tier} ` : ''}{k.name}{items.length > 0 && <span className="st-progress">{items.filter((x) => x.done).length} von {items.length}</span>}</span>
                {notes.map((n) => <div key={n.id} className="st-note">{n.text}</div>)}
                {items.length === 0 && <div className="st-empty">Nichts einzupacken.</div>}
                {items.map((it) => (
                  <button key={it.key} className="st-check" onClick={() => togglePack(ctx, k.id, pd, it, items.filter((x) => !x.done).length === 1)} aria-pressed={it.done}>
                    <Check on={it.done} /><span className={it.done ? 'done' : ''}>{it.text}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </section>
      </div>
      <div className="st-col">
        <WerMacht ctx={ctx} />
        <EssenKarte ctx={ctx} />
      </div>
      <div className="st-col">
        <WochenendKarte ctx={ctx} station onOpen={openKiste} />
        {einkauf}
      </div>
    </main>
  );
}

function EssenKarte({ ctx }) {
  const tomorrow = addDays(ctx.day, 1);
  const st = muellHeute(muellOf(ctx), ctx.day);
  return (
    <section className="st-card st-auto">
      <h2>Essen heute</h2>
      <div className="st-meal">{mealOf(ctx, ctx.day).title}</div>
      {mealOf(ctx, tomorrow).planned && <div className="st-empty">Morgen: {mealOf(ctx, tomorrow).title}</div>}
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
  );
}

function WerMacht({ ctx }) {
  const chores = choresToday(ctx, ctx.day);
  return (
    <section className="st-card st-grow">
      <h2>Wer macht heute was</h2>
      <div className="st-who1">
        {chores.length === 0 && <div className="st-empty">Heute keine Ämtchen.</div>}
        {ctx.members.filter((p) => chores.some((c) => c.who === p.id)).map((p) => {
          const list = chores.filter((c) => c.who === p.id);
          return (
            <div key={p.id} className="st-kid">
              <span className="st-kidname" style={{ color: p.color }}>{p.tier ? `${p.tier} ` : ''}{p.name}</span>
              {list.map((c) => (
                <button key={c.id} className="st-check" onClick={() => toggleChoreFeier(ctx, c)} aria-pressed={c.done}>
                  <Check on={c.done} /><span className={c.done ? 'done' : ''}>{c.title}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
