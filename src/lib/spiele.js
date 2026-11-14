// Werder-Heimspiele (Frauen und U23) – kommen täglich per Funktion „spiele“ in settings.spiele
import { slotOf } from './wochenplan.js';

export function heimspiele(settingsRows) {
  return settingsRows.find((r) => r.key === 'spiele')?.value?.spiele ?? [];
}
export const spielTitel = (s) => `${s.team} – ${s.gegner}`;
// Spiele an diesen Tagen; optional nur in einem Abschnitt (vormittag/nachmittag …)
export function spieleAn(spiele, days, slot) {
  return spiele.filter((s) => days.includes(s.datum) && (!slot || slotOf(s.zeit) === slot));
}
// Steht das Spiel schon im Kalender?
export const geplant = (events, s) => events.some((e) => e.start_date === s.datum && e.title.includes(spielTitel(s)));
