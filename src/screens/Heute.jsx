// Heute (Eltern-App): Als Nächstes · Für dich · Familie heute · Kacheln.
// Abends rückt „Einpacken für morgen“ nach oben.
import { useEffect, useState } from 'react';
import { supabase, run } from '../data.js';
import { Icon, Check, PersonChips } from '../ui.jsx';
import CheckIn from './CheckIn.jsx';
import { addDays, expand, shortLabel, weekday, WDL, hm } from '../lib/dates.js';
import { packList, packDay, fahrtText, NICHT } from './common.jsx';
import { upcomingTests } from '../lib/tests.js';
import { mealOf, muellOf, choresToday, toggleChore } from './Zuhause.jsx';
import { muellHeute, BINS } from '../lib/home.js';
import { isWeekendSoon } from '../lib/wochenende.js';

const mins = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const nowMins = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
function inLabel(diff) {
  if (diff <= 0) return 'läuft gerade';
  if (diff < 60) return `in ${diff} Min.`;
  const h = Math.floor(diff / 60), m = diff % 60;
  return `in ${h} Std.${m ? ` ${m} Min.` : ''}`;
}

export default function Heute({ ctx }) {
  const [ci, setCi] = useState(false);
  const [now, setNow] = useState(nowMins);
  useEffect(() => { const t = setInterval(() => setNow(nowMins()), 60000); return () => clearInterval(t); }, []);
  const { day } = ctx;
  const abends = now >= 18 * 60;

  return (
    <>
      <Hinweise ctx={ctx} onCheckin={() => setCi(true)} />
      <AlsNaechstes ctx={ctx} now={now} />
      <FuerDich ctx={ctx} />
      {abends && <EinpackenMorgen ctx={ctx} />}
      <FamilieHeute ctx={ctx} now={now} short={abends} />
      <Kacheln ctx={ctx} hidePack={abends} />
      {ci && <CheckIn ctx={ctx} onClose={() => setCi(false)} />}
      <div style={{ height: 4 }} aria-hidden="true" data-day={day} />
    </>
  );
}

/* ---------- schmale Hinweise: Check-in, Wochenende ---------- */
function Hinweise({ ctx, onCheckin }) {
  const so = weekday(ctx.day) === 6 && !ctx.data.checkins.rows.find((r) => r.sonntag === ctx.day)?.fertig;
  const we = isWeekendSoon(ctx.day) && weekday(ctx.day) !== 6;
  if (!so && !we) return null;
  return (
    <div className="h-hints">
      {so && <button className="h-hint" onClick={onCheckin}>☀️ Sonntags-Check-in starten<Icon name="chev" size={16} /></button>}
      {we && <button className="h-hint" onClick={() => ctx.go('zuhause', 'wochenende')}>🎈 Was machen wir am Wochenende?<Icon name="chev" size={16} /></button>}
    </div>
  );
}

/* ---------- Als Nächstes: bis zu drei Termine ---------- */
function AlsNaechstes({ ctx, now }) {
  const tomorrow = addDays(ctx.day, 1);
  const list = expand(ctx.data.events.rows, ctx.day, tomorrow)
    .filter((o) => !o.ev.all_day && (o.date === tomorrow || mins(o.ev.to_time || o.ev.from_time) + (o.ev.to_time ? 0 : 30) > now))
    .slice(0, 3);
  if (!list.length) return null;
  const when = (o) => (o.date === ctx.day ? inLabel(mins(o.ev.from_time) - now) : `morgen, ${WDL[weekday(tomorrow)]}`);
  const wer = (ev) => (ev.who.includes('all') ? 'Alle' : ev.who.map((w) => ctx.member(w)?.name).filter(Boolean).join(', '));
  const [first, ...rest] = list;
  const fahrt = fahrtText(first.ev);
  return (
    <section className="h-next" aria-label="Als Nächstes">
      <button className="h-next-main" onClick={() => ctx.openEvent(first.ev, { date: first.date })}>
        <span className="h-next-when">Als Nächstes · {when(first)}</span>
        <span className="h-next-title">{hm(first.ev.from_time)} {first.ev.title}</span>
        <span className="h-next-sub">{first.ev.to_time ? `bis ${hm(first.ev.to_time)} · ` : ''}{wer(first.ev)}{fahrt ? ` · ${fahrt}` : ''}</span>
      </button>
      {rest.map((o) => (
        <button key={o.ev.id + o.date} className="h-next-row" onClick={() => ctx.openEvent(o.ev, { date: o.date })}>
          <span className="h-next-rtime">{o.date === ctx.day ? hm(o.ev.from_time) : `${WDL[weekday(tomorrow)].slice(0, 2)} ${hm(o.ev.from_time)}`}</span>
          <span className="h-next-rtitle">{o.ev.title}</span>
          <span className="h-next-rwho">{wer(o.ev)}</span>
        </button>
      ))}
    </section>
  );
}

