// Dauerkarten für Eika & Jan: eigener Link ohne Anmeldung (?t=<Schlüssel>, scope „dauerkarten“).
// GET: Heimspiele der Saison mit Zuteilung und Wünschen · POST { id, was, kat, text }: Wunsch / Festlegen / Bestätigen / Ablehnen / Zurückziehen / Notiz
import { createClient } from "jsr:@supabase/supabase-js@2";
import { aktion } from "./dauerkarten.js";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const t = new URL(req.url).searchParams.get("t") ?? "";
  if (!/^[0-9a-f]{48}$/.test(t)) return json({ error: "Kein gültiger Link." }, 401);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: tok } = await db.from("widget_tokens").select("token, scope").eq("token", t).maybeSingle();
  if (!tok || tok.scope !== "dauerkarten") return json({ error: "Link gesperrt." }, 401);
  await db.from("widget_tokens").update({ last_used: new Date().toISOString() }).eq("token", t);

  const jetzt = new Date();
  const saison = jetzt.getMonth() >= 6 ? jetzt.getFullYear() : jetzt.getFullYear() - 1;
  const laden = async () => (await db.from("dk_spiele").select("id, datum, zeit, gegner, wett, zuteilung, wunsch, wunsch_von, notiz, praef").eq("saison", saison).order("datum")).data ?? [];
  let spiele = await laden();

  if (req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const s = spiele.find((x: any) => x.id === b.id);
    if (!s) return json({ error: "Spiel nicht gefunden." }, 404);
    const r = aktion("die", spiele, s, String(b.was ?? ""), b.kat ?? null, b.text ?? null);
    if (r.fehler) return json({ error: r.fehler }, 400);
    const { error } = await db.from("dk_spiele").update({ ...r.patch, updated_at: new Date().toISOString() }).eq("id", s.id);
    if (error) return json({ error: error.message }, 500);
    spiele = await laden();
  }
  const { data: st } = await db.from("settings").select("value").eq("key", "dauerkarten").maybeSingle();
  return json({ spiele, preis: Number(st?.value?.preis ?? 0) });
});
