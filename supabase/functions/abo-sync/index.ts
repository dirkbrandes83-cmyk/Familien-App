// Gleicht Kalender-Abos (z. B. Kalender.digital) mit der Tabelle events ab.
// Neue Termine werden zum Prüfen markiert (review), geänderte aktualisiert,
// gelöschte (ab heute) entfernt. Aufruf stündlich per Zeitplan oder per Knopf in der App.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { parseIcs, isCurrent } from "./ics.js";
import { addDays } from "./dates.js";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const FIELDS = ["title", "start_date", "end_date", "all_day", "from_time", "to_time", "rep", "rep_until", "note"] as const;
const sameWho = (a: string[] = [], b: string[] = []) => [...a].sort().join() === [...b].sort().join();

function berlinToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
}
function norm(v: unknown) {
  if (v === null || v === undefined || v === "") return null;
  return String(v).slice(0, 5) === String(v) ? String(v) : String(v);
}
function same(a: Record<string, unknown>, b: Record<string, unknown>) {
  return FIELDS.every((f) => {
    const x = a[f], y = b[f];
    if (f === "from_time" || f === "to_time") return (x ? String(x).slice(0, 5) : null) === (y ? String(y).slice(0, 5) : null);
    return norm(x) === norm(y);
  }) && JSON.stringify((a.exdates as string[]) ?? []) === JSON.stringify((b.exdates as string[]) ?? []);
}

// Bei Abos mit who_auto (z. B. Klender) die Personen aus den Teilnehmern lesen: „Dirk Brandes“ → dirk
function whoFor(sub: any, groups: string[], members: any[]) {
  if (!sub.who_auto) return sub.who;
  const ids = new Set<string>();
  for (const g of groups ?? []) {
    const first = String(g).trim().split(/\s+/)[0]?.toLowerCase();
    const m = members.find((x: any) => x.name.toLowerCase() === first);
    if (m) ids.add(m.id);
  }
  if (!ids.size) return sub.who;
  return ids.size === members.length ? ["all"] : [...ids];
}

// Stundenplan-Abos (Untis): Änderungen der nächsten 14 Tage als Meldung festhalten
const UNTIS: Record<string, string> = { LZ: "Lernzeit", VER: "Vertretung", Coach: "Coaching", "WP Hand": "Wahlpflicht Hand" };
const WDK = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
function stundeText(e: any, namen: Record<string, string>) {
  const d = new Date(`${e.start_date}T12:00:00Z`);
  const t = String(e.title ?? "");
  const name = namen[t] ?? UNTIS[t] ?? (t.startsWith("P-") ? `Aufsicht ${t.slice(2)}` : t);
  const raum = String(e.note ?? "").includes(" · ") ? ` (${String(e.note).split(" · ")[0]})` : "";
  return `${WDK[d.getUTCDay()]} ${e.start_date.slice(8, 10)}.${e.start_date.slice(5, 7)}. ${e.from_time ? String(e.from_time).slice(0, 5) + " " : ""}${name}${raum}`;
}

