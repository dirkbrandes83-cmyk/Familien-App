// Heimspiele der Werder-Frauen (Bundesliga, DFB-Pokal) und der Werder U23 (Herren, Regionalliga Nord)
// aus OpenLigaDB holen und in settings.spiele ablegen. Läuft täglich per Zeitplan (werder-spiele-taeglich).
import { createClient } from "jsr:@supabase/supabase-js@2";

const QUELLEN = [
  { liga: "ffb1", team: "Werder-Frauen", wett: "Bundesliga", heim: /werder bremen frauen/i, art: "frauen" },
  { liga: "dfbf", team: "Werder-Frauen", wett: "DFB-Pokal", heim: /werder bremen frauen/i, art: "frauen" },
  { liga: "rln", team: "Werder U23 ♂", wett: "Regionalliga", heim: /werder bremen ii/i, art: "herren" },
];
const kurz = (n: string) => n.replace(/\s+(Frauen|II)$/i, "").replace(/^(1\. FC|1\. FSV|FC|SV|VfL|VfB|SC|TSG 1899|SpVgg|SSV|HSC)\s+/i, (m) => (/^(1\. FC|1\. FSV)/i.test(m) ? m : "")).trim();

Deno.serve(async () => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jetzt = new Date();
  const heute = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(jetzt);
  const saison = jetzt.getMonth() >= 6 ? jetzt.getFullYear() : jetzt.getFullYear() - 1;
  const spiele: any[] = [];
  const fehler: string[] = [];
  for (const q of QUELLEN) {
    try {
      const r = await fetch(`https://api.openligadb.de/getmatchdata/${q.liga}/${saison}`, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      for (const m of await r.json()) {
        if (!q.heim.test(m.team1?.teamName ?? "")) continue;
        const [datum, zeit] = String(m.matchDateTime).split("T");
        if (datum < heute) continue;
        spiele.push({
          id: `${q.liga}-${m.matchID}`, team: q.team, art: q.art, wett: q.wett, datum, zeit: zeit.slice(0, 5),
          gegner: kurz(m.team2?.teamName ?? ""), ort: m.location?.locationStadium || "Weserstadion – Platz 11",
        });
      }
    } catch (e) { fehler.push(`${q.liga}: ${(e as Error).message}`); }
  }
  spiele.sort((a, b) => (a.datum + a.zeit).localeCompare(b.datum + b.zeit));
  // Bei Ausfall der Quelle die alte Liste behalten
  if (spiele.length || !fehler.length) await db.from("settings").upsert({ key: "spiele", value: { stand: jetzt.toISOString(), spiele: spiele.slice(0, 40) } });
  return new Response(JSON.stringify({ ok: true, anzahl: spiele.length, fehler }), { headers: { "Content-Type": "application/json" } });
});
