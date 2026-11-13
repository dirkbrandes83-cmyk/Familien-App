// Wettervorhersage für Bremen (Open-Meteo, ohne Schlüssel). Ergebnis wird in settings.wetter zwischengespeichert,
// damit App und Station es lesen können. Aufruf aus der App, wenn die Daten älter als 3 Stunden sind.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: cur } = await db.from("settings").select("value").eq("key", "wetter").maybeSingle();
  const fresh = cur?.value?.at && Date.now() - Date.parse(cur.value.at) < 3 * 3600_000 && cur.value.days?.[0]?.tmin !== undefined;
  if (fresh) return json(cur.value);
  const url = "https://api.open-meteo.com/v1/forecast?latitude=53.08&longitude=8.81&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max&timezone=Europe%2FBerlin&forecast_days=8";
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`Wetterdienst antwortet mit ${r.status}`);
    const d = await r.json();
    const days = (d.daily?.time ?? []).map((t: string, i: number) => ({
      date: t,
      code: d.daily.weather_code[i],
      tmax: Math.round(d.daily.temperature_2m_max[i]),
      tmin: Math.round(d.daily.temperature_2m_min[i]),
      regen: d.daily.precipitation_probability_max[i],
      wind: Math.round(d.daily.wind_speed_10m_max[i]),
    }));
    const value = { at: new Date().toISOString(), days };
    await db.from("settings").upsert({ key: "wetter", value });
    return json(value);
  } catch (e) {
    return json({ ...(cur?.value ?? {}), fehler: (e as Error).message }, cur?.value ? 200 : 502);
  }
});
