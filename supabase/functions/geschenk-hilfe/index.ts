// KI-Kaufhilfe für Weihnachtsgeschenke (nur Eltern).
// art "kauf":  zu einer Geschenkidee konkrete Produkte, Preise und Bezugsquellen (mit Websuche).
// art "ideen": für eine Person neue Geschenkideen passend zu Alter, Wünschen und Budget.
// Benötigt das Secret ANTHROPIC_API_KEY (wie der Briefscan).
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const MODEL = "claude-sonnet-5-5";
const s = (v: unknown, n = 300) => String(v ?? "").slice(0, n).trim();

const FAMILIE = "Familie in Bremen: Kinder Emil (10 Jahre, 5. Klasse) und Jonte (8 Jahre, 2. Klasse), Eltern Catrin und Dirk.";

function kaufPrompt(b: Record<string, unknown>) {
  return `Du bist eine sachliche Einkaufshilfe für Weihnachtsgeschenke. ${FAMILIE}
Geschenk für: ${s(b.fuer, 60)}${b.alter ? ` (${s(b.alter, 40)})` : ""}
Idee: ${s(b.idee, 160)}
${b.budget ? `Budget: etwa ${s(b.budget, 20)} €` : "Budget: offen"}
${b.notiz ? `Notiz: ${s(b.notiz, 200)}` : ""}
${b.hinweis ? `Zusatz von den Eltern: ${s(b.hinweis, 300)}` : ""}

Recherchiere mit der Websuche aktuelle, in Deutschland erhältliche Produkte zu dieser Idee.
Gib 2 bis 4 konkrete Vorschläge (verschiedene Preisklassen, wenn sinnvoll), achte auf Altersangabe und Qualität.
Nenne nur Bezugsquellen und Links, die in deinen Suchergebnissen vorkommen; erfinde keine Links oder Preise.
Wenn sinnvoll, nenne auch einen Laden in Bremen.

Antworte am Ende NUR mit einem JSON-Objekt, ohne weiteren Text:
{"kurz":"ein Satz Einschätzung","vorschlaege":[{"produkt":"Name","warum":"kurz, warum es passt","preis":"ca. 30 €","wo":[{"name":"Shop","link":"https://…"}],"achtung":"optional: Alter, Lieferzeit, Zubehör"}],"tipps":["optional, höchstens 3 kurze Tipps"]}`;
}

function ideenPrompt(b: Record<string, unknown>) {
  return `Du hilfst beim Finden von Weihnachtsgeschenken. ${FAMILIE}
Geschenke für: ${s(b.fuer, 60)}${b.alter ? ` (${s(b.alter, 40)})` : ""}
Schon auf der Liste (nicht wiederholen): ${s(b.vorhanden, 600) || "noch nichts"}
${b.budget ? `Budget pro Geschenk: etwa ${s(b.budget, 20)} €` : ""}
${b.hinweis ? `Was die Person mag / Hinweise: ${s(b.hinweis, 400)}` : ""}

Schlage 5 abwechslungsreiche, altersgerechte Ideen vor (Spielzeug, Bücher, Erlebnisse, Selbstgemachtes – je nach Person).
Nutze die Websuche nur, wenn du aktuelle Preise oder Trends prüfen willst. Keine erfundenen Links.

Antworte am Ende NUR mit einem JSON-Objekt, ohne weiteren Text:
{"kurz":"ein Satz","vorschlaege":[{"produkt":"Idee","warum":"kurz","preis":"ca. 20 €","wo":[],"achtung":""}],"tipps":[]}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const auth = req.headers.get("Authorization") ?? "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: me } = await sb.rpc("my_member");
    const { data: station } = await sb.rpc("is_station");
    if (!me || station) return json({ error: "Nur für Catrin und Dirk." }, 403);
    const key = Deno.env.get("ANTHROPIC_API_KEY")?.trim();
    if (!key) return json({ error: "Die KI ist noch nicht eingerichtet: In Supabase fehlt das Secret ANTHROPIC_API_KEY." }, 503);
    if (!s(body.fuer) || (body.art !== "ideen" && !s(body.idee))) return json({ error: "Für wen und welche Idee?" }, 400);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL, max_tokens: 3000,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: body.art === "ideen" ? 2 : 4, user_location: { type: "approximate", city: "Bremen", country: "DE", timezone: "Europe/Berlin" } }],
        messages: [{ role: "user", content: body.art === "ideen" ? ideenPrompt(body) : kaufPrompt(body) }],
      }),
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) {
      const t = await res.text();
      console.error("anthropic", res.status, t.slice(0, 500));
      return json({ error: `Die KI hat gerade nicht geantwortet (${res.status}). Bitte später noch einmal.` }, 502);
    }
    const out = await res.json();
    const text = (out.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n");
    const m = text.match(/\{[\s\S]*\}\s*$/) ?? text.match(/\{[\s\S]*\}/);
    if (!m) return json({ error: "Die Antwort war nicht lesbar. Bitte noch einmal versuchen." }, 502);
    const data = JSON.parse(m[0]);
    // Nur echte http(s)-Links durchlassen
    for (const v of data.vorschlaege ?? []) v.wo = (v.wo ?? []).filter((w: { link?: string }) => !w.link || /^https?:\/\//.test(w.link)).slice(0, 3);
    return json(data);
  } catch (e) {
    console.error(e);
    return json({ error: `Hat nicht geklappt: ${(e as Error).message}` }, 500);
  }
});
