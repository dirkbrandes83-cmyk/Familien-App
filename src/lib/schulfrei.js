// Schulfreie Tage in Bremen: Schulferien und gesetzliche Feiertage.
// Ferien laut Bremer Ferienverordnung (Gesetzblatt Nr. 142 vom 14.12.2022); jeweils erster und letzter Ferientag.
import { addDays, iso, parse, weekday } from './dates.js';

export const FERIEN = [
  ['2026-10-12', '2026-10-24', 'Herbstferien'],
  ['2026-12-23', '2027-01-09', 'Weihnachtsferien'],
  ['2027-02-01', '2027-02-02', 'Halbjahresferien'],
  ['2027-03-22', '2027-04-03', 'Osterferien'],
  ['2027-05-07', '2027-05-07', 'Brückentag nach Himmelfahrt'],
  ['2027-05-18', '2027-05-18', 'Pfingstferien'],
  ['2027-07-08', '2027-08-18', 'Sommerferien'],
  ['2027-10-18', '2027-10-30', 'Herbstferien'],
  ['2027-12-23', '2028-01-08', 'Weihnachtsferien'],
  ['2028-01-31', '2028-02-01', 'Halbjahresferien'],
  ['2028-04-10', '2028-04-22', 'Osterferien'],
  ['2028-05-26', '2028-05-26', 'Brückentag nach Himmelfahrt'],
  ['2028-06-06', '2028-06-06', 'Pfingstferien'],
  ['2028-07-20', '2028-08-30', 'Sommerferien'],
];

// Ostersonntag (Gauß/Meeus)
function ostern(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(new Date(y, month - 1, day, 12));
}

// Gesetzliche Feiertage in Bremen
export function feiertage(y) {
  const o = ostern(y);
  return {
    [`${y}-01-01`]: 'Neujahr', [addDays(o, -2)]: 'Karfreitag', [addDays(o, 1)]: 'Ostermontag', [`${y}-05-01`]: 'Tag der Arbeit',
    [addDays(o, 39)]: 'Christi Himmelfahrt', [addDays(o, 50)]: 'Pfingstmontag', [`${y}-10-03`]: 'Tag der Deutschen Einheit',
    [`${y}-10-31`]: 'Reformationstag', [`${y}-12-25`]: '1. Weihnachtstag', [`${y}-12-26`]: '2. Weihnachtstag',
  };
}

// Warum ist an diesem Tag keine Schule? → Name oder null (Wochenende zählt hier nicht)
export function schulfrei(date) {
  const f = FERIEN.find(([von, bis]) => date >= von && date <= bis);
  if (f) return f[2];
  return feiertage(parse(date).getFullYear())[date] ?? null;
}

export const istSchultag = (date) => weekday(date) <= 4 && !schulfrei(date);
