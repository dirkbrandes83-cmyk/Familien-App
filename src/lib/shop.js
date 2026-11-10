// Einkaufsliste: Bereiche im Supermarkt, automatisch nach Stichwort.
export const SECTIONS = [
  { name: 'Obst & Gemüse', keys: ['banane', 'apfel', 'äpfel', 'birne', 'traube', 'orange', 'mandarine', 'zitrone', 'beere', 'paprika', 'zucchini', 'möhre', 'karotte', 'kartoffel', 'zwiebel', 'knoblauch', 'brokkoli', 'gurke', 'salat', 'tomate', 'pilz', 'champignon', 'lauch', 'kohl', 'avocado', 'obst', 'gemüse'] },
  { name: 'Brot & Backwaren', keys: ['brot', 'brötchen', 'toast', 'baguette', 'croissant', 'knäcke'] },
  { name: 'Kühlregal', keys: ['milch', 'joghurt', 'käse', 'feta', 'mozzarella', 'butter', 'eier', 'quark', 'sahne', 'schmand', 'frischkäse', 'hackfleisch', 'hähnchen', 'wurst', 'salami', 'schinken', 'aufschnitt', 'parmesan', 'pizzateig', 'tofu', 'lachs', 'fisch'] },
  { name: 'Tiefkühl', keys: ['tk', 'tiefkühl', 'fischstäbchen', 'eis', 'pommes', 'erbsen'] },
  { name: 'Getränke', keys: ['wasser', 'saft', 'sprudel', 'bier', 'wein', 'kaffee', 'tee', 'limo', 'cola'] },
  { name: 'Drogerie & Haushalt', keys: ['zahnpasta', 'zahnbürste', 'toilettenpapier', 'klopapier', 'küchenrolle', 'taschentücher', 'shampoo', 'duschgel', 'waschmittel', 'spülmittel', 'tabs', 'seife', 'creme', 'müllbeutel', 'windel', 'pflaster'] },
  { name: 'Vorrat', keys: [] },
];

export function sectionOf(name) {
  const words = name.toLowerCase().split(/[\s\-/]+/).filter(Boolean);
  // kurze Stichwörter nur am Wortanfang ("eis" ja, "Reis" nein), längere auch in Wortzusammensetzungen ("Vollmilch")
  const hit = (k) => words.some((w) => (k.length <= 3 ? w.startsWith(k) : w.includes(k)));
  for (const s of SECTIONS.slice(0, -1)) {
    if (s.keys.some(hit)) return s.name;
  }
  return 'Vorrat';
}

// "Milch, 2 Brot und Bananen" → ["Milch", "2 Brot", "Bananen"]
export function splitNames(text) {
  return text
    .split(/,|;|\n| und /i)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
}
