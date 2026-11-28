// Mitteilungen (Web-Push) für Catrin und Dirk.
// art "zeitplan" (stündlich): 7 Uhr Tagesüberblick, 19 Uhr Ausblick auf morgen (Bremer Zeit).
// art "vereinbaren" / "wunsch": sofort nach neuem Eintrag. art "test": Probe an die eigenen Geräte.
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { expand, addDays, weekday, hm } from "./dates.js";
import { muellStatus, BINS } from "./home.js";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const APP = "https://home-5021881183.app-ionos.space/";

function berlin() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 };
}

async function send(db: any, memberId: string, pref: string | null, payload: Record<string, unknown>) {
  const { data: subs } = await db.from("push_subscriptions").select("*").eq("member_id", memberId);
  let n = 0;
  for (const s of subs ?? []) {
    if (pref && s.prefs?.[pref] === false) continue;
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 6 * 3600, urgency: "normal" });
      await db.from("push_subscriptions").update({ last_ok: new Date().toISOString() }).eq("id", s.id);
      n++;
    } catch (e) {
      const code = (e as any)?.statusCode;
      if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("id", s.id); // Gerät abgemeldet
    }
  }
  return n;
}

async function once(db: any, kind: string, day: string, member: string) {
  const { error } = await db.from("push_log").insert({ kind, on_date: day, member_id: member });
  return !error; // false = schon gesendet
}

function names(members: any[], who: string[]) {
  if (!who || who.includes("all")) return "alle";
  return who.map((w) => members.find((m) => m.id === w)?.name ?? w).join(", ");
}

function eventLine(o: any, members: any[]) {
  const t = o.ev.all_day ? (o.ev.kind === "geburtstag" ? "🎂" : "ganztags") : hm(o.ev.from_time);
  return `${t} ${o.ev.title} (${names(members, o.ev.who)})`;
}

async function packText(db: any, kids: any[], date: string) {
  const [{ data: rules }, { data: items }, { data: checks }] = await Promise.all([
    db.from("pack_rules").select("*"), db.from("pack_items").select("*").eq("on_date", date), db.from("pack_checks").select("*").eq("on_date", date),
  ]);
  const wd = weekday(date);
  const parts: string[] = [];
  for (const k of kids) {
    const done = new Set((checks ?? []).filter((c: any) => c.kid === k.id).map((c: any) => c.item_key));
    const list = [
      ...(rules ?? []).filter((r: any) => r.kid === k.id && (r.weekdays ?? []).includes(wd)).filter((r: any) => !done.has(`r:${r.id}`)).map((r: any) => r.item),
      ...(items ?? []).filter((p: any) => p.kid === k.id && p.art === "mit" && !done.has(`i:${p.id}`)).map((p: any) => p.text),
    ];
    if (list.length) parts.push(`${k.name}: ${list.join(", ")}`);
  }
  return parts.join(" · ");
}

async function zeitplan(db: any, force?: string) {
  const { day, hour } = berlin();
  const slot = force ?? (hour === 7 ? "morgen" : hour === 19 ? "abend" : null);
  if (!slot) return { slot: null };
  const { data: members } = await db.from("members").select("*").order("sort");
  const adults = (members ?? []).filter((m: any) => !m.kid);
  const kids = (members ?? []).filter((m: any) => m.kid);
  const { data: events } = await db.from("events").select("*");
  const { data: settings } = await db.from("settings").select("*").eq("key", "muell").maybeSingle();
  const out: Record<string, number> = {};

  if (slot === "morgen") {
    const today = expand(events ?? [], day, day);
    const { data: care } = await db.from("care_needs").select("id, on_date, from_time, reason").gte("on_date", day).lte("on_date", addDays(day, 7));
    const { data: asks } = await db.from("care_asks").select("need_id, status");
    const openCare = (care ?? []).filter((c: any) => !(asks ?? []).some((a: any) => a.need_id === c.id && a.status === "zugesagt"));
    const lines = today.map((o: any) => eventLine(o, members));
    if (openCare.length) lines.push(`Betreuung noch offen: ${openCare.map((c: any) => `${c.on_date.slice(8, 10)}.${c.on_date.slice(5, 7)}. ${c.reason || ""}`.trim()).join(", ")}`);
    if (!lines.length) return { slot, gesendet: 0 };
    for (const a of adults) if (force || (await once(db, "morgen", day, a.id))) out[a.id] = await send(db, a.id, "morgen", { title: `Heute · ${today.length} ${today.length === 1 ? "Termin" : "Termine"}`, body: lines.join("\n"), url: APP, tag: `morgen-${day}` });
  } else {
    const tomorrow = addDays(day, 1);
    const tom = expand(events ?? [], tomorrow, tomorrow);
    const pack = await packText(db, kids, tomorrow);
    const { data: dueTodos } = await db.from("todo_inbox").select("title, owner, due").is("done_at", null).lte("due", tomorrow);
    const { data: dueBuys } = await db.from("buy_items").select("art, due").eq("done", false).lte("due", tomorrow);
    for (const a of adults) {
      const lines = tom.map((o: any) => eventLine(o, members));
      const mine = (dueTodos ?? []).filter((t: any) => !t.owner || t.owner === a.id).map((t: any) => t.title);
      const faellig = [...mine, ...(dueBuys ?? []).map((b: any) => `besorgen: ${b.art}`)];
      if (faellig.length) lines.push(`Fällig: ${faellig.join(", ")}`);
      if (pack) lines.push(`Einpacken – ${pack}`);
      const m = settings?.value;
      if (m && m.out_by === a.id) {
        const st = muellStatus(m, day);
        if (st.today && st.text.includes("raus")) lines.unshift(`🗑 Heute Abend raus: ${st.bins.map((b: string) => BINS[b]?.label ?? b).join(" + ")}`);
      }
      if (!lines.length) continue;
      if (force || (await once(db, "abend", day, a.id))) out[a.id] = await send(db, a.id, "abend", { title: "Für morgen", body: lines.join("\n"), url: APP, tag: `abend-${day}` });
    }
  }
  return { slot, gesendet: out };
}

