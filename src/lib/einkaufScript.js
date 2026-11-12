// Vorlage für Scriptable: Einkaufsliste ↔ Apple Erinnerungen (iPhone + Apple Watch).
// __KEY__ wird durch den persönlichen Einkaufs-Schlüssel ersetzt.
export const EINKAUF_SCRIPT = `// Familien-App · Einkauf ↔ Erinnerungen (für iPhone und Apple Watch)
// Gleicht die Einkaufsliste der Familien-App mit einer Liste in Apple Erinnerungen ab:
// – App → Erinnerungen: alles, was offen ist, erscheint in der Liste (auch auf der Watch)
// – Erinnerungen → App: Abgehaktes wird in der App erledigt, Neues (auch per Siri) kommt dazu
const KEY = "__KEY__";
const API = "https://xihjjneyvtgnzfuibfzf.supabase.co/functions/v1/einkauf-sync?t=" + KEY;
const LIST = "__LIST__"; // Name der Liste in Erinnerungen
const TAG = /\\[fa:([0-9a-f-]{36})\\]/;
const idOf = (r) => { const m = (r.notes || "").match(TAG); return m ? m[1] : null; };
const tag = (section, id) => (section ? section + " " : "") + "[fa:" + id + "]";

async function sync() {
  let cal;
  try { cal = await Calendar.forRemindersByTitle(LIST); }
  catch (e) { cal = null; }
  if (!cal) cal = await Calendar.createForReminders(LIST);

  const open = await Reminder.allIncomplete([cal]);
  const done = await Reminder.allCompleted([cal]);
  const erledigt = done.map(idOf).filter(Boolean);
  const neuRem = open.filter((r) => !idOf(r) && r.title && r.title.trim());

  const req = new Request(API);
  req.method = "POST";
  req.headers = { "Content-Type": "application/json" };
  req.body = JSON.stringify({ erledigt, neu: neuRem.map((r) => r.title.trim()) });
  req.timeoutInterval = 20;
  const res = await req.loadJSON();
  if (res.error) throw new Error(res.error);

  // Abgehakte Einträge sind übertragen → aus der Liste entfernen
  for (const r of done) if (idOf(r)) r.remove();

  // Neu eingetragene Einträge mit der App verknüpfen (oder entfernen, wenn sie aufgeteilt wurden: „Milch, Brot“)
  const byName = new Map(res.neu.map((x) => [x.name.toLowerCase(), x.id]));
  const want = new Map(res.offen.map((x) => [x.id, x]));
  for (const r of neuRem) {
    const id = byName.get(r.title.trim().toLowerCase());
    if (id && want.has(id)) { r.notes = tag(want.get(id).section, id); r.save(); }
    else r.remove();
  }

  // In der App erledigt oder gelöscht → hier entfernen; Doppelte entfernen
  const have = new Set();
  for (const r of await Reminder.allIncomplete([cal])) {
    const id = idOf(r);
    if (!id) continue;
    if (!want.has(id) || have.has(id)) { r.remove(); continue; }
    have.add(id);
    if (r.title !== want.get(id).name) { r.title = want.get(id).name; r.save(); }
  }

  // Fehlendes anlegen – in der Reihenfolge wie im Laden
  for (const x of res.offen) {
    if (have.has(x.id)) continue;
    const r = new Reminder();
    r.title = x.name;
    r.notes = tag(x.section, x.id);
    r.calendar = cal;
    r.save();
  }
  return res.offen;
}

let liste = null, fehler = null;
try { liste = await sync(); } catch (e) { fehler = String(e.message || e); }

// Anzeige: als Widget eine kleine Einkaufsliste, sonst eine kurze Meldung
const bg = Color.dynamic(new Color("#FBF8F3"), new Color("#1C1917"));
const ink = Color.dynamic(new Color("#1C1917"), new Color("#F5F5F4"));
const muted = Color.dynamic(new Color("#78716C"), new Color("#A8A29E"));
const teal = Color.dynamic(new Color("#0F766E"), new Color("#5EEAD4"));
const w = new ListWidget();
w.backgroundColor = bg;
w.setPadding(12, 14, 12, 14);
w.url = "https://home-5021881183.app-ionos.space/";
w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
const t1 = w.addText(liste ? "Einkauf · " + liste.length : "Einkauf");
t1.font = Font.boldSystemFont(14); t1.textColor = teal;
w.addSpacer(4);
if (fehler) {
  const t = w.addText("Abgleich ging nicht: " + fehler); t.font = Font.systemFont(11); t.textColor = muted;
} else if (!liste.length) {
  const t = w.addText("Alles da."); t.font = Font.systemFont(13); t.textColor = muted;
} else {
  const max = config.widgetFamily === "large" ? 14 : config.widgetFamily === "small" ? 5 : 6;
  for (const x of liste.slice(0, max)) { const t = w.addText("○ " + x.name); t.font = Font.systemFont(13); t.textColor = ink; t.lineLimit = 1; }
  if (liste.length > max) { const t = w.addText("… und " + (liste.length - max) + " weitere"); t.font = Font.systemFont(11); t.textColor = muted; }
}
w.addSpacer();

if (config.runsInWidget) Script.setWidget(w);
else if (config.runsWithSiri || config.runsInActionExtension || args.shortcutParameter !== undefined) Script.setShortcutOutput(fehler ? "Fehler: " + fehler : "Einkauf abgeglichen (" + liste.length + " offen)");
else await w.presentSmall();
Script.complete();
`;
