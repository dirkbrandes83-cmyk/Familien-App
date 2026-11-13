// Familien-App als abonnierbarer Kalender (ICS) – z. B. für Apple Kalender und darüber für Klender.
// Aufruf: GET /functions/v1/kalender-feed?t=<Schlüssel mit scope 'kalender'>
// Enthält nur eigene Termine der App (keine Abos wie Klender oder Schule – sonst gäbe es Doppelungen).
import { createClient } from "jsr:@supabase/supabase-js@2";

const RRULE: Record<string, string> = { "täglich": "FREQ=DAILY", "wöchentlich": "FREQ=WEEKLY", "alle 2 Wochen": "FREQ=WEEKLY;INTERVAL=2", "monatlich": "FREQ=MONTHLY", "jährlich": "FREQ=YEARLY" };
const esc = (s: string) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const d8 = (d: string) => d.replaceAll("-", "");
const t6 = (t: string) => t.slice(0, 5).replace(":", "") + "00";
const addDay = (d: string) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
function fold(line: string) {
  const out: string[] = [];
  let s = line;
  while (new TextEncoder().encode(s).length > 74) { out.push(s.slice(0, 60)); s = " " + s.slice(60); }
  out.push(s);
  return out.join("\r\n");
}

Deno.serve(async (req) => {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  if (!/^[0-9a-f]{48}$/.test(t)) return new Response("Kein gültiger Schlüssel", { status: 401 });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: tok } = await db.from("widget_tokens").select("token, scope").eq("token", t).maybeSingle();
  if (!tok || tok.scope !== "kalender") return new Response("Schlüssel gesperrt oder unbekannt", { status: 401 });
  await db.from("widget_tokens").update({ last_used: new Date().toISOString() }).eq("token", t);

  const [{ data: members }, { data: events }] = await Promise.all([
    db.from("members").select("id, name"),
    db.from("events").select("*").is("sub_id", null).eq("review", false).not("src", "in", "(klender,abo)"),
  ]);
  const name = (id: string) => (id === "all" ? "Alle" : members?.find((m: any) => m.id === id)?.name ?? id);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Familien-App//DE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:Familien-App", "X-WR-TIMEZONE:Europe/Berlin", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
    "BEGIN:VTIMEZONE", "TZID:Europe/Berlin",
    "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
    "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
    "END:VTIMEZONE"];
  for (const e of events ?? []) {
    const who = (e.who ?? []).map(name).join(", ");
    const fahrt = [e.bring_by && e.bring_by !== "nicht nötig" ? `bringt ${e.bring_by}` : "", e.pick_by && e.pick_by !== "nicht nötig" ? `holt ${e.pick_by}` : ""].filter(Boolean).join(", ");
    const desc = [who && `Für: ${who}`, fahrt, e.note].filter(Boolean).join("\n");
    lines.push("BEGIN:VEVENT", `UID:${e.id}@familien-app`, `DTSTAMP:${stamp}`,
      `LAST-MODIFIED:${new Date(e.updated_at ?? e.created_at).toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`);
    if (e.all_day || !e.from_time) {
      lines.push(`DTSTART;VALUE=DATE:${d8(e.start_date)}`, `DTEND;VALUE=DATE:${d8(addDay(e.end_date ?? e.start_date))}`);
    } else {
      lines.push(`DTSTART;TZID=Europe/Berlin:${d8(e.start_date)}T${t6(e.from_time)}`);
      if (e.to_time) lines.push(`DTEND;TZID=Europe/Berlin:${d8(e.end_date ?? e.start_date)}T${t6(e.to_time)}`);
    }
    const rr = RRULE[e.rep];
    if (rr) lines.push(`RRULE:${rr}${e.rep_until ? `;UNTIL=${d8(e.rep_until)}` : ""}`);
    for (const x of e.exdates ?? []) lines.push(e.all_day || !e.from_time ? `EXDATE;VALUE=DATE:${d8(x)}` : `EXDATE;TZID=Europe/Berlin:${d8(x)}T${t6(e.from_time)}`);
    lines.push(fold(`SUMMARY:${esc((e.kind === "test" ? "Test: " : "") + e.title + (who && !e.who.includes("all") ? ` (${who})` : ""))}`));
    if (desc) lines.push(fold(`DESCRIPTION:${esc(desc)}`));
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.join("\r\n") + "\r\n", { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store" } });
});
