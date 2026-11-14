// Kleiner iCalendar-Leser (.ics) für den Klender-Umzug.
// Liefert Termine im Format der Tabelle events plus "groups": die Personen-/
// Kalendernamen aus der Datei (CATEGORIES, X-WR-CALNAME, ORGANIZER/ATTENDEE-Namen),
// die beim Import einer Person der Familie zugeordnet werden.
import { iso, addDays, weekday, diffDays } from './dates.js';


function unfold(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '');
}
function unescape(v) {
  return v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();
}
function parseLine(line) {
  const i = line.indexOf(':');
  if (i < 0) return null;
  const head = line.slice(0, i);
  const value = line.slice(i + 1);
  const [name, ...ps] = head.split(';');
  const params = {};
  for (const p of ps) {
    const j = p.indexOf('=');
    if (j > 0) params[p.slice(0, j).toUpperCase()] = p.slice(j + 1).replace(/^"|"$/g, '');
  }
  return { name: name.toUpperCase(), params, value };
}

// "20261110T190000Z" | "20261110T190000" | "20261110" → { date, time|null }
export function parseDate(value, params = {}) {
  const v = value.trim();
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v);
  if (!m) return null;
  const [, y, mo, d, h, mi, , z] = m;
  if (!h || params.VALUE === 'DATE') return { date: `${y}-${mo}-${d}`, time: null };
  if (z) {
    // UTC → Bremer Ortszeit (auch auf dem Server, der in UTC läuft)
    const t = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi));
    const p = Object.fromEntries(BERLIN.formatToParts(t).map((x) => [x.type, x.value]));
    const hh = p.hour === '24' ? '00' : p.hour;
    return { date: `${p.year}-${p.month}-${p.day}`, time: `${hh}:${p.minute}` };
  }
  return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}` };
}

const BERLIN = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });

const BYDAY = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 };

function parseRrule(v) {
  const r = {};
  for (const part of v.split(';')) {
    const [k, val] = part.split('=');
    if (k) r[k.toUpperCase()] = val;
  }
  return r;
}

function repOf(r) {
  const n = Number(r.INTERVAL || 1);
  if (r.FREQ === 'DAILY' && n === 1) return 'täglich';
  if (r.FREQ === 'WEEKLY' && n === 1) return 'wöchentlich';
  if (r.FREQ === 'WEEKLY' && n === 2) return 'alle 2 Wochen';
  if (r.FREQ === 'MONTHLY' && n === 1 && !r.BYDAY) return 'monatlich';
  if (r.FREQ === 'YEARLY' && n === 1) return 'jährlich';
  return null; // nicht abbildbar
}

function nameOf(param) {
  if (!param) return null;
  const m = /CN=([^;:]+)/i.exec(param);
  return m ? m[1].replace(/^"|"$/g, '').trim() : null;
}

export function parseIcs(text) {
  const lines = unfold(text).split('\n');
  const out = [];
  const warnings = [];
  let calName = null;
  let cur = null;
  for (const raw of lines) {
    const line = parseLine(raw);
    if (!line) continue;
    if (line.name === 'BEGIN' && line.value.trim() === 'VEVENT') { cur = { ex: [], groups: [] }; continue; }
    if (line.name === 'END' && line.value.trim() === 'VEVENT') { if (cur) out.push(cur); cur = null; continue; }
    if (!cur) {
      if (line.name === 'X-WR-CALNAME') calName = unescape(line.value);
      continue;
    }
    switch (line.name) {
      case 'UID': cur.uid = line.value.trim(); break;
      case 'SUMMARY': cur.title = unescape(line.value); break;
      case 'DESCRIPTION': cur.note = unescape(line.value); break;
      case 'LOCATION': cur.location = unescape(line.value); break;
      case 'DTSTART': cur.start = parseDate(line.value, line.params); break;
      case 'DTEND': cur.end = parseDate(line.value, line.params); break;
      case 'RRULE': cur.rrule = parseRrule(line.value); break;
      case 'EXDATE':
        for (const v of line.value.split(',')) { const d = parseDate(v, line.params); if (d) cur.ex.push(d.date); }
        break;
      case 'CATEGORIES':
        for (const c of line.value.split(',')) if (c.trim()) cur.groups.push(unescape(c));
        break;
      case 'ATTENDEE': { const n = nameOf(raw.slice(0, raw.indexOf(':'))); if (n) cur.groups.push(n); break; }
      case 'STATUS': cur.status = line.value.trim().toUpperCase(); break;
      default: break;
    }
  }

  const events = [];
  for (const e of out) {
    if (!e.start || !e.title) continue;
    if (e.status === 'CANCELLED') continue;
    const allDay = e.start.time === null;
    let endDate = null;
    if (e.end) {
      // Ganztägig: DTEND ist der Tag NACH dem letzten Tag
      const last = allDay ? addDays(e.end.date, -1) : e.end.date;
      if (last > e.start.date) endDate = last;
    }
    const groups = [...new Set([...(e.groups || []), ...(calName ? [calName] : [])])];
    const base = {
      title: e.title.slice(0, 200),
      kind: 'termin',
      start_date: e.start.date,
      end_date: endDate,
      all_day: allDay,
      from_time: allDay ? null : e.start.time,
      to_time: allDay || !e.end || e.end.time === null || endDate ? null : e.end.time,
      rep: 'keine',
      rep_until: null,
      exdates: e.ex,
      note: [e.location, e.note].filter(Boolean).join(' · ').slice(0, 1000),
      src: 'klender',
      ext_uid: e.uid || null,
      groups,
    };
    if (e.rrule) {
      const rep = repOf(e.rrule);
      if (!rep) {
        warnings.push(`„${e.title}“: Wiederholung (${e.rrule.FREQ || '?'}) nicht übernommen – nur der erste Termin.`);
      } else {
        base.rep = rep;
        // Geburtstag: ganztägig und jährlich (Klender trägt nur den Namen ein) oder „Geburtstag“ im Titel
        if (rep === 'jährlich' && (/geburtstag/i.test(e.title) || (base.all_day && !/(hochzeit|jahrestag|todestag|weihnacht|silvester|feiertag)/i.test(e.title)))) base.kind = 'geburtstag';
        if (e.rrule.UNTIL) base.rep_until = parseDate(e.rrule.UNTIL)?.date ?? null;
        if (e.rrule.COUNT) {
          const c = Number(e.rrule.COUNT) - 1;
          const step = { 'täglich': 1, 'wöchentlich': 7, 'alle 2 Wochen': 14 }[rep];
          if (step) base.rep_until = addDays(base.start_date, c * step);
          else if (rep === 'monatlich') { const d = new Date(base.start_date); d.setMonth(d.getMonth() + c); base.rep_until = iso(d); }
          else if (rep === 'jährlich') base.rep_until = `${Number(base.start_date.slice(0, 4)) + c}${base.start_date.slice(4)}`;
        }
        // Wöchentlich an mehreren Tagen (BYDAY=MO,WE) → ein Termin pro Wochentag
        const days = e.rrule.FREQ === 'WEEKLY' && e.rrule.BYDAY ? e.rrule.BYDAY.split(',').map((x) => BYDAY[x.slice(-2)]).filter((x) => x !== undefined) : [];
        if (days.length > 1 || (days.length === 1 && days[0] !== weekday(base.start_date))) {
          for (const wd of days) {
            const shift = (wd - weekday(base.start_date) + 7) % 7;
            events.push({ ...base, start_date: addDays(base.start_date, shift), ext_uid: base.ext_uid ? `${base.ext_uid}#${wd}` : null });
          }
          continue;
        }
      }
    }
    events.push(base);
  }
  return { events, warnings, calName };
}

// Liegt der Termin (oder eine Wiederholung) ab "from" noch an?
export function isCurrent(ev, from) {
  if (ev.rep === 'keine') return (ev.end_date || ev.start_date) >= from;
  return !ev.rep_until || ev.rep_until >= from;
}

export { diffDays };
