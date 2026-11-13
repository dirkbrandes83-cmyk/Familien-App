// Stundenpläne der Kinder
import { addDays, weekday } from './dates.js';

export const DEFAULT_ZEITEN = [
  { von: '08:00', bis: '08:45' }, { von: '08:50', bis: '09:35' }, { von: '09:55', bis: '10:40' }, { von: '10:45', bis: '11:30' },
  { von: '11:50', bis: '12:35' }, { von: '12:40', bis: '13:25' }, { von: '13:35', bis: '14:20' }, { von: '14:25', bis: '15:10' },
];

// Farbe je Fach (Hintergrund hell, Text dunkel)
const FARBEN = {
  Deutsch: ['#FEE2E2', '#B91C1C'], Mathe: ['#DBEAFE', '#1D4ED8'], Englisch: ['#FEF3C7', '#B45309'],
  Sachunterricht: ['#DCFCE7', '#15803D'], Naturwissenschaften: ['#DCFCE7', '#15803D'], NaWi: ['#DCFCE7', '#15803D'], Gesellschaft: ['#FFEDD5', '#C2410C'], GuP: ['#FFEDD5', '#C2410C'],
  Französisch: ['#E0E7FF', '#4338CA'], Spanisch: ['#FCE7F3', '#BE185D'], Musik: ['#F3E8FF', '#7E22CE'],
  Kunst: ['#FAE8FF', '#A21CAF'], Religion: ['#F5F5F4', '#57534E'], Sport: ['#CCFBF1', '#0F766E'],
};
// Pausen/Betreuung blass, alles andere (AG, Lernzeit, Projekt …) neutral
const BLASS = /^(mittag|mittagessen|pause|mensa)/i;
const BETREUUNG = /betreuung/i;
export const fachFarbe = (f) => FARBEN[f] || (BLASS.test(f || '') ? ['#FAFAF9', '#A8A29E'] : BETREUUNG.test(f || '') ? ['#E0F2FE', '#0369A1'] : ['#F5F1EA', '#44403C']);

// Schultag für die Anzeige: Wochenende → nächster Montag
export function schoolDay(date) {
  const wd = weekday(date);
  return wd > 4 ? addDays(date, 7 - wd) : date;
}

// Stunden eines Tages: [{n, von, bis, fach}] – leere Stunden am Ende fallen weg, Lücken bleiben als Freistunde
export function lessonsFor(tt, date) {
  if (!tt) return [];
  const list = tt.tage?.[String(weekday(date))] || [];
  let last = list.length - 1;
  while (last >= 0 && !list[last]) last--;
  const zeiten = tt.zeiten?.length ? tt.zeiten : DEFAULT_ZEITEN;
  return list.slice(0, last + 1).map((fach, i) => ({ n: i + 1, von: zeiten[i]?.von || '', bis: zeiten[i]?.bis || '', fach: fach || '' }));
}

// Schultag? (Mo–Fr; Ferien kennt die App noch nicht)
export const istSchultag = (date) => weekday(date) <= 4;
// Nächster Schultag nach „date“ (Fr → Mo, Sa → Mo)
export const naechsterSchultag = (date) => schoolDay(addDays(date, 1));
// „morgen“ oder Wochentag, je nach Abstand
export function tagName(heute, date) {
  if (date === heute) return 'Heute';
  if (date === addDays(heute, 1)) return 'Morgen';
  return ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'][weekday(date)];
}