// ---------- Arbeit: Briefing um 18 Uhr für den nächsten Schultag, Untis-Änderungen ----------
const UNTIS: Record<string, string> = { LZ: "Lernzeit", VER: "Vertretung", Coach: "Coaching", "WP Hand": "Wahlpflicht Hand" };
const untisName = (namen: Record<string, string>, t: string) => namen[t] ?? UNTIS[t] ?? (t.startsWith("P-") ? `Aufsicht ${t.slice(2)}` : t);
const klassenVon = (note: string) => (String(note ?? "").split(" · ")[1] ?? "").match(/\b\d{1,2}[a-zA-Z]{1,2}\b/g)?.join(", ") ?? "";
export const kursVon = (ev: any) => `${ev.title}|${klassenVon(ev.note)}`;
const WDL = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

async function dienst(db: any, force?: boolean, nur?: string) {
  const { day, hour } = berlin();
  if (!force && hour !== 18) return { dienst: null };
  const morgen = addDays(day, 1);
  if (weekday(morgen) > 4) return { dienst: "wochenende" };
  const { data: subs } = await db.from("calendar_subscriptions").select("id, art, arbeit_von").not("arbeit_von", "is", null);
  const plan = new Set((subs ?? []).filter((x: any) => x.art === "stundenplan").map((x: any) => x.id));
  const owners = [...new Set((subs ?? []).map((x: any) => x.arbeit_von))];
  const { data: st } = await db.from("settings").select("value").eq("key", "untis_namen").maybeSingle();
  const namen = st?.value ?? {};
  const out: Record<string, number> = {};
  for (const me of (owners as string[]).filter((x) => !nur || x === nur)) {
    const { data: evs } = await db.from("work_events").select("*").eq("owner", me).or(`start_date.eq.${morgen},rep.neq.keine,end_date.gte.${morgen}`);
    const occ = expand(evs ?? [], morgen, morgen);
    const stunden = occ.filter((o: any) => o.ev.sub_id && plan.has(o.ev.sub_id) && !o.ev.all_day);
    const termine = occ.filter((o: any) => !(o.ev.sub_id && plan.has(o.ev.sub_id)));
    const { data: todos } = await db.from("work_todos").select("title, due, am").eq("owner", me).is("done_at", null).or(`due.lte.${morgen},am.eq.${morgen}`);
    const { data: fristen } = await db.from("work_fristen").select("titel, datum").eq("owner", me).is("erledigt_at", null).gte("datum", day).lte("datum", addDays(day, 3));
    const { data: notizen } = await db.from("work_kursnotizen").select("kurs, text").eq("owner", me).is("erledigt_at", null);
    const { data: aend } = await db.from("work_aenderungen").select("text").eq("owner", me).eq("datum", morgen).is("gesehen_at", null);
    const lines: string[] = [];
    if (stunden.length) {
      const von = String(stunden[0].ev.from_time).slice(0, 5), bis = String(stunden[stunden.length - 1].ev.to_time ?? stunden[stunden.length - 1].ev.from_time).slice(0, 5);
      lines.push(`🕗 ${von}–${bis}: ${[...new Set(stunden.map((o: any) => untisName(namen, o.ev.title)))].join(", ")}`);
      const kurse = new Set(stunden.map((o: any) => kursVon(o.ev)));
      for (const n of (notizen ?? []).filter((n: any) => kurse.has(n.kurs))) lines.push(`📝 ${untisName(namen, n.kurs.split("|")[0])}${n.kurs.split("|")[1] ? " " + n.kurs.split("|")[1] : ""}: ${n.text}`);
    }
    for (const a of aend ?? []) lines.push(`⚠️ ${a.text}`);
    for (const o of termine) lines.push(`📅 ${o.ev.all_day ? "ganztags" : String(o.ev.from_time).slice(0, 5)} ${o.ev.title}`);
    for (const t of todos ?? []) lines.push(`🔔 ${t.title}`);
    for (const f of fristen ?? []) lines.push(`⏳ Frist ${f.datum.slice(8, 10)}.${f.datum.slice(5, 7)}.: ${f.titel}`);
    if (!lines.length) continue;
    if (force || (await once(db, "dienst", day, me))) out[me] = await send(db, me, "dienst", { title: `Dienst ${WDL[weekday(morgen)]}`, body: lines.join("\n"), url: APP, tag: `dienst-${day}` });
  }
  return { dienst: out };
}

