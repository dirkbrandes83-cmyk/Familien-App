// Einkaufsliste: Kategorien wie in der bisherigen Liste der Familie.
// Zuordnung nach Stichwort; was einmal von Hand umsortiert wurde, merkt sich die App (learned).
export const SECTIONS = [
  { name: 'Obst und Gemüse', keys: ['banane', 'apfel', 'äpfel', 'birne', 'traube', 'orange', 'mandarine', 'clementine', 'zitrone', 'beere', 'kiwi', 'melone', 'paprika', 'zucchini', 'möhre', 'karotte', 'kartoffel', 'zwiebel', 'knoblauch', 'brokkoli', 'gurke', 'salat', 'tomate', 'pilz', 'champignon', 'lauch', 'kohl', 'avocado', 'spinat', 'kräuter', 'petersilie', 'ingwer', 'obst', 'gemüse'] },
  { name: 'Kühlregale', keys: ['milch', 'joghurt', 'käse', 'feta', 'mozzarella', 'butter', 'eier', 'quark', 'sahne', 'schmand', 'frischkäse', 'hackfleisch', 'hähnchen', 'fleisch', 'wurst', 'salami', 'schinken', 'aufschnitt', 'parmesan', 'pizzateig', 'tofu', 'lachs', 'fisch', 'margarine', 'pudding', 'saft'] },
  { name: 'Backwaren, Müsli etc.', keys: ['brot', 'brötchen', 'toast', 'baguette', 'croissant', 'knäcke', 'müsli', 'haferflocken', 'cornflakes', 'flakes', 'zwieback', 'aufbackbrötchen'] },
  { name: 'TK', keys: ['tk', 'tiefkühl', 'fischstäbchen', 'eis', 'pommes', 'erbsen', 'spinat tk', 'pizza tk'] },
  { name: 'Süßes', keys: ['schoko', 'kekse', 'keks', 'gummi', 'bonbon', 'chips', 'nutella', 'süßigkeit', 'kuchen', 'waffel', 'riegel', 'popcorn', 'salzstangen', 'lakritz'] },
  { name: 'Rossmann DM', keys: ['zahnpasta', 'zahnbürste', 'toilettenpapier', 'klopapier', 'küchenrolle', 'taschentücher', 'shampoo', 'duschgel', 'waschmittel', 'spülmittel', 'spülmaschinentabs', 'tabs', 'seife', 'creme', 'sonnencreme', 'deo', 'müllbeutel', 'windel', 'pflaster', 'wattepads', 'rasier'] },
  { name: 'Konserven etc.', keys: [] }, // alles andere: Nudeln, Reis, Dosen, Mehl, Öl, Kaffee …
];
export const DEFAULT_SECTION = 'Konserven etc.';
// Reihenfolge wie im Laden bzw. in der bisherigen Liste
export const ORDER = ['Obst und Gemüse', 'Kühlregale', 'Backwaren, Müsli etc.', 'Konserven etc.', 'TK', 'Süßes', 'Rossmann DM'];

export function sectionOf(name, learned = null) {
  const key = name.trim().toLowerCase();
  if (learned) {
    const hit = learned instanceof Map ? learned.get(key) : learned[key];
    if (hit) return hit;
  }
  const words = key.split(/[\s\-/]+/).filter(Boolean);
  // kurze Stichwörter nur am Wortanfang ("eis" ja, "Reis" nein), längere auch in Zusammensetzungen ("Vollmilch")
  const match = (k) => words.some((w) => (k.length <= 3 ? w.startsWith(k) : w.includes(k)));
  for (const s of SECTIONS.slice(0, -1)) {
    if (s.keys.some(match)) return s.name;
  }
  return DEFAULT_SECTION;
}

// "Milch, 2 Brot und Bananen" → ["Milch", "2 Brot", "Bananen"]
export function splitNames(text) {
  return text
    .split(/,|;|\n| und /i)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
}
