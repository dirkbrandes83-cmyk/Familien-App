// Vorlage für das Scriptable-Widget „Heute“. __KEY__ wird durch den Lese-Schlüssel ersetzt.
export const WIDGET_SCRIPT = `// Familien-App · Widget „Heute“
// Für die App „Scriptable“. Zeigt Termine, Müll, Einkauf und Einpacken – nur lesen.
const KEY = "__KEY__";
const API = "https://xihjjneyvtgnzfuibfzf.supabase.co/functions/v1/widget?t=" + KEY;

const fm = FileManager.local();
const cache = fm.joinPath(fm.cacheDirectory(), "familien-widget.json");
let d;
try {
  const r = new Request(API);
  r.timeoutInterval = 15;
  d = await r.loadJSON();
  if (d.error) throw new Error(d.error);
  fm.writeString(cache, JSON.stringify(d));
} catch (e) {
  d = fm.fileExists(cache) ? JSON.parse(fm.readString(cache)) : { error: String(e.message || e) };
  d.offline = true;
}

const fam = config.widgetFamily || "medium";
const max = fam === "small" ? 3 : fam === "large" ? 9 : 4;
const bg = Color.dynamic(new Color("#FBF8F3"), new Color("#1C1917"));
const ink = Color.dynamic(new Color("#1C1917"), new Color("#F5F5F4"));
const muted = Color.dynamic(new Color("#78716C"), new Color("#A8A29E"));
const teal = Color.dynamic(new Color("#0F766E"), new Color("#5EEAD4"));
const amber = new Color("#B45309");

const w = new ListWidget();
w.backgroundColor = bg;
w.setPadding(12, 14, 12, 14);
w.url = d.app || "https://home-5021881183.app-ionos.space/";
w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

function txt(stack, s, size, color, bold) {
  const t = stack.addText(String(s));
  t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size);
  t.textColor = color || ink;
  t.lineLimit = 1;
  return t;
}

if (d.error && !d.heute) {
  txt(w, "Familien-App", 14, ink, true);
  w.addSpacer(4);
  txt(w, d.error, 12, amber).lineLimit = 3;
} else {
// Kopfzeile
const head = w.addStack();
head.centerAlignContent();
txt(head, "Heute", fam === "small" ? 14 : 15, teal, true);
txt(head, "  " + d.datum, 12, muted);
head.addSpacer();
if (fam !== "small") {
  if (d.einkauf) txt(head, "🛒 " + d.einkauf + "  ", 12, ink, true);
  if (d.einpacken) txt(head, "🎒 " + d.einpacken, 12, ink, true);
}
w.addSpacer(6);

let n = 0;
function row(e) {
  const s = w.addStack();
  s.centerAlignContent();
  txt(s, e.time, fam === "small" ? 11 : 12, ink, true);
  s.addSpacer(fam === "small" ? 4 : 6);
  const title = txt(s, e.title, fam === "small" ? 11 : 13, ink);
  title.lineLimit = 1;
  if (fam !== "small") {
    s.addSpacer(6);
    for (const p of e.who.slice(0, 2)) {
      txt(s, p.name + " ", 10, new Color(p.color), true);
    }
  }
  s.addSpacer();
  if (fam === "large" && e.fahrt) { w.addSpacer(1); txt(w, "   🚗 " + e.fahrt, 10, muted); }
  w.addSpacer(3);
  n++;
}

if (!d.heute.length) { txt(w, "Heute nichts mehr geplant.", 12, muted); w.addSpacer(3); n++; }
for (const e of d.heute) { if (n >= max) break; row(e); }
if (n < max && d.morgen.length) {
  txt(w, "Morgen", 11, muted, true);
  w.addSpacer(2);
  for (const e of d.morgen) { if (n >= max) break; row(e); }
}

w.addSpacer();
// Fußzeile: Müll
if (d.muell) {
  const f = w.addStack();
  f.centerAlignContent();
  for (const b of d.muell.bins) {
    const dot = f.addText("● ");
    dot.font = Font.systemFont(11);
    dot.textColor = new Color(b.color);
  }
  txt(f, d.muell.text, 11, d.muell.text.startsWith("Heute Abend") ? amber : muted, true);
} else if (fam === "small" && (d.einkauf || d.einpacken)) {
  const f = w.addStack();
  if (d.einkauf) txt(f, "🛒 " + d.einkauf + "  ", 11, ink, true);
  if (d.einpacken) txt(f, "🎒 " + d.einpacken, 11, ink, true);
}
if (d.offline) txt(w, "offline · Stand " + (d.stand || ""), 9, muted);
}

if (config.runsInWidget) Script.setWidget(w);
else await w.presentMedium();
Script.complete();
`;