/* ---------- Für dich: alles zum Abhaken ---------- */
function FuerDich({ ctx }) {
  const me = ctx.me.id;
  const [hidden, setHidden] = useState([]); // gerade abgehakt → kurz durchgestrichen, dann weg
  const hide = (key) => { setHidden((h) => [...h, key]); };
  const items = [];

  // Erledigen: meins (Terminvereinbarung ohne Zuständigen landet bei Dirk)
  const todos = ctx.data.inbox.rows
    .filter((r) => !r.done_at && (r.owner ?? ((r.typ ?? 'termin') === 'termin' ? 'dirk' : null)) === me)
    .sort((a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999')));
  for (const r of todos) {
    items.push({
      key: `t${r.id}`, text: r.title, sub: r.due ? `bis ${shortLabel(r.due)}` : null, warn: r.due && r.due <= addDays(ctx.day, 1),
      done: async () => run(supabase.from('todo_inbox').update({ done_at: new Date().toISOString() }).eq('id', r.id), ctx.fail),
      undo: async () => run(supabase.from('todo_inbox').update({ done_at: null }).eq('id', r.id), ctx.fail),
    });
  }
  // Besorgen mit Frist in den nächsten 3 Tagen (z. B. Geschenke)
  for (const b of ctx.data.buy.rows.filter((r) => !r.done && r.due && r.due <= addDays(ctx.day, 3))) {
    items.push({
      key: `b${b.id}`, text: b.typ === 'kleidung' ? `${b.art}${b.size ? ` (${b.size})` : ''} besorgen` : b.art, sub: `bis ${shortLabel(b.due)}`, warn: b.due <= addDays(ctx.day, 1),
      done: async () => run(supabase.from('buy_items').update({ done: true, done_at: new Date().toISOString() }).eq('id', b.id), ctx.fail),
      undo: async () => run(supabase.from('buy_items').update({ done: false, done_at: null }).eq('id', b.id), ctx.fail),
    });
  }
  // Müll – nur am Rausstell-Tag und wenn ich dran bin
  const m = muellOf(ctx);
  const st = muellHeute(m, ctx.day);
  if (st && m.out_by === me) items.push({ key: 'muell', text: `Müll raus: ${st.bins.map((x) => BINS[x]?.label).join(' + ')}`, sub: 'heute Abend', local: true });
  // Meine Ämtchen
  const chores = choresToday(ctx, ctx.day).filter((c) => c.who === me);

  // Offene Fahrten der nächsten 3 Tage
  const fahrten = expand(ctx.data.events.rows, ctx.day, addDays(ctx.day, 3))
    .filter((o) => o.ev.kind === 'termin' && !o.ev.all_day && o.ev.who.some((w) => ctx.member(w)?.kid) && (!o.ev.bring_by || !o.ev.pick_by)
      && !(o.date === ctx.day && mins(o.ev.from_time) < nowMins()))
    .slice(0, 3);
  const parents = ctx.members.filter((p) => !p.kid);
  const setFahrt = async (o, field, name) => {
    ctx.data.events.local((rows) => rows.map((e) => (e.id === o.ev.id ? { ...e, [field]: name } : e)));
    const ok = await run(supabase.from('events').update({ [field]: name }).eq('id', o.ev.id), ctx.fail);
    if (!ok) ctx.data.events.reload();
  };

  const visible = items.filter((i) => !hidden.includes(i.key) || i.local);
  if (!visible.length && !chores.length && !fahrten.length) {
    return <section className="card h-sec"><div className="h-label">Für dich</div><div className="empty">Heute nichts für dich zu tun. 🎉</div></section>;
  }
  return (
    <section className="card h-sec" aria-labelledby="h-fuerdich">
      <div className="h-label" id="h-fuerdich">Für dich</div>
      {chores.map((c) => (
        <button key={c.id} className="h-item" onClick={() => toggleChore(ctx, c, ctx.day, c.done)} aria-pressed={c.done}>
          <Check on={c.done} /><span className={`h-item-text${c.done ? ' done' : ''}`}>{c.title}</span><span className="h-item-sub">Ämtchen</span>
        </button>
      ))}
      {visible.slice(0, 6).map((i) => {
        const off = hidden.includes(i.key);
        return (
          <button key={i.key} className="h-item" aria-pressed={off}
            onClick={async () => { if (off) { setHidden((h) => h.filter((k) => k !== i.key)); return; } hide(i.key); if (i.done && await i.done()) ctx.say(`Erledigt: ${i.text}`, i.undo); }}>
            <Check on={off} /><span className={`h-item-text${off ? ' done' : ''}`}>{i.text}</span>
            {i.sub && <span className={`h-item-sub${i.warn ? ' warn' : ''}`}>{i.sub}</span>}
          </button>
        );
      })}
      {visible.length > 6 && <button className="h-more" onClick={() => ctx.go('erinn', 'vereinbaren')}>… und {visible.length - 6} weitere</button>}
      {fahrten.map((o) => {
        const field = !o.ev.bring_by ? 'bring_by' : 'pick_by';
        const kid = ctx.kids.filter((k) => o.ev.who.includes(k.id)).map((k) => k.name).join(' und ');
        const when = o.date === ctx.day ? hm(o.ev.from_time) : `${WDL[weekday(o.date)].slice(0, 2)} ${hm(o.ev.from_time)}`;
        return (
          <div key={o.ev.id + o.date + field} className="h-fahrt">
            <div><b>{field === 'bring_by' ? 'Wer bringt' : 'Wer holt'} {kid}?</b> <span className="h-item-sub">{o.ev.title} · {when}</span></div>
            <div className="h-fahrt-chips">
              {parents.map((p) => (
                <button key={p.id} className="chip" style={{ borderColor: p.bg, color: p.color }} onClick={() => setFahrt(o, field, p.name)}>
                  {p.id === ctx.me.id ? 'Ich' : p.name}
                </button>
              ))}
              <button className="chip" onClick={() => setFahrt(o, field, NICHT)}>Nicht nötig</button>
            </div>
          </div>
        );
      })}
    </section>
  );
}

/* ---------- Abends: Einpacken für morgen ---------- */
async function togglePack(ctx, kid, date, item) {
  const row = { kid, on_date: date, item_key: item.key };
  ctx.data.checks.local((rows) => (item.done ? rows.filter((r) => !(r.kid === kid && r.on_date === date && r.item_key === item.key)) : [...rows, row]));
  const ok = item.done ? await run(supabase.from('pack_checks').delete().match(row), ctx.fail) : await run(supabase.from('pack_checks').upsert(row), ctx.fail);
  if (!ok) ctx.data.checks.reload();
}
function EinpackenMorgen({ ctx }) {
  const date = addDays(ctx.day, 1);
  const per = ctx.kids.map((k) => ({ k, ...packList(ctx, k.id, date) })).filter((x) => x.items.length || x.notes.length);
  if (!per.length) return null;
  return (
    <section className="card h-sec">
      <div className="h-label">Einpacken für morgen</div>
      {per.map(({ k, items, notes }) => (
        <div key={k.id} className="h-kid">
          <span className="h-kidname" style={{ color: k.color }}>{k.name}</span>
          {notes.map((n) => <div key={n.id} className="h-note">{n.text}</div>)}
          {items.map((it) => (
            <button key={it.key} className="h-item" onClick={() => togglePack(ctx, k.id, date, it)} aria-pressed={it.done}>
              <Check on={it.done} /><span className={`h-item-text${it.done ? ' done' : ''}`}>{it.text}</span>
            </button>
          ))}
        </div>
      ))}
    </section>
  );
}

/* ---------- Familie heute: Zeitleiste + Morgen-Zeile ---------- */
function FamilieHeute({ ctx, now, short }) {
  const tomorrow = addDays(ctx.day, 1);
  const occ = expand(ctx.data.events.rows, ctx.day, tomorrow);
  const today = occ.filter((o) => o.date === ctx.day);
  const meal = mealOf(ctx, ctx.day);
  const rows = [
    ...today.map((o) => ({ key: o.ev.id, t: o.ev.all_day ? -1 : mins(o.ev.from_time), o })),
    ...(meal && (meal.planned || meal.fixed) ? [{ key: 'essen', t: 18 * 60, meal: meal.title }] : []),
  ].sort((a, b) => a.t - b.t);
  const past = (r) => (r.meal ? r.t + 60 <= now : r.o && !r.o.ev.all_day && mins(r.o.ev.to_time || r.o.ev.from_time) + (r.o.ev.to_time ? 0 : 60) <= now);
  const shown = short ? rows.filter((r) => !past(r)) : rows;

  const tom = occ.filter((o) => o.date === tomorrow);
  const special = tom.filter((o) => o.ev.kind === 'geburtstag' || o.ev.kind === 'test' || (!o.ev.all_day && mins(o.ev.from_time) < 9 * 60));
  const rest = tom.length - special.length;
  const kidOf = (ev) => ctx.kids.filter((k) => ev.who.includes(k.id)).map((k) => k.name).join(', ');

  return (
    <section className="card h-sec" aria-labelledby="h-familie">
      <div className="h-head">
        <div className="h-label" id="h-familie">Familie heute</div>
        <button className="icon-btn" aria-label="Neuer Termin" onClick={() => ctx.openEvent(null, { start_date: ctx.day })}><Icon name="plus" size={18} /></button>
      </div>
      {shown.length === 0 && <div className="empty">{rows.length ? 'Für heute ist alles vorbei.' : 'Heute nichts geplant.'}</div>}
      {shown.map((r) => r.meal ? (
        <button key="essen" className={`h-tl${past(r) ? ' past' : ''}`} onClick={() => ctx.go('zuhause', 'essen')}>
          <span className="h-tl-time">18:00</span><span className="h-tl-title">🍽 {r.meal}</span>
        </button>
      ) : (
        <button key={r.key} className={`h-tl${past(r) ? ' past' : ''}`} onClick={() => ctx.openEvent(r.o.ev, { date: r.o.date })}>
          <span className="h-tl-time">{r.o.ev.all_day ? (r.o.ev.kind === 'geburtstag' ? '🎂' : r.o.ev.kind === 'test' ? '📝' : 'ganzt.') : hm(r.o.ev.from_time)}</span>
          <span className="h-tl-title">{r.o.ev.title}{r.o.ev.to_time && !r.o.ev.all_day ? <span className="h-tl-to"> bis {hm(r.o.ev.to_time)}</span> : null}</span>
          <PersonChips who={r.o.ev.who} members={ctx.members} />
        </button>
      ))}
      <button className="h-tomorrow" onClick={() => ctx.go('kalender')}>
        <b>Morgen:</b>{' '}
        {special.length === 0 && rest === 0 ? 'nichts geplant' : [
          ...special.map((o) => `${o.ev.kind === 'geburtstag' ? '🎂' : o.ev.kind === 'test' ? '📝' : hm(o.ev.from_time)} ${o.ev.title}${o.ev.kind === 'test' ? ` (${kidOf(o.ev)})` : ''}`),
          rest > 0 ? `${special.length ? '+ ' : ''}${rest} ${rest === 1 ? 'Termin' : 'Termine'}` : null,
        ].filter(Boolean).join(' · ')}
      </button>
    </section>
  );
}

/* ---------- Kacheln: nur was offen ist ---------- */
function Kacheln({ ctx, hidePack }) {
  const shop = ctx.data.shop.rows.filter((r) => !r.done);
  const pd = packDay(ctx);
  const packOpen = ctx.kids.reduce((n, k) => n + packList(ctx, k.id, pd).items.filter((i) => !i.done).length, 0);
  const buy = ctx.data.buy.rows.filter((r) => !r.done);
  const tests = upcomingTests(ctx.data.events.rows, ctx.day, 14);
  const tiles = [
    shop.length && { icon: 'cart', label: 'Einkauf', value: `${shop.length} · ${shop.slice(0, 2).map((s) => s.name).join(', ')}`, go: () => ctx.go('einkauf') },
    !hidePack && packOpen && { icon: 'backpack', label: pd === ctx.day ? 'Einpacken heute' : 'Einpacken morgen', value: `${packOpen} offen`, go: () => ctx.go('erinn', 'mitnehmen') },
    buy.length && { icon: 'bag', label: 'Besorgen', value: `${buy.length} · ${buy[0].art}`, go: () => ctx.go('erinn', 'besorgen') },
    tests.length && { icon: 'form', label: 'Tests', value: `${tests.length} in 2 Wochen`, go: () => ctx.go('kalender') },
  ].filter(Boolean);
  if (!tiles.length) return null;
  return (
    <div className="h-tiles">
      {tiles.map((t) => (
        <button key={t.label} className="h-tile" onClick={t.go}>
          <span className="h-tile-label"><Icon name={t.icon} size={15} />{t.label}</span>
          <span className="h-tile-value">{t.value}</span>
        </button>
      ))}
    </div>
  );
}