async function syncOne(db: any, sub: any, members: any[]) {
  let url = String(sub.url).trim();
  if (url.startsWith("webcal://")) url = "https://" + url.slice(9);
  const res = await fetch(url, { headers: { "User-Agent": "Familien-App/1.0", Accept: "text/calendar, */*" }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Link antwortet mit Fehler ${res.status}`);
  const text = await res.text();
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("Unter dem Link liegt kein Kalender");
  const today = berlinToday();
  const firstSync = !sub.last_sync;
  const feed = parseIcs(text).events.filter((e: any) => isCurrent(e, addDays(today, -1)));
  // Arbeits-Abos landen privat in work_events (nur die Person sieht sie), alle anderen im Familienkalender
  const arbeit = !!sub.arbeit_von;
  const T = arbeit ? "work_events" : "events";
  const want = new Map<string, any>();
  for (const e of feed) {
    const uid = e.ext_uid ?? `${e.title}|${e.start_date}|${e.from_time ?? ""}`;
    const { groups, ext_uid: _u, src: _s, ...row } = e;
    want.set(`abo:${sub.id}:${uid}`, arbeit ? row : { ...row, who: whoFor(sub, groups, members) });
  }
  const { data: have, error } = await db.from(T).select("id, ext_uid, exdates, " + (arbeit ? "" : "who, ") + FIELDS.join(",")).eq("sub_id", sub.id);
  if (error) throw new Error(error.message);
  const haveMap = new Map<string, any>((have ?? []).map((h: any) => [h.ext_uid, h]));

  const inserts: any[] = [];
  let updated = 0, removed = 0;
  const melden = arbeit && sub.art === "stundenplan" && !firstSync;
  const bis = addDays(today, 14);
  const imFenster = (e: any) => e && e.start_date >= today && e.start_date <= bis;
  const neu: any[] = [], weg: any[] = [], geaendert: [any, any][] = [];
  for (const [key, row] of want) {
    const h = haveMap.get(key);
    if (!h) {
      if (melden && imFenster(row)) neu.push(row);
      inserts.push(arbeit
        ? { ...row, ext_uid: key, sub_id: sub.id, src: "abo", owner: sub.arbeit_von }
        : { ...row, ext_uid: key, sub_id: sub.id, src: "abo", kind: row.kind ?? "termin", review: !firstSync && (row.rep !== "keine" || row.start_date >= today) });
    } else if (!same(h, row) || (!arbeit && !sameWho(h.who, row.who))) {
      if (melden && (imFenster(h) || imFenster(row))) geaendert.push([h, row]);
      const { error: e2 } = await db.from(T).update({ ...row }).eq("id", h.id);
      if (!e2) updated++;
    }
  }
  for (let i = 0; i < inserts.length; i += 200) {
    const { error: e3 } = await db.from(T).upsert(inserts.slice(i, i + 200), { onConflict: "ext_uid", ignoreDuplicates: true });
    if (e3) throw new Error(e3.message);
  }
  // Im Abo gelöscht: nur zukünftige Termine entfernen (Vergangenes bleibt als Verlauf)
  const goneRows = (have ?? []).filter((h: any) => !want.has(h.ext_uid) && (h.rep !== "keine" || h.start_date >= today));
  const gone = goneRows.map((h: any) => h.id);
  if (melden) for (const h of goneRows) if (imFenster(h)) weg.push(h);
  if (melden && (neu.length || weg.length || geaendert.length)) {
    const { data: st } = await db.from("settings").select("value").eq("key", "untis_namen").maybeSingle();
    const namen = st?.value ?? {};
    const k = (e: any) => `${e.start_date}|${e.title}|${String(e.from_time ?? "").slice(0, 5)}`;
    // gleiche Stunde nur mit neuer Kennung → keine Meldung
    const wegK = new Set(weg.map(k)), neuK = new Set(neu.map(k));
    const zeilen: { datum: string; text: string }[] = [];
    for (const e of neu) if (!wegK.has(k(e))) zeilen.push({ datum: e.start_date, text: `Neu: ${stundeText(e, namen)}` });
    for (const e of weg) if (!neuK.has(k(e))) zeilen.push({ datum: e.start_date, text: `Entfällt: ${stundeText(e, namen)}` });
    for (const [a, b] of geaendert) {
      const zeitAnders = a.start_date !== b.start_date || String(a.from_time ?? "").slice(0, 5) !== String(b.from_time ?? "").slice(0, 5) || a.title !== b.title;
      const raumAnders = String(a.note ?? "").split(" · ")[0] !== String(b.note ?? "").split(" · ")[0];
      if (zeitAnders) zeilen.push({ datum: b.start_date, text: `Geändert: ${stundeText(a, namen)} → ${stundeText(b, namen)}` });
      else if (raumAnders) zeilen.push({ datum: b.start_date, text: `Raum: ${stundeText(b, namen)}` });
    }
    if (zeilen.length) await db.from("work_aenderungen").insert(zeilen.slice(0, 40).map((z) => ({ ...z, owner: sub.arbeit_von })));
  }
  if (gone.length) {
    const { error: e4 } = await db.from(T).delete().in("id", gone);
    if (!e4) removed = gone.length;
  }
  return { neu: inserts.length, geaendert: updated, entfernt: removed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({}));
  let q = db.from("calendar_subscriptions").select("*").eq("active", true);
  if (body?.sub_id) q = q.eq("id", body.sub_id);
  const { data: subs, error } = await q;
  const { data: members } = await db.from("members").select("id, name");
  if (error) return json({ error: error.message }, 500);
  const out: Record<string, unknown> = {};
  for (const sub of subs ?? []) {
    try {
      out[sub.name] = await syncOne(db, sub, members ?? []);
      await db.from("calendar_subscriptions").update({ last_sync: new Date().toISOString(), last_error: null }).eq("id", sub.id);
    } catch (e) {
      const msg = (e as Error).name === "TimeoutError" ? "Link hat zu lange nicht geantwortet" : (e as Error).message;
      out[sub.name] = { fehler: msg };
      await db.from("calendar_subscriptions").update({ last_error: msg }).eq("id", sub.id);
    }
  }
  return json({ ok: true, ergebnis: out });
});
