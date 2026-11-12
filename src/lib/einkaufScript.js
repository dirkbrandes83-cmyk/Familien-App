// Vorlage für Scriptable: Einkaufsliste ↔ Apple Erinnerungen (iPhone + Apple Watch).
// __KEY__ wird durch den persönlichen Einkaufs-Schlüssel ersetzt.
export const EINKAUF_SCRIPT = `// Familien-App · Einkauf ↔ Erinnerungen (für iPhone und Apple Watch)
// Gleicht die Einkaufsliste der Familien-App mit einer Liste in Apple Erinnerungen ab:
// – App → Erinnerungen: alles, was offen ist, erscheint in der Liste (auch auf der Watch)
// – Erinnerungen → App: Abgehaktes wird in der App erledigt, Neues (auch per Siri) kommt dazu
// Zuordnung über den Namen; in die Notizen wird nichts geschrieben.
const KEY = "__KEY__";
const API = "https://xihjjneyvtgnzfuibfzf.supabase.co/functions/v1/einkauf-sync?t=" + KEY;
const LIST = "__LIST__"; // Name der Liste in Erinnerungen
const norm = (s) => String(s || "").trim().toLowerCase();
// Alte Kennungen aus früheren Versionen („Kühlregale [fa:…]“) aus den Notizen entfernen
const OLD_TAG = /^.*\\[fa:[0-9a-f-]{36}\\]\\s*$/gm;

// Merkt sich, welche Einträge beim letzten Abgleich aus der App kamen – ohne Text in den Notizen
const fm = FileManager.local();
const stateFile = fm.joinPath(fm.documentsDirectory(), "familien-einkauf-state.json");
function loadState() {
  try { return fm.fileExists(stateFile) ? JSON.parse(fm.readString(stateFile)) : null; } catch (e) { return null; }
}

async function sync() {
  let cal = null;
  try { cal = await Calendar.forRemindersByTitle(LIST); } catch (e) { cal = null; }
  if (!cal) cal = await Calendar.createForReminders(LIST);

  const state = loadState();
  const prev = state && state.list === LIST ? state.items || {} : {}; // Name → ID beim letzten Abgleich
  let open = await Reminder.allIncomplete([cal]);

  // Aufräumen: alte Kennungen aus den Notizen löschen
  for (const r of [...open, ...(await Reminder.allCompleted([cal]))]) {
    if (r.notes && r.notes.includes("[fa:")) { r.notes = r.notes.replace(OLD_TAG, "").trim(); r.save(); }
  }

  const openNames = new Set(open.map((r) => norm(r.title)));
  // In Erinnerungen abgehakt oder gelöscht: war beim letzten Mal da, ist jetzt nicht mehr offen
  const erledigt = Object.entries(prev).filter(([n]) => !openNames.has(n)).map(([, id]) => id);
  // In Erinnerungen neu (auch per Siri): offen, aber beim letzten Mal nicht aus der App
  const neuRem = open.filter((r) => r.title && r.title.trim() && !(norm(r.title) in prev));

  const req = new Request(API);
  req.method = "POST";
  req.headers = { "Content-Type": "application/json" };
  req.body = JSON.stringify({ erledigt, neu: neuRem.map((r) => r.title.trim()) });
  req.timeoutInterval = 20;
  const res = await req.loadJSON();
  if (res.error) throw new Error(res.error);

  const app = new Map(res.offen.map((x) => [norm(x.name), x]));
  const sentNew = new Set(neuRem.map((r) => norm(r.title)));
  const seen = new Set();
  for (const r of open) {
    const n = norm(r.title);
    const fromApp = (n in prev) || sentNew.has(n);
    // In der App erledigt/gelöscht, aufgeteilt („Milch, Brot“) oder doppelt → hier entfernen
    if ((fromApp && !app.has(n)) || (app.has(n) && seen.has(n))) { r.remove(); continue; }
    seen.add(n);
  }
  // Was in der App offen ist, aber hier fehlt → anlegen (Reihenfolge wie im Laden)
  for (const x of res.offen) {
    if (seen.has(norm(x.name))) continue;
    const r = new Reminder();
    r.title = x.name;
    r.calendar = cal;
    r.save();
    seen.add(norm(x.name));
  }
  fm.writeString(stateFile, JSON.stringify({ list: LIST, items: Object.fromEntries([...app].map(([n, x]) => [n, x.id])), at: new Date().toISOString() }));
  return { liste: res.offen, erledigt: erledigt.length, neu: neuRem.length };
}

let liste = null, fehler = null, info = null;
try { info = await sync(); liste = info.liste; } catch (e) { fehler = String(e.message || e); }

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
else if (config.runsWithSiri || config.runsInActionExtension || args.shortcutParameter !== undefined) Script.setShortcutOutput(fehler ? "Fehler: " + fehler : "Einkauf abgeglichen: " + info.erledigt + " erledigt, " + info.neu + " neu, " + liste.length + " offen");
else {
  const a = new Alert();
  a.title = fehler ? "Abgleich ging nicht" : "Einkauf abgeglichen";
  a.message = fehler ? fehler : info.erledigt + " in der App erledigt · " + info.neu + " neu in die App · " + liste.length + " offen";
  a.addAction("OK");
  await a.present();
}
Script.complete();
`;
