// Schnell-Eintragen von außen (iPhone-Kurzbefehl / Home-Bildschirm-Widget), ohne die App zu öffnen.
// Schlüssel: widget_tokens mit scope 'schnell' (gehört einer Person), per Header x-key oder ?key=.
// POST { art: 'todo' | 'arbeit' | 'einkauf', text }      → Einträge (mehrere per Zeile oder Komma)
// POST { art: 'esl' | 'team' | 'thema', text }           → Themen für ESL / Teamsitzung
// POST { art: 'scan', media_type, data (base64) }       → KI liest aus, Ergebnis wartet in der App zum Prüfen
// Antwort immer { ok, msg } – msg ist ein kurzer Satz für die Kurzbefehl-Anzeige.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { sectionOf, splitNames } from "./shop.js";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-key" };
// Immer 200: Kurzbefehle und Siri zeigen bzw. sprechen dann die Meldung „msg“ statt eines Fehlercodes
const json = (b: unknown, _status = 200) => new Response(JSON.stringify(b), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
const MODEL = "claude-sonnet-5-5";
const TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

function berlinToday() {
  const d = new Date();
  return {
    day: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(d),
    wd: new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long" }).format(d),
  };
}

const PROMPT = (day: string, wd: string) => `Du liest einen Elternbrief oder eine Schul-/Kita-Mitteilung für eine Familie in Bremen aus.
Heute ist ${wd}, der ${day}. Kinder: Emil (10 Jahre, Klasse 5a) und Jonte (8 Jahre, Klasse 2c). Eltern: Catrin und Dirk.

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

const zeilen = (t: string) => t.split(/\n|;/).map((x) => x.trim()).filter(Boolean).slice(0, 20);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const key = req.headers.get("x-key") || new URL(req.url).searchParams.get("key") || body.key || "";
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: tok } = await db.from("widget_tokens").select("token, member_id, scope").eq("token", String(key)).maybeSingle();
    if (!tok || tok.scope !== "schnell") return json({ ok: false, msg: "Schlüssel ungültig – in der App unter Widget neu erstellen." }, 401);
    await db.from("widget_tokens").update({ last_used: new Date().toISOString() }).eq("token", tok.token);
    const { data: me } = await db.from("members").select("id, name").eq("id", tok.member_id).single();
    // Robust gegen iOS-Autokorrektur („Esl“, „Todo “) und Siri: Art klein und ohne Leerzeichen, Synonyme erlaubt
    const ARTEN: Record<string, string> = { todo: "todo", "to-do": "todo", aufgabe: "todo", arbeit: "arbeit", dienst: "arbeit", einkauf: "einkauf", einkaufen: "einkauf", esl: "esl", "thema esl": "esl", "esl thema": "esl", team: "team", "thema team": "team", teamsitzung: "team", thema: "thema", scan: "scan", scannen: "scan" };
    const artRoh = String(body.art ?? "todo").trim().toLowerCase();
    const art = ARTEN[artRoh] ?? artRoh;
    // Text kann je nach Kurzbefehl als String, Liste oder Objekt ankommen
    const roh = Array.isArray(body.text) ? body.text.join("\n") : typeof body.text === "object" && body.text ? String(Object.values(body.text)[0] ?? "") : String(body.text ?? "");
    const text = roh.trim().slice(0, 2000);
    console.log(JSON.stringify({ art: artRoh, textLaenge: text.length, felder: Object.keys(body) }));

    if (art === "todo" || art === "arbeit") {
      const titel = zeilen(text);
      if (!titel.length) return json({ ok: false, msg: "Kein Text angekommen – im Feld „text“ fehlt die Variable „Angefragte Eingabe“, oder Siri hat nichts verstanden." }, 400);
      const rows = titel.map((t) => art === "arbeit"
        ? { owner: me.id, title: t.slice(0, 160) }
        : { typ: "sonstiges", title: t.slice(0, 120), owner: me.id, by_who: me.id });
      const { error } = await db.from(art === "arbeit" ? "work_todos" : "todo_inbox").insert(rows);
      if (error) throw error;
      return json({ ok: true, msg: `${titel.length === 1 ? `„${titel[0]}“` : `${titel.length} To-dos`} ${art === "arbeit" ? "bei Arbeit" : "in der Familien-App"} eingetragen` });
    }

    // Themen für Besprechungen: art 'esl' oder 'team' – oder 'thema' mit „ESL: …“ / „Team: …“ am Anfang
    if (art === "esl" || art === "team" || art === "thema") {
      let liste = zeilen(text);
      let wohin = art === "thema" ? "team" : art;
      const m = art === "thema" && liste[0] ? liste[0].match(/^\s*(esl|team|jahrgangsteam|teamsitzung)\s*[:\-–]\s*(.*)$/i) : null;
      if (m) { wohin = m[1].toLowerCase() === "esl" ? "esl" : "team"; liste = [m[2], ...liste.slice(1)].filter(Boolean); }
      if (!liste.length) return json({ ok: false, msg: "Kein Thema angekommen – im Feld „text“ fehlt die Variable „Angefragte Eingabe“, oder Siri hat nichts verstanden." }, 400);
      const { error } = await db.from("work_themen").insert(liste.map((t) => ({ owner: me.id, text: t.slice(0, 300), art: wohin })));
      if (error) throw error;
      return json({ ok: true, msg: `${liste.length === 1 ? `„${liste[0]}“` : `${liste.length} Themen`} für ${wohin === "esl" ? "die ESL" : "die Teamsitzung"} notiert` });
    }

    if (art === "einkauf") {
      const namen = splitNames(text).slice(0, 30);
      if (!namen.length) return json({ ok: false, msg: "Kein Text angekommen." }, 400);
      const { data: offen } = await db.from("shopping_items").select("name").eq("done", false);
      const da = new Set((offen ?? []).map((r: any) => r.name.trim().toLowerCase()));
      const { data: learnedRows } = await db.from("shop_sections").select("name, section");
      const learned = Object.fromEntries((learnedRows ?? []).map((r: any) => [r.name, r.section]));
      const neu = namen.filter((n: string) => !da.has(n.toLowerCase()));
      if (neu.length) {
        const { error } = await db.from("shopping_items").insert(neu.map((name: string) => ({ name, section: sectionOf(name, learned), added_by: `${me.name} · Schnell` })));
        if (error) throw error;
      }
      return json({ ok: true, msg: neu.length ? `Auf der Einkaufsliste: ${neu.join(", ")}` : "Stand schon alles auf der Liste." });
    }

    if (art === "scan") {
      const k = Deno.env.get("ANTHROPIC_API_KEY")?.trim();
      if (!k) return json({ ok: false, msg: "Der Scan ist noch nicht eingerichtet." }, 503);
      const type = String(body.media_type ?? "image/jpeg");
      const data = String(body.data ?? "").replace(/\s+/g, "");
      if (!TYPES.includes(type) || data.length < 100) return json({ ok: false, msg: "Kein Foto angekommen." }, 400);
      if (data.length > 11_000_000) return json({ ok: false, msg: "Das Foto ist zu groß – bitte kleiner aufnehmen." }, 413);
      const { day, wd } = berlinToday();
      const block = type === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: type, data } }
        : { type: "image", source: { type: "base64", media_type: type, data } };
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": k, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: MODEL, max_tokens: 2000, messages: [{ role: "user", content: [block, { type: "text", text: PROMPT(day, wd) }] }] }),
        signal: AbortSignal.timeout(90000),
      });
      if (!res.ok) return json({ ok: false, msg: `Die KI hat nicht geantwortet (${res.status}).` }, 502);
      const out = await res.json();
      const t = (out.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
      const m = t.match(/\{[\s\S]*\}/);
      if (!m) return json({ ok: false, msg: "Auf dem Foto wurde nichts Lesbares gefunden." }, 422);
      const p = JSON.parse(m[0]);
      const arr = (a: unknown) => (Array.isArray(a) ? a : []);
      const result = { zusammenfassung: String(p.zusammenfassung ?? ""), fuer: p.fuer ?? "unklar", termine: arr(p.termine), mitbringen: arr(p.mitbringen), fristen: arr(p.fristen), hinweise: arr(p.hinweise) };
      await db.from("scan_inbox").insert({ member_id: me.id, result });
      const teile = [result.termine.length && `${result.termine.length} Termin(e)`, result.mitbringen.length && `${result.mitbringen.length}× Mitbringen`, result.fristen.length && `${result.fristen.length} Frist(en)`].filter(Boolean);
      return json({ ok: true, msg: `Gescannt${teile.length ? `: ${teile.join(", ")}` : ""}. In der App unter „Heute“ prüfen und übernehmen.` });
    }
    return json({ ok: false, msg: `Unbekannte Art „${artRoh}“ – im Kurzbefehl bei art z. B. todo, arbeit, einkauf, esl oder team eintragen.` }, 400);
  } catch (e) {
    console.error(e);
    return json({ ok: false, msg: (e as Error).name === "TimeoutError" ? "Das Auslesen hat zu lange gedauert." : "Hat nicht geklappt." }, 500);
  }
});
