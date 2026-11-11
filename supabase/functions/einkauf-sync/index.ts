// Abgleich der Einkaufsliste mit Apple Erinnerungen (für iPhone und Apple Watch, über Scriptable).
// POST /functions/v1/einkauf-sync?t=<Schlüssel>  Body: { erledigt: [id…], neu: [Name…] }
// Antwort: { offen: [{ id, name, section }], neu: [{ name, id }] } – Reihenfolge wie im Laden.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { sectionOf, splitNames, ORDER } from "./shop.js";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const UUID = /^[0-9a-f-]{36}$/;

Deno.serve(async (req) => {
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const t = new URL(req.url).searchParams.get("t") ?? "";
  if (!/^[0-9a-f]{48}$/.test(t)) return json({ error: "Kein gültiger Schlüssel." }, 401);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: tok } = await db.from("widget_tokens").select("token, member_id, scope").eq("token", t).maybeSingle();
  if (!tok || tok.scope !== "einkauf") return json({ error: "Schlüssel gesperrt oder ohne Einkaufs-Recht." }, 401);
  await db.from("widget_tokens").update({ last_used: new Date().toISOString() }).eq("token", t);
  const { data: me } = await db.from("members").select("name").eq("id", tok.member_id).single();

  // 1. Auf der Uhr/im iPhone abgehakt → in der App erledigt
  const done = (Array.isArray(body.erledigt) ? body.erledigt : []).filter((x: unknown) => typeof x === "string" && UUID.test(x)).slice(0, 200);
  if (done.length) await db.from("shopping_items").update({ done: true, done_at: new Date().toISOString() }).in("id", done).eq("done", false);

  // 2. In Erinnerungen neu eingetragen (auch per Siri) → in die App, mit Kategorie
  const { data: openNow } = await db.from("shopping_items").select("id, name").eq("done", false);
  const have = new Map((openNow ?? []).map((r: any) => [r.name.toLowerCase(), r.id]));
  const { data: learnedRows } = await db.from("shop_sections").select("name, section");
  const learned = Object.fromEntries((learnedRows ?? []).map((r: any) => [r.name, r.section]));
  const names = (Array.isArray(body.neu) ? body.neu : []).filter((x: unknown) => typeof x === "string").flatMap((x: string) => splitNames(x)).map((x: string) => x.slice(0, 120)).slice(0, 50);
  const created: { name: string; id: string }[] = [];
  for (const name of names) {
    const existing = have.get(name.toLowerCase());
    if (existing) { created.push({ name, id: existing }); continue; }
    const { data: row } = await db.from("shopping_items").insert({ name, section: sectionOf(name, learned), added_by: `${me?.name ?? ""} · Erinnerungen` }).select("id").single();
    if (row) { created.push({ name, id: row.id }); have.set(name.toLowerCase(), row.id); }
  }

  // 3. Aktuelle Liste zurück
  const { data: open } = await db.from("shopping_items").select("id, name, section").eq("done", false);
  const rank = (s: string) => { const i = ORDER.indexOf(s); return i < 0 ? 99 : i; };
  const offen = (open ?? []).sort((a: any, b: any) => rank(a.section) - rank(b.section) || a.name.localeCompare(b.name, "de"));
  return json({ offen, neu: created });
});
