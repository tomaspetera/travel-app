// Práce s daty ve formátu YYYY-MM-DD (počítáno v UTC, aby nevadilo časové pásmo serveru).

const pad = (n) => String(n).padStart(2, '0');

export function ymd(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function parseYmd(s) {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function isYmd(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(parseYmd(s).getTime());
}

export function todayYmd() {
  const n = new Date();
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
}

export function addDays(s, n) {
  const d = parseYmd(s);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
}

export function daysBetween(a, b) {
  return Math.round((parseYmd(b) - parseYmd(a)) / 864e5);
}

/** 0 = neděle … 6 = sobota */
export function weekday(s) {
  return parseYmd(s).getUTCDay();
}

export function lastDayOfMonth(s) {
  const d = parseYmd(s);
  return ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

/** První dny všech měsíců, které zasahují do intervalu [from, to]. */
export function monthsInRange(from, to) {
  const out = [];
  const d = parseYmd(from);
  d.setUTCDate(1);
  const end = parseYmd(to);
  while (d <= end) {
    out.push(ymd(d));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

/** Rozdělí interval na okna o max. délce maxDays dní. */
export function chunkRange(from, to, maxDays) {
  const out = [];
  let a = from;
  while (daysBetween(a, to) >= 0) {
    const b = daysBetween(a, to) + 1 > maxDays ? addDays(a, maxDays - 1) : to;
    out.push([a, b]);
    a = addDays(b, 1);
  }
  return out;
}

export function clampRange(from, to) {
  const t = todayYmd();
  const f = !isYmd(from) || from < t ? t : from;
  const maxTo = addDays(t, 360);
  let e = !isYmd(to) ? addDays(f, 30) : to;
  if (e < f) e = f;
  if (e > maxTo) e = maxTo;
  return [f, e];
}

// --- časová pásma (délka letu z lokálních časů odletu a příletu) ---

function tzOffsetMin(tz, utcMs) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return (asUtc - utcMs) / 60000;
}

export function localToUtcMs(localIso, tz) {
  const guess = Date.parse(String(localIso).slice(0, 19) + 'Z');
  if (Number.isNaN(guess)) return null;
  if (!tz) return guess;
  try {
    return guess - tzOffsetMin(tz, guess) * 60000;
  } catch {
    return guess;
  }
}

export function flightMinutes(depLocal, depTz, arrLocal, arrTz) {
  if (!depLocal || !arrLocal) return null;
  const a = localToUtcMs(depLocal, depTz);
  const b = localToUtcMs(arrLocal, arrTz);
  if (a == null || b == null) return null;
  const m = Math.round((b - a) / 60000);
  return m > 0 && m < 48 * 60 ? m : null;
}