async function untisMelden(db: any) {
  const { hour } = berlin();
  if (hour < 6 || hour > 21) return { untis: "ruhezeit" };
  const { data: rows } = await db.from("work_aenderungen").select("*").is("gemeldet_at", null).is("gesehen_at", null).order("datum");
  const per: Record<string, any[]> = {};
  for (const r of rows ?? []) (per[r.owner] ||= []).push(r);
  const out: Record<string, number> = {};
  for (const [me, l] of Object.entries(per)) {
    out[me] = await send(db, me, "untis", { title: l.length === 1 ? "Untis-Änderung" : `${l.length} Untis-Änderungen`, body: l.slice(0, 8).map((x) => x.text).join("\n"), url: APP, tag: `untis-${Date.now()}` });
    await db.from("work_aenderungen").update({ gemeldet_at: new Date().toISOString() }).in("id", l.map((x) => x.id));
  }
  return { untis: out };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: cfg } = await db.from("push_config").select("*").single();
  webpush.setVapidDetails(cfg.subject, cfg.vapid_public, cfg.vapid_private);
  const body = await req.json().catch(() => ({}));
  try {
    if (body.art === "zeitplan") return json({ ...(await zeitplan(db)), ...(await untisMelden(db)) });
    if (body.art === "dienst") return json(await dienst(db));

    if (body.art === "vereinbaren" && body.id) {
      const { data: r } = await db.from("todo_inbox").select("*").eq("id", body.id).single();
      if (!r) return json({ ok: true, gesendet: 0 });
      const typ = r.typ ?? "termin";
      // Wer bekommt es? Zuständige Person; sonst bei Terminen Dirk, sonst beide Erwachsenen
      const to: string[] = r.owner ? [r.owner] : typ === "termin" ? ["dirk"] : ["dirk", "catrin"];
      const { data: by } = await db.from("members").select("name").eq("id", r.by_who).maybeSingle();
      const TITLE: Record<string, string> = { termin: "Termin vereinbaren", anrufen: "Anrufen", ausfuellen: "Ausfüllen", kuendigen: "Kündigen", ueberweisen: "Bezahlen", sonstiges: "Zu erledigen" };
      const due = r.due ? ` – bis ${r.due.slice(8, 10)}.${r.due.slice(5, 7)}.` : "";
      let n = 0;
      for (const m of to.filter((x) => x !== r.by_who)) n += await send(db, m, "vereinbaren", { title: TITLE[typ] ?? "Zu erledigen", body: `${r.title}${due}${by ? ` (von ${by.name})` : ""}`, url: APP, tag: `inbox-${r.id}` });
      return json({ ok: true, gesendet: n });
    }
    if (body.art === "wunsch" && body.id) {
      const { data: w } = await db.from("meal_wishes").select("*").eq("id", body.id).single();
      const { data: by } = await db.from("members").select("name").eq("id", w?.who).maybeSingle();
      const n = await send(db, "catrin", "wunsch", { title: "Essenswunsch", body: `${by?.name ?? "Jemand"} wünscht sich ${w?.title}`, url: APP, tag: `wunsch-${w?.id}` });
      return json({ ok: true, gesendet: n });
    }

    // Probe und Vorschau: nur für angemeldete Familienmitglieder, an die eigenen Geräte
    const auth = req.headers.get("Authorization") ?? "";
    const user = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: me } = await user.rpc("my_member");
    if (!me) return json({ error: "Nur für die Familie." }, 403);
    if (body.art === "dienst-probe") return json(await (async () => { const r = await dienst(db, true, me); return { ok: true, ...r }; })());
    if (body.art === "test") {
      const n = await send(db, me, null, { title: "Familien-App", body: "Mitteilungen funktionieren auf diesem Gerät. 👍", url: APP, tag: "test" });
      return json({ ok: true, gesendet: n });
    }
    return json({ error: "Unbekannte Art." }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
