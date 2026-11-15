// Dauerkarten (2 Plätze) – geteilt zwischen Catrin & Dirk („wir“) und Eika & Jan („die“).
// Jede Seite kann einen Wunsch eintragen, die andere bestätigt ihn. Wird auch in der Funktion „dauerkarten“ benutzt.

export const KAT = {
  wir: 'Catrin & Dirk',
  die: 'Eika & Jan',
  wir_weiter: 'von Catrin & Dirk weitergegeben',
  die_weiter: 'von Eika & Jan weitergegeben',
  boerse: 'Ticketbörse',
};
export const SEITE = { wir: 'Catrin & Dirk', die: 'Eika & Jan' };
export const andere = (seite) => (seite === 'wir' ? 'die' : 'wir');
// Wem wird das Spiel angerechnet (Kosten)? Ticketbörse-Spiele zählen für Eika & Jan.
export const partei = (k) => (k === 'wir' || k === 'wir_weiter' ? 'wir' : k === 'die' || k === 'die_weiter' || k === 'boerse' ? 'die' : null);
// Werder-Regel (ATGB 2026/27): höchstens 5 Spiele pro Saison in die Ticketbörse
export const BOERSE_MAX = 5;

// Einschätzung jeder Seite pro Spiel
export const PRAEF = {
  favorit: { label: 'Favorit', text: 'würden gerne hingehen', icon: 'star' },
  option: { label: 'Option', text: 'hätten Zeit und würden gehen', icon: 'check' },
  absage: { label: 'Absage', text: 'können/wollen nicht', icon: 'x' },
};
// Hinweis aus beiden Einschätzungen
export function praefHinweis(praef = {}) {
  const w = praef.wir, d = praef.die;
  if (w === 'absage' && d === 'absage') return 'Beide sagen ab – weitergeben oder Ticketbörse?';
  if (w === 'favorit' && d === 'favorit') return 'Beide haben es als Favorit – bitte absprechen';
  if (w === 'favorit' && d !== 'favorit') return 'Vorschlag: Catrin & Dirk gehen';
  if (d === 'favorit' && w !== 'favorit') return 'Vorschlag: Eika & Jan gehen';
  if (w === 'option' && d === 'absage') return 'Vorschlag: Catrin & Dirk gehen';
  if (d === 'option' && w === 'absage') return 'Vorschlag: Eika & Jan gehen';
  return null;
}

export function boerseZahl(spiele) {
  return spiele.filter((s) => s.zuteilung === 'boerse' || (s.wunsch === 'boerse' && s.zuteilung !== 'boerse')).length;
}

// Was kann gewählt werden? Alle Kategorien (Ticketbörse nur bis zum Limit)
export function vorschlaege(seite, spiele, s) {
  const out = ['wir', 'wir_weiter', 'die', 'die_weiter'];
  if (s.zuteilung === 'boerse' || boerseZahl(spiele) < BOERSE_MAX) out.push('boerse');
  return out;
}

// Änderung für eine Aktion. Gibt { patch } oder { fehler } zurück.
export function aktion(seite, spiele, s, was, kat, text) {
  if (was === 'wunsch' || was === 'festlegen') {
    if (!KAT[kat]) return { fehler: 'Unbekannte Kategorie' };
    if (kat === 'boerse' && s.zuteilung !== 'boerse' && boerseZahl(spiele.filter((x) => x.id !== s.id)) >= BOERSE_MAX) return { fehler: `Ticketbörse ist nur ${BOERSE_MAX}× pro Saison erlaubt` };
    // festlegen: ohne Rückfrage (z. B. wenn es schon abgesprochen ist)
    return { patch: was === 'festlegen' ? { zuteilung: kat, wunsch: null, wunsch_von: null } : { wunsch: kat, wunsch_von: seite } };
  }
  if (was === 'praef') {
    // Eigene Einschätzung: Favorit / Option / Absage – nochmal tippen nimmt sie zurück
    if (kat && !PRAEF[kat]) return { fehler: 'Unbekannte Einschätzung' };
    const p = { ...(s.praef || {}) };
    if (!kat || p[seite] === kat) { delete p[seite]; delete p[`${seite}_text`]; } else p[seite] = kat;
    return { patch: { praef: p } };
  }
  if (was === 'praeftext') {
    // kurzer Kommentar zur eigenen Einschätzung, z. B. „nur wenn Emil mitkann“
    const p = { ...(s.praef || {}) };
    const n = String(text ?? '').trim().slice(0, 80);
    if (n) p[`${seite}_text`] = n; else delete p[`${seite}_text`];
    return { patch: { praef: p } };
  }
  if (was === 'notiz') {
    const n = String(text ?? '').trim().slice(0, 300);
    return { patch: { notiz: n || null } };
  }
  if (was === 'zurueck') {
    if (s.wunsch_von !== seite) return { fehler: 'Nur der eigene Wunsch kann zurückgezogen werden' };
    return { patch: { wunsch: null, wunsch_von: null } };
  }
  if (was === 'bestaetigen') {
    if (!s.wunsch || s.wunsch_von === seite) return { fehler: 'Nichts zu bestätigen' };
    return { patch: { zuteilung: s.wunsch, wunsch: null, wunsch_von: null } };
  }
  if (was === 'ablehnen') {
    if (!s.wunsch || s.wunsch_von === seite) return { fehler: 'Nichts abzulehnen' };
    return { patch: { wunsch: null, wunsch_von: null } };
  }
  return { fehler: 'Unbekannte Aktion' };
}

// Kosten: Gesamtpreis geteilt durch alle Heimspiele der Saison; noch offene Spiele werden extra ausgewiesen.
// Ticketbörse-Spiele zahlen Eika & Jan.
export function kosten(spiele, preis) {
  const zahl = { wir: 0, die: 0, boerse: 0, offen: 0 };
  for (const s of spiele) {
    if (s.zuteilung === 'boerse') zahl.boerse++;
    const p = partei(s.zuteilung);
    if (p) zahl[p]++;
    else zahl.offen++;
  }
  const zugewiesen = zahl.wir + zahl.die;
  const proSpiel = spiele.length && preis ? preis / spiele.length : 0;
  return { ...zahl, zugewiesen, gesamt: spiele.length, proSpiel, wir_eur: proSpiel * zahl.wir, die_eur: proSpiel * zahl.die, offen_eur: proSpiel * zahl.offen };
}

export const euro = (n) => `${(Math.round(n * 100) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

// Wunsch in Worten, z. B. „Eika & Jan möchten selbst gehen“
export function wunschText(von, kat) {
  const a = andere(von);
  if (kat === von) return `${SEITE[von]} möchten selbst gehen`;
  if (kat === `${von}_weiter`) return `${SEITE[von]} möchten ihre Karten weitergeben`;
  if (kat === a) return `${SEITE[von]} schlagen vor: ${SEITE[a]} gehen`;
  if (kat === `${a}_weiter`) return `${SEITE[von]} schlagen vor: ${SEITE[a]} geben die Karten weiter`;
  return `${SEITE[von]} möchten die Karten in die Ticketbörse geben`;
}
