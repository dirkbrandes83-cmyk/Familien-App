// Elternbrief-Scan: Foto oder PDF → Termine, Mitbringen, Fristen (Vorschläge).
// Das Bild wird nur an die KI geschickt und nirgends gespeichert.
// Benötigt das Secret ANTHROPIC_API_KEY (Supabase › Edge Functions › Secrets).
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const MODEL = "claude-sonnet-5-5";
const TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

function berlinToday() {
  const d = new Date();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(d);
  const wd = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long" }).format(d);
  return { day, wd };
}

const PROMPT = (day: string, wd: string) => `Du liest einen Elternbrief oder eine Schul-/Kita-Mitteilung für eine Familie in Bremen aus.
Heute ist ${wd}, der ${day}. Kinder: Jonte (10 Jahre) und Emil (8 Jahre). Eltern: Catrin und Dirk.

Gib NUR ein JSON-Objekt zurück, ohne weiteren Text, in genau dieser Form:
{
  "zusammenfassung": "1–2 kurze Sätze, worum es geht",
  "fuer": "jonte" | "emil" | "beide" | "eltern" | "unklar",
  "termine": [{"titel": "...", "datum": "YYYY-MM-DD", "von": "HH:MM" oder null, "bis": "HH:MM" oder null, "wer": "jonte" | "emil" | "beide" | "eltern"}],
  "mitbringen": [{"text": "was das Kind mitbringen/anziehen muss", "datum": "YYYY-MM-DD", "kind": "jonte" | "emil" | "beide"}],
  "fristen": [{"text": "was die Eltern bis wann erledigen müssen, z. B. Zettel unterschreiben, Geld überweisen", "datum": "YYYY-MM-DD"}],
  "hinweise": ["sonstige wichtige Punkte, kurz"]
}
Regeln:
- Datumsangaben ohne Jahr beziehen sich auf das nächste passende Datum ab heute.
- Wochentage wie „nächsten Dienstag“ in ein konkretes Datum umrechnen.
- Steht ein Kindername oder eine Klasse nicht im Brief, setze "unklar" bzw. "beide".
- Nichts erfinden: Was nicht im Brief steht, weglassen. Leere Listen sind erlaubt.
- Mitbringen nur, wenn das Kind an einem bestimmten Tag etwas dabeihaben oder tragen muss (z. B. Geld, Sportzeug, Kostüm).`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: me } = await sb.rpc("my_member");
    if (!me) return json({ error: "Nur für Catrin und Dirk." }, 403);

    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return json({ error: "Der Scan ist noch nicht eingerichtet (API-Schlüssel fehlt)." }, 503);

    const body = await req.json().catch(() => ({}));
    const type = String(body.media_type ?? "");
    const data = String(body.data ?? "");
    if (!TYPES.includes(type)) return json({ error: "Bitte ein Foto (JPG/PNG) oder ein PDF wählen." }, 400);
    if (data.length > 11_000_000) return json({ error: "Die Datei ist zu groß (max. ca. 8 MB)." }, 413);

    const { day, wd } = berlinToday();
    const block = type === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: type, data } }
      : { type: "image", source: { type: "base64", media_type: type, data } };
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 2000, messages: [{ role: "user", content: [block, { type: "text", text: PROMPT(day, wd) }] }] }),
      signal: AbortSignal.timeout(90000),
    });
    if (!res.ok) {
      const t = await res.text();
      const msg = res.status === 401 ? "Der API-Schlüssel stimmt nicht." : res.status === 429 ? "Gerade zu viele Anfragen – bitte gleich nochmal." : res.status === 400 && /credit/i.test(t) ? "Das Guthaben beim KI-Anbieter ist aufgebraucht." : `Die KI hat nicht geantwortet (${res.status}).`;
      return json({ error: msg }, 502);
    }
    const out = await res.json();
    const text = (out.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return json({ error: "Im Brief wurde nichts Lesbares gefunden." }, 422);
    let parsed;
    try { parsed = JSON.parse(m[0]); } catch { return json({ error: "Die Antwort der KI war unvollständig – bitte nochmal versuchen." }, 502); }
    const clean = (a: unknown) => (Array.isArray(a) ? a : []);
    return json({
      zusammenfassung: String(parsed.zusammenfassung ?? ""),
      fuer: parsed.fuer ?? "unklar",
      termine: clean(parsed.termine), mitbringen: clean(parsed.mitbringen), fristen: clean(parsed.fristen), hinweise: clean(parsed.hinweise),
    });
  } catch (e) {
    return json({ error: (e as Error).name === "TimeoutError" ? "Das Auslesen hat zu lange gedauert." : "Der Scan hat nicht geklappt." }, 500);
  }
});
