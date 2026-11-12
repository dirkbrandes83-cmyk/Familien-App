// Daten für das Home-Bildschirm-Widget (Scriptable). Nur lesen.
// Aufruf: GET /functions/v1/widget?t=<Lese-Schlüssel aus der App>
import { createClient } from "jsr:@supabase/supabase-js@2";
import { expand, addDays, weekday, hm, WD } from "./dates.js";
import { muellHeute, BINS } from "./home.js";

const cors = { "Access-Control-Allow-Origin": "*" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });

function berlinNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === "24" ? "00" : p.hour}:${p.minute}` };
}

Deno.serve(async (req) => {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  if (!/^[0-9a-f]{48}$/.test(t)) return json({ error: "Kein gültiger Schlüssel." }, 401);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: tok } = await db.from("widget_tokens").select("token, member_id").eq("token", t).maybeSingle();
  if (!tok) return json({ error: "Schlüssel gesperrt oder unbekannt." }, 401);
  await db.from("widget_tokens").update({ last_used: new Date().toISOString() }).eq("token", t);

  const { day, time } = berlinNow();
  const tomorrow = addDays(day, 1);
  const [{ data: members }, { data: events }, { data: settings }, { data: shop }, { data: rules }, { data: items }, { data: checks }] = await Promise.all([
    db.from("members").select("id, name, color, kid").order("sort"),
    db.from("events").select("id, title, kind, who, start_date, end_date, all_day, from_time, to_time, rep, rep_until, exdates, bring_by, pick_by"),
    db.from("settings").select("value").eq("key", "muell").maybeSingle(),
    db.from("shopping_items").select("name").eq("done", false),
    db.from("pack_rules").select("id, kid, item, weekdays"),
    db.from("pack_items").select("id, kid, text, art").eq("on_date", tomorrow),
    db.from("pack_checks").select("kid, item_key").eq("on_date", tomorrow),
  ]);
  const mem = new Map((members ?? []).map((m: any) => [m.id, m]));
  const who = (w: string[]) => (w.includes("all") ? [{ name: "Alle", color: "#0F766E" }] : w.map((x) => mem.get(x)).filter(Boolean).map((m: any) => ({ name: m.name, color: m.color })));
  const row = (o: any) => ({
    time: o.ev.all_day ? (o.ev.kind === "geburtstag" ? "🎂" : "ganzt.") : hm(o.ev.from_time) + (o.ev.to_time ? "–" + hm(o.ev.to_time) : ""),
    title: o.ev.title,
    who: who(o.ev.who),
    fahrt: [o.ev.bring_by && o.ev.bring_by !== "nicht nötig" ? `bringt ${o.ev.bring_by}` : null, o.ev.pick_by && o.ev.pick_by !== "nicht nötig" ? `holt ${o.ev.pick_by}` : null].filter(Boolean).join(" · ") || null,
  });
  // Heute: was noch kommt (Ganztägiges immer, Zeittermine ab 30 Minuten vor jetzt)
  const soon = (t2: string) => { const [h, m] = t2.split(":").map(Number); const [h2, m2] = time.split(":").map(Number); return h * 60 + m >= h2 * 60 + m2 - 30; };
  const heute = expand(events ?? [], day, day).filter((o: any) => o.ev.all_day || soon(hm(o.ev.from_time))).map(row);
  const morgen = expand(events ?? [], tomorrow, tomorrow).map(row);

  const m = settings?.value;
  const st = muellHeute(m, day);
  const muell = st ? { text: st.text, bins: st.bins.map((b: string) => ({ label: BINS[b]?.label ?? b, color: BINS[b]?.color ?? "#888" })) } : null;

  const wd = weekday(tomorrow);
  let pack = 0;
  for (const k of (members ?? []).filter((x: any) => x.kid)) {
    const done = new Set((checks ?? []).filter((c: any) => c.kid === k.id).map((c: any) => c.item_key));
    pack += (rules ?? []).filter((r: any) => r.kid === k.id && (r.weekdays ?? []).includes(wd) && !done.has(`r:${r.id}`)).length;
    pack += (items ?? []).filter((p: any) => p.kid === k.id && p.art === "mit" && !done.has(`i:${p.id}`)).length;
  }
  return json({
    datum: `${WD[weekday(day)]} ${Number(day.slice(8, 10))}.${Number(day.slice(5, 7))}.`,
    stand: time,
    heute, morgen, muell,
    einkauf: (shop ?? []).length,
    einpacken: pack,
    app: "https://home-5021881183.app-ionos.space/",
  });
});
