import { useState } from 'react';
import { supabase, run } from '../data.js';
import { Icon, ChipPick, Check } from '../ui.jsx';
import { parseIcs, isCurrent } from '../lib/ics.js';
import { shortLabel, hm } from '../lib/dates.js';
import Mitteilungen from './Mitteilungen.jsx';
import Widget from './Widget.jsx';
import Stundenplan from './Stundenplan.jsx';
import CheckIn, { checkinSunday } from './CheckIn.jsx';
import { shortLabel as sl } from '../lib/dates.js';

export default function Mehr({ ctx }) {
  const [page, setPage] = useState(null);
  if (page === 'klender') return <KlenderUmzug ctx={ctx} onBack={() => setPage(null)} />;
  if (page === 'abos') return <Abos ctx={ctx} onBack={() => setPage(null)} />;
  if (page === 'push') return <Mitteilungen ctx={ctx} onBack={() => setPage(null)} />;
  if (page === 'widget') return <Widget ctx={ctx} onBack={() => setPage(null)} />;
  if (page === 'stundenplan') return <Stundenplan ctx={ctx} onBack={() => setPage(null)} />;
  if (page === 'checkins') return <CheckinVerlauf ctx={ctx} onBack={() => setPage(null)} />;
  const backup = async () => {
    const tables = ['events', 'shopping_items', 'frequent_items', 'pack_rules', 'pack_items', 'todo_inbox', 'buy_items', 'meals', 'recipes', 'chores', 'cleaning_areas', 'cleaning_notes', 'laundry_log', 'caregivers', 'care_needs', 'care_asks', 'calendar_subscriptions', 'settings'];
    const out = { exportiert: new Date().toISOString() };
    for (const t of tables) out[t] = (await supabase.from(t).select('*')).data;
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `familien-app-sicherung-${ctx.day}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <>
      <section className="card tight">
        <button className="row" style={{ minHeight: 60 }} onClick={() => setPage('checkins')}>
          <span className="row-main"><span style={{ fontWeight: 700 }}>☀️ Sonntags-Check-in</span><span className="sub">Starten und frühere Wochen ansehen</span></span>
          <Icon name="chev" size={18} />
        </button>
        <button className="row" style={{ minHeight: 60 }} onClick={() => setPage('stundenplan')}>
          <span className="row-main"><span style={{ fontWeight: 700 }}>Stundenplan</span><span className="sub">{ctx.kids.map((k) => k.name).join(' und ')} – erscheint auf dem iPad</span></span>
          <Icon name="chev" size={18} />
        </button>
        <button className="row" style={{ minHeight: 60 }} onClick={() => setPage('push')}>
          <span className="row-main"><span style={{ fontWeight: 700 }}>Mitteilungen</span><span className="sub">Morgens, abends und bei neuen Einträgen</span></span>
          <Icon name="chev" size={18} />
        </button>
        <button className="row" style={{ minHeight: 60 }} onClick={() => setPage('widget')}>
          <span className="row-main"><span style={{ fontWeight: 700 }}>Widget und Apple Watch</span><span className="sub">„Heute“-Widget · Einkaufsliste auf der Watch</span></span>
          <Icon name="chev" size={18} />
        </button>
        <button className="row" style={{ minHeight: 60 }} onClick={() => setPage('klender')}>
          <span className="row-main"><span style={{ fontWeight: 700 }}>Von Klender umziehen</span><span className="sub">Export-Link oder .ics-Datei</span></span>
          <Icon name="chev" size={18} />
        </button>
        <button className="row" style={{ minHeight: 60 }} onClick={() => setPage('abos')}>
          <span className="row-main"><span style={{ fontWeight: 700 }}>Kalender-Abos</span><span className="sub">{ctx.data.subs.rows.length ? ctx.data.subs.rows.map((x) => x.name).join(', ') : 'z. B. Kalender.digital (Schule)'}</span></span>
          <Icon name="chev" size={18} />
        </button>
        <button className="row" style={{ minHeight: 60 }} onClick={backup}>
          <span className="row-main"><span style={{ fontWeight: 700 }}>Sicherung herunterladen</span><span className="sub">Alle Termine und Listen als Datei</span></span>
          <Icon name="upload" size={18} style={{ transform: 'rotate(180deg)' }} />
        </button>
      </section>
      <section className="card">
        <div className="card-title">Familien-Station (iPad)</div>
        <div className="sub">Auf dem iPad diese Seite öffnen und mit <b>station.brandes@example.org</b> und dem Station-Passwort anmelden. Die Station darf eintragen und abhaken, aber nichts löschen und keine Termine ändern. Abmelden: lange auf die Uhr drücken.</div>
      </section>
      <section className="card">
        <div className="card-title">Auf den Home-Bildschirm</div>
        <div className="sub">In Safari unten auf „Teilen“ tippen, dann „Zum Home-Bildschirm“. Danach öffnet sich die App wie eine normale App.</div>
      </section>
      <section className="card">
        <div className="sub">Angemeldet als {ctx.me.name}</div>
        <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Abmelden</button>
      </section>
      <div className="small">Später möglich: Wochenende, Wunschzettel und Sonntags-Check-in.</div>
    </>
  );
}

function KlenderUmzug({ ctx, onBack }) {
  const [parsed, setParsed] = useState(null);
  const [map, setMap] = useState({});
  const [onlyFuture, setOnlyFuture] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');

  const [link, setLink] = useState(() => localStorage.getItem('klenderLink') || '');
  const [fetching, setFetching] = useState(false);

  const load = async (file) => {
    setErr(''); setResult(null);
    if (!file) return;
    applyText(await file.text());
  };
  const loadLink = async (e) => {
    e.preventDefault();
    setErr(''); setResult(null);
    if (!link.trim()) return;
    setFetching(true);
    const { data, error } = await supabase.functions.invoke('ics-holen', { body: { url: link.trim() } });
    setFetching(false);
    if (error) {
      let msg = 'Konnte den Link nicht laden.';
      try { msg = (await error.context.json()).error || msg; } catch { /* Standardtext */ }
      setErr(msg);
      return;
    }
    localStorage.setItem('klenderLink', link.trim());
    applyText(data.text);
  };
  const applyText = (text) => {
    if (!/BEGIN:VCALENDAR/i.test(text)) { setErr('Das ist keine Kalender-Datei (.ics).'); return; }
    const p = parseIcs(text);
    setParsed(p);
    // Gruppen automatisch zuordnen, wenn der Name passt
    const groups = [...new Set(p.events.flatMap((e) => e.groups))];
    const m = {};
    for (const g of groups) {
      const hit = ctx.members.find((x) => g.toLowerCase().includes(x.name.toLowerCase()));
      m[g] = hit ? hit.id : 'all';
    }
    setMap(m);
  };

  const existing = new Set(ctx.data.events.rows.map((e) => e.ext_uid).filter(Boolean));
  const sig = (e) => `${e.title.toLowerCase()}|${e.start_date}|${hm(e.from_time)}`;
  const existingSig = new Set(ctx.data.events.rows.map(sig));
  const list = parsed ? parsed.events.filter((e) => !onlyFuture || isCurrent(e, ctx.day)) : [];
  const dupes = list.filter((e) => (e.ext_uid && existing.has(e.ext_uid)) || existingSig.has(sig(e)));
  const fresh = list.filter((e) => !dupes.includes(e));
  const groups = Object.keys(map);

  const whoOf = (e) => {
    const ids = [...new Set(e.groups.map((g) => map[g]).filter(Boolean))];
    // Eine konkrete Person schlägt den allgemeinen Kalendernamen ("Familie" → Alle)
    const specific = ids.filter((id) => id !== 'all');
    return specific.length ? specific : ['all'];
  };

  const doImport = async () => {
    setBusy(true);
    const rows = fresh.map(({ groups: _g, ...e }) => ({ ...e, who: whoOf({ groups: _g }), created_by: ctx.me.id }));
    let n = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const ok = await run(supabase.from('events').upsert(chunk, { onConflict: 'ext_uid', ignoreDuplicates: true }), (m) => setErr(m));
      if (!ok) break;
      n += chunk.length;
    }
    setBusy(false);
    setResult(n);
    if (n) ctx.say(`${n} ${n === 1 ? 'Termin' : 'Termine'} übernommen`);
  };

  const opts = [{ id: 'all', label: 'Alle', color: '#0F766E', bg: '#CCFBF1' }, ...ctx.members.map((m) => ({ id: m.id, label: m.name, color: m.color, bg: m.bg }))];

  return (
    <>
      <button className="btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={onBack}><Icon name="left" size={16} />Zurück</button>
      <section className="card">
        <div className="card-title">Von Klender umziehen</div>
        <div className="sub">In Klender den Export-Link (.ics oder webcal://) kopieren und hier einfügen. Danach prüfen, wem die Klender-Kalender gehören, und übernehmen.</div>
        <form className="field" onSubmit={loadLink}>
          <label htmlFor="klenderLink" className="sr">Klender-Link</label>
          <input id="klenderLink" className="input" type="url" inputMode="url" autoComplete="off" autoCapitalize="off" spellCheck={false}
            value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://… oder webcal://…" />
          <button className="btn" disabled={fetching || !link.trim()}>{fetching ? 'Lade …' : 'Termine vom Link holen'}</button>
        </form>
        {err && <div className="err" role="alert">{err}</div>}
        <div className="small">Ihr könnt den Link in den zwei Wochen Parallelbetrieb jederzeit erneut holen: Schon übernommene Termine werden übersprungen, nur Neues kommt dazu.</div>
        <label className="btn ghost small" style={{ position: 'relative', alignSelf: 'flex-start' }}>
          <Icon name="upload" size={16} />Oder Datei auswählen
          <input type="file" accept=".ics,text/calendar" onChange={(e) => load(e.target.files[0])} style={{ position: 'absolute', inset: 0, opacity: 0 }} />
        </label>
      </section>

      {parsed && result === null && (
        <>
          <section className="card">
            <div className="card-title">{list.length} {list.length === 1 ? 'Termin' : 'Termine'} gefunden</div>
            <div className="sub">{fresh.length} neu · {dupes.length} schon vorhanden (werden übersprungen)</div>
            <button className="row" onClick={() => setOnlyFuture(!onlyFuture)} aria-pressed={onlyFuture}>
              <Check on={onlyFuture} />
              <span className="row-main"><span>Nur aktuelle Termine</span><span className="small">Vergangene einmalige Termine weglassen; Geburtstage und Serien bleiben</span></span>
            </button>
            {parsed.warnings.length > 0 && <div className="small">{parsed.warnings.slice(0, 5).map((w) => <div key={w}>{w}</div>)}{parsed.warnings.length > 5 && <div>… und {parsed.warnings.length - 5} weitere</div>}</div>}
          </section>

          {groups.length > 0 && (
            <section className="card">
              <div className="card-title">Wem gehört was?</div>
              <div className="small">So hießen die Kalender oder Personen in Klender.</div>
              {groups.map((g) => (
                <div key={g} className="field" style={{ borderTop: '1px solid #F0EBE3', paddingTop: 8 }}>
                  <span>„{g}“ · {(() => { const n = list.filter((e) => e.groups.includes(g)).length; return `${n} ${n === 1 ? 'Termin' : 'Termine'}`; })()}</span>
                  <ChipPick options={opts} value={map[g]} onPick={(id) => setMap({ ...map, [g]: id })} />
                </div>
              ))}
            </section>
          )}

          <section className="card tight">
            <div className="label" style={{ padding: '10px 0 4px' }}>Vorschau</div>
            {fresh.slice(0, 12).map((e, i) => (
              <div key={i} className="row">
                <span className="time" style={{ fontSize: 12 }}>{shortLabel(e.start_date)}</span>
                <span className="row-main">
                  <span className="row-title">{e.title}</span>
                  <span className="small">{e.all_day ? 'ganztags' : hm(e.from_time)}{e.rep !== 'keine' ? ` · ${e.rep}` : ''} · {whoOf(e).map((id) => (id === 'all' ? 'Alle' : ctx.member(id)?.name)).join(', ')}</span>
                </span>
              </div>
            ))}
            {fresh.length > 12 && <div className="small" style={{ padding: '6px 0 10px' }}>… und {fresh.length - 12} weitere</div>}
          </section>

          <button className="btn" onClick={doImport} disabled={busy || fresh.length === 0}>{busy ? 'Übernehme …' : `${fresh.length} ${fresh.length === 1 ? 'Termin' : 'Termine'} übernehmen`}</button>
        </>
      )}

      {result !== null && (
        <section className="card">
          <div className="card-title">Fertig</div>
          <div className="sub">{result} {result === 1 ? 'Termin ist' : 'Termine sind'} jetzt im Kalender. Führt Klender noch zwei Wochen zum Vergleich weiter – neue Termine aber nur noch hier eintragen.</div>
          <button className="btn ghost" onClick={() => ctx.go('kalender')}>Zum Kalender</button>
        </section>
      )}
    </>
  );
}

function Abos({ ctx, onBack }) {
  const [f, setF] = useState({ name: 'Kalender.digital (Schule)', url: '', who: ['dirk'] });
  const [busy, setBusy] = useState(null);
  const subs = ctx.data.subs.rows;
  const opts = [{ id: 'all', label: 'Alle', color: '#0F766E', bg: '#CCFBF1' }, ...ctx.members.map((m) => ({ id: m.id, label: m.name, color: m.color, bg: m.bg }))];
  const sync = async (id) => {
    setBusy(id);
    const { data, error } = await supabase.functions.invoke('abo-sync', { body: { sub_id: id } });
    setBusy(null);
    if (error) { ctx.fail('Abgleich fehlgeschlagen'); return; }
    const r = Object.values(data?.ergebnis || {})[0];
    if (r?.fehler) ctx.fail(r.fehler);
    else if (r) ctx.say(`Abgeglichen: ${r.neu} neu, ${r.geaendert} geändert, ${r.entfernt} entfernt`);
  };
  const add = async (e) => {
    e.preventDefault();
    if (!f.name.trim() || !/^(https?|webcal):\/\//i.test(f.url.trim())) { ctx.fail('Bitte einen Link mit https:// oder webcal:// einfügen'); return; }
    const res = await run(supabase.from('calendar_subscriptions').insert({ name: f.name.trim(), url: f.url.trim(), who: f.who }).select('id').single(), ctx.fail);
    if (res) { setF({ name: '', url: '', who: ['all'] }); await sync(res.id); }
  };
  const pickWho = (id) => {
    if (id === 'all') return setF({ ...f, who: ['all'] });
    const cur = f.who.filter((w) => w !== 'all');
    const next = cur.includes(id) ? cur.filter((w) => w !== id) : [...cur, id];
    setF({ ...f, who: next.length ? next : ['all'] });
  };
  const fmt = (t) => (t ? new Date(t).toLocaleString('de-DE', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'noch nie');
  return (
    <>
      <button className="btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={onBack}><Icon name="left" size={16} />Zurück</button>
      <section className="card">
        <div className="card-title">Kalender-Abos</div>
        <div className="sub">Termine aus Abos sind nur lesbar und werden stündlich aktualisiert. Neue Termine erscheinen im Kalender unter „Neue Termine prüfen“ – mit der Frage nach Kinderbetreuung.</div>
      </section>
      {subs.map((x) => (
        <section key={x.id} className="card">
          <div className="card-head">
            <span className="row-main"><span style={{ fontWeight: 700 }}>{x.name}</span><span className="small">{x.who.includes('all') ? 'Alle' : x.who.map((w) => ctx.member(w)?.name).join(', ')} · zuletzt {fmt(x.last_sync)}</span></span>
            {!x.active && <span className="tag">pausiert</span>}
          </div>
          {x.last_error && <div className="err">Fehler: {x.last_error}</div>}
          <div className="chips">
            <button className="btn small" disabled={busy === x.id || !x.active} onClick={() => sync(x.id)}>{busy === x.id ? 'Gleiche ab …' : 'Jetzt abgleichen'}</button>
            <button className="btn ghost small" onClick={() => run(supabase.from('calendar_subscriptions').update({ active: !x.active }).eq('id', x.id), ctx.fail)}>{x.active ? 'Pausieren' : 'Fortsetzen'}</button>
            <button className="btn ghost small" style={{ color: '#B91C1C' }} onClick={async () => { if (window.confirm(`Abo „${x.name}“ und seine Termine entfernen?`)) await run(supabase.from('calendar_subscriptions').delete().eq('id', x.id), ctx.fail); }}>Entfernen</button>
          </div>
        </section>
      ))}
      <form className="card" onSubmit={add}>
        <div className="card-title">Neues Abo</div>
        <label className="field"><span>Name</span><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={80} /></label>
        <label className="field"><span>Abo-Link (.ics oder webcal://)</span>
          <input className="input" type="url" inputMode="url" autoCapitalize="off" spellCheck={false} value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://… oder webcal://…" />
        </label>
        <div className="field"><span>Wem gehören die Termine?</span><ChipPick multi options={opts} value={f.who} onPick={pickWho} /></div>
        <button className="btn" disabled={!f.url.trim() || !f.name.trim()}>Abo hinzufügen und abgleichen</button>
        <div className="small">Bei Kalender.digital findest du den Abo-Link in den Kalender-Einstellungen unter „Abonnieren“ bzw. „iCal-Link“.</div>
      </form>
    </>
  );
}

const FACE = { 1: '😢', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' };
function CheckinVerlauf({ ctx, onBack }) {
  const [open, setOpen] = useState(false);
  const list = [...ctx.data.checkins.rows].sort((a, b) => b.sonntag.localeCompare(a.sonntag));
  const cur = list.find((r) => r.sonntag === checkinSunday(ctx.day));
  return (
    <>
      <button className="btn ghost" onClick={onBack} style={{ alignSelf: 'flex-start' }}><Icon name="left" size={18} />Zurück</button>
      <section className="card">
        <div className="card-title">☀️ Sonntags-Check-in</div>
        <div className="small">Am besten sonntags gemeinsam am Familien-iPad – dort erscheint der Knopf oben rechts. Hier geht es auch.</div>
        <button className="btn" onClick={() => setOpen(true)}>{cur?.fertig ? 'Check-in ansehen / ergänzen' : 'Check-in starten'}</button>
      </section>
      {list.map((c) => (
        <section key={c.sonntag} className="card" style={{ gap: 6 }}>
          <div className="card-head"><b>Sonntag, {sl(c.sonntag)}</b>{!c.fertig && <span className="small">nicht abgeschlossen</span>}</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {Object.entries(c.stimmung || {}).map(([id, v]) => <span key={id}><b style={{ color: ctx.member(id)?.color }}>{ctx.member(id)?.name}</b> {FACE[v]}</span>)}
          </div>
          {Object.entries(c.schoenstes || {}).filter(([, t]) => t).map(([id, t]) => <div key={id} className="small">✨ {ctx.member(id)?.name}: {t}</div>)}
          {(c.danke || []).map((t, i) => <div key={i} className="small">💛 {ctx.member(t.von)?.name} → {ctx.member(t.an)?.name}{t.text ? `: ${t.text}` : ''}</div>)}
          {c.vorhaben && <div className="small">🎯 {c.vorhaben}</div>}
        </section>
      ))}
      {open && <CheckIn ctx={ctx} onClose={() => setOpen(false)} />}
    </>
  );
}
