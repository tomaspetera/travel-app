/* ATLAS – export do kalendáře (iCalendar, RFC 5545) a odkaz „Přidat do Google Kalendáře“.
   Událost: { title, start, end?, tz?, endTz?, durationMin?, description?, location?, url?, uid? }
   start/end 'YYYY-MM-DD' = celodenní (end = poslední den včetně),
   'YYYY-MM-DDTHH:MM' = místní čas v IANA zóně tz (end v endTz) → v souboru UTC; bez platné zóny plovoucí čas. */
(function () {
  const isYmd = s => { if (typeof s !== 'string' || !/^(19|20|21)\d\d-\d{2}-\d{2}$/.test(s)) return false; const d = new Date(s + 'T00:00:00Z'); return !isNaN(d) && d.toISOString().slice(0, 10) === s; };
  const isLocal = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d/.test(s) && isYmd(s.slice(0, 10));
  const wallMs = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16));
  const ymdPlus = (ymd, n) => new Date(Date.parse(ymd + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const stampUtc = ms => new Date(ms).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const stampWall = ms => stampUtc(ms).slice(0, 15);
  const httpUrl = u => /^https?:\/\/[^\s\x00-\x1f\x7f]+$/i.test(String(u ?? '').trim()) ? String(u).trim() : '';

  /* ---------- časové zóny ---------- */
  const fmts = new Map();
  function zoneFmt(tz) {
    if (typeof tz !== 'string' || tz.length > 40 || !/^[A-Za-z][\w+-]*(\/[\w+-]+){0,2}$/.test(tz)) return null;
    if (!fmts.has(tz)) {
      let f = null;
      try {
        f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      } catch { /* neznámá zóna */ }
      fmts.set(tz, f);
    }
    return fmts.get(tz);
  }

  /** Posun zóny tz proti UTC v minutách v okamžiku utcMs (Praha v zimě 60, v létě 120); neznámá zóna → null. */
  function tzOffset(tz, utcMs) {
    const f = zoneFmt(tz);
    if (!f) return null;
    const t = Math.floor(utcMs / 1000) * 1000;
    const p = {};
    for (const x of f.formatToParts(new Date(t))) p[x.type] = x.value;
    return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - t) / 60000);
  }

  /**
   * Místní čas 'YYYY-MM-DDTHH:MM' v zóně tz → UTC milisekundy (null pro neznámou zónu).
   * Jako RFC 5545: čas, který při změně na zimní čas nastane dvakrát, je ten první;
   * čas, který při změně na letní neexistuje, se počítá s posunem před změnou.
   */
  function localToUtc(local, tz) {
    if (!isLocal(local)) return null;
    const wall = wallMs(local);
    const before = tzOffset(tz, wall - 864e5);
    if (before == null) return null;
    const after = tzOffset(tz, wall + 864e5);
    const hits = [before, after].filter(off => tzOffset(tz, wall - off * 60000) === off).map(off => wall - off * 60000);
    return hits.length ? Math.min(...hits) : wall - before * 60000;
  }

  /* ---------- text ---------- */
  // Jen dobře utvořený Unicode (osamocené surrogaty pryč), bez řídicích znaků kromě tabulátoru a konce řádku.
  const plain = s => String(s ?? '').normalize('NFC')
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g, m => m.length === 2 ? m : '')
    .replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
  // Zkrátit před čištěním – rozpůlený emoji (surrogate pár) plain() odstraní.
  const cut = (s, n) => plain(String(s ?? '').slice(0, n));
  /** Hodnota TEXT (RFC 5545 3.3.11): \ ; , a konce řádků escapovat. */
  const escText = s => plain(s).replace(/[\\;,]/g, c => '\\' + c).replace(/\n/g, '\\n');

  /** Zalomení řádku po 75 oktetech (UTF-8); vícebajtový znak se nikdy nerozdělí, pokračování začíná mezerou. */
  function fold(line) {
    let out = '', bytes = 0;
    for (const ch of line) {
      const cp = ch.codePointAt(0);
      const n = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
      if (bytes + n > 75) { out += '\r\n '; bytes = 1; }
      out += ch; bytes += n;
    }
    return out;
  }

  // Stabilní UID (FNV-1a) – opakovaný import stejné cesty událost aktualizuje, nezdvojí.
  function hash(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36);
  }

  /* ---------- události ---------- */
  /** Událost → { dtStart, dtEnd, allDay, … } s hodnotami pro ICS, nebo null, když nemá platný začátek. */
  function prepare(e) {
    if (!e || typeof e !== 'object') return null;
    const base = {
      title: cut(e.title, 250).replace(/\s*\n\s*/g, ' ').trim() || 'Událost',
      description: cut(e.description, 6000).trim(),
      location: cut(e.location, 300).replace(/\s*\n\s*/g, ', ').trim(),
      url: httpUrl(e.url).length <= 4000 ? httpUrl(e.url) : '',
      uid: typeof e.uid === 'string' && /^[\w.@-]{1,120}$/.test(e.uid) ? e.uid : '',
    };
    if (isYmd(e.start)) {
      const last = isYmd(e.end) && e.end > e.start ? e.end : e.start;
      return { ...base, allDay: true, key: e.start, dtStart: e.start.replace(/-/g, ''), dtEnd: ymdPlus(last, 1).replace(/-/g, '') };
    }
    if (!isLocal(e.start)) return null;
    const dur = Math.min(7 * 1440, Math.max(1, Math.round(Number(e.durationMin)) || 60)) * 60000;
    const start = localToUtc(e.start, e.tz);
    if (start != null) {
      let end = isLocal(e.end) ? localToUtc(e.end, e.endTz || e.tz) : null;
      if (end == null || end <= start) end = start + dur;
      return { ...base, allDay: false, key: e.start.slice(0, 16), dtStart: stampUtc(start), dtEnd: stampUtc(end) };
    }
    // Zóna neznámá → plovoucí místní čas (kalendář ho zobrazí tak, jak je napsaný).
    const ws = wallMs(e.start);
    let we = isLocal(e.end) && (!e.endTz || e.endTz === e.tz) ? wallMs(e.end) : null;
    if (we == null || we <= ws) we = ws + dur;
    return { ...base, allDay: false, floating: true, key: e.start.slice(0, 16), dtStart: stampWall(ws), dtEnd: stampWall(we) };
  }

  const withUrl = ev => ev.url && !ev.description.includes(ev.url) ? [ev.description, ev.url].filter(Boolean).join('\n\n') : ev.description;

  /**
   * Text souboru .ics (RFC 5545, CRLF, řádky zalomené po 75 oktetech).
   * opts: { name – název kalendáře, now – čas pro DTSTAMP (ms) }
   */
  function build(events, opts = {}) {
    const host = typeof location !== 'undefined' && /^[\w.-]+$/.test(location.hostname || '') ? location.hostname : 'atlas';
    const stamp = stampUtc(Number.isFinite(opts.now) ? opts.now : Date.now());
    const name = cut(opts.name, 120).replace(/\s*\n\s*/g, ' ').trim();
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ATLAS//Cestovni planovac//CS', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    if (name) lines.push('X-WR-CALNAME:' + escText(name));
    const used = new Set();
    for (const ev of (Array.isArray(events) ? events : []).map(prepare).filter(Boolean)) {
      const uid0 = ev.uid || `${hash(`${name}|${ev.key}|${ev.title}`)}@${host}`;
      let uid = uid0;
      for (let n = 2; used.has(uid); n++) uid = `${uid0}-${n}`;
      used.add(uid);
      const desc = withUrl(ev);
      lines.push('BEGIN:VEVENT', 'UID:' + uid, 'DTSTAMP:' + stamp,
        ev.allDay ? 'DTSTART;VALUE=DATE:' + ev.dtStart : 'DTSTART:' + ev.dtStart,
        ev.allDay ? 'DTEND;VALUE=DATE:' + ev.dtEnd : 'DTEND:' + ev.dtEnd,
        'SUMMARY:' + escText(ev.title));
      if (desc) lines.push('DESCRIPTION:' + escText(desc));
      if (ev.location) lines.push('LOCATION:' + escText(ev.location));
      if (ev.url) lines.push('URL:' + ev.url);
      // Celodenní bloky (pobyt, den programu) neblokují čas v kalendáři.
      if (ev.allDay) lines.push('TRANSP:TRANSPARENT');
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  /** Stáhne .ics s událostmi; vrací text souboru. */
  function download(filename, events, opts = {}) {
    const text = build(events, opts);
    const base = String(filename || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\.ics$/i, '')
      .replace(/[^\w.-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 80) || 'atlas';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
    a.download = base + '.ics';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    return text;
  }

  /** Odkaz „Přidat do Google Kalendáře“ pro jednu událost (null, když nemá platný začátek). */
  function gcalUrl(e) {
    const ev = prepare(e);
    if (!ev) return null;
    const qs = new URLSearchParams({ action: 'TEMPLATE', text: ev.title, dates: `${ev.dtStart}/${ev.dtEnd}` });
    const details = cut(withUrl(ev), 1500);
    if (details) qs.set('details', details);
    if (ev.location) qs.set('location', ev.location);
    return 'https://calendar.google.com/calendar/render?' + qs;
  }

  /**
   * Let jako událost: { from, to, date, dep, arr?, arrEst?, arrUnknown?, fromTz?, toTz?, carrier?, flightNo?, durationMin? }
   * dep/arr jsou místní časy letišť; bez času odletu (dep null) celodenní událost v den letu.
   */
  function flightEvent(l, { url, note } = {}) {
    const who = [l.carrier, l.flightNo].filter(Boolean).join(' ');
    const hm = s => s.slice(11, 16);
    const timed = isLocal(l.dep);
    const lines = timed
      ? [`Odlet ${hm(l.dep)} místního času (${l.from})`, isLocal(l.arr) ? `Přílet ${l.arrEst ? '~' : ''}${hm(l.arr)} místního času (${l.to})${l.arrEst ? ' – odhad' : ''}`
        // let s přestupem z cache bez věrohodné délky: konec události je jen orientační
        : l.arrUnknown ? 'Přílet neznámý (let s přestupem z cache) – čas příletu ověř v rezervaci.' : '']
      : ['Čas odletu ověř u aerolinky.'];
    const ev = {
      title: `✈️ ${l.from} → ${l.to}${who ? ' · ' + who : ''}`,
      description: [...lines, note || ''].filter(Boolean).join('\n'),
      location: `Letiště ${l.from}`,
      url,
    };
    // Přílet je v zóně cíle: bez obou zón ho nejde porovnat s odletem → raději délka letu (je-li známá).
    const useArr = isLocal(l.arr) && (l.fromTz && l.toTz || !l.fromTz && !l.toTz && !l.durationMin);
    return timed
      ? { ...ev, start: l.dep.slice(0, 16), tz: l.fromTz, end: useArr ? l.arr.slice(0, 16) : null, endTz: l.toTz, durationMin: l.durationMin || 120 }
      : { ...ev, start: isYmd(l.date) ? l.date : String(l.dep || '').slice(0, 10) };
  }

  // Online check-in u Ryanairu a Wizz Air (ověřeno 10. 10. 2026, help.ryanair.com / wizzair.com): bez koupené místenky se
  // otevírá 24 h před odletem; Ryanair ho zavírá 2 h před odletem a za odbavení na letišti účtuje 55 € za let a osobu
  // (z Rakouska 40 €, ze Španělska 30 €), Wizz Air zavírá 3 h před odletem a na letišti si řekne zhruba 40–50 €.
  const RY = ['Ryanair', 2, '55 €'], WZ = ['Wizz Air', 3, '40–50 €'];
  const CHECKIN = { FR: RY, RK: RY, AL: RY, RR: RY, W6: WZ, W4: WZ, W9: WZ, '5W': WZ };
  /**
   * Let Ryanairu nebo Wizz Air s časem odletu → { airline, closeH, fee, open } (open = místní čas otevření online
   * check-inu, 24 h před odletem), jinak null. carrier = kód (FR, W6…) nebo název dopravce.
   */
  function checkin(l) {
    const who = String((l && l.carrier) || '').trim();
    const c = CHECKIN[who.toUpperCase()] || (/^(ryanair|buzz|malta air|lauda)/i.test(who) ? RY : /^wizz/i.test(who) ? WZ : null);
    if (!c || !isLocal(l.dep)) return null;
    // poplatek Ryanairu podle země odletu (podle časového pásma letiště)
    const cc = String(l.fromCc || '').toUpperCase(), tz = String(l.fromTz || '');
    const fee = c !== RY ? c[2] : cc === 'AT' || tz === 'Europe/Vienna' ? '40 €' : cc === 'ES' || /^(Europe\/Madrid|Atlantic\/Canary|Africa\/Ceuta)$/.test(tz) ? '30 €' : c[2];
    return { airline: c[0], closeH: c[1], fee, open: minus24h(l.dep.slice(0, 16), l.fromTz) };
  }
  // Místní čas o 24 skutečných hodin dřív – při změně letního času mezi tím o hodinu jinak než „stejný čas den předem“.
  function minus24h(wall, tz) {
    const w = Date.parse(wall + ':00Z');
    const off = ms => { // posun pásma v minutách v okamžiku ms (UTC)
      const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ms));
      const g = t => +p.find(x => x.type === t).value;
      return (Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute')) - ms) / 6e4;
    };
    try {
      if (!tz) throw 0;
      const dep = w - off(w - off(w) * 6e4) * 6e4, open = dep - 864e5;
      return new Date(open + off(open) * 6e4).toISOString().slice(0, 16);
    } catch (e) { return new Date(w - 864e5).toISOString().slice(0, 16); }
  }
  /** Připomínka online check-inu jako událost (15 min v čase otevření), nebo null. */
  function checkinEvent(l) {
    const c = checkin(l);
    if (!c) return null;
    return {
      title: `📲 Online check-in ${c.airline} · ${l.from} → ${l.to}`,
      description: `Bez koupené místenky se online check-in otevírá 24 h před odletem (${l.dep.slice(11, 16)} místního času ${l.from}) a zavírá ${c.closeH} h před odletem. Odbavení na letišti stojí ~${c.fee} za osobu a let.`,
      location: '', start: c.open, tz: l.fromTz, durationMin: 15,
    };
  }

  /**
   * Cesta vlakem/busem jako událost: { from, to, date, dep?, arr?, fromTz?, toTz?, kind?, carrier?, min?, fromStation?, toStation? }
   * dep/arr jsou místní časy (zóna města odjezdu / příjezdu); bez spoje (jen odhad) celodenní událost v den cesty.
   */
  function groundEvent(g, { url, note } = {}) {
    const hm = s => s.slice(11, 16);
    const timed = isLocal(g.dep);
    const icon = /^bus$/.test(g.kind || '') ? '🚌' : '🚆';
    const where = (city, st) => (st ? `${city} – ${st}` : city);
    const dur = Number(g.min) > 0 ? `${Math.floor(g.min / 60)} h ${String(Math.round(g.min % 60)).padStart(2, '0')} min` : '';
    const lines = timed
      ? [`Odjezd ${hm(g.dep)} místního času (${where(g.from, g.fromStation)})`, isLocal(g.arr) ? `Příjezd ${hm(g.arr)} místního času (${where(g.to, g.toStation)})` : '']
      : [`Konkrétní spoj vyber a ověř u dopravce${dur ? ` – cesta trvá ~${dur} (odhad)` : ''}.`];
    const ev = {
      title: `${icon} ${g.from} → ${g.to}${g.carrier ? ' · ' + g.carrier : ''}${g.kind ? ` (${g.kind})` : ''}`,
      description: [...lines, note || ''].filter(Boolean).join('\n'),
      location: where(g.from, g.fromStation),
      url,
    };
    return timed
      ? { ...ev, start: g.dep.slice(0, 16), tz: g.fromTz, end: isLocal(g.arr) ? g.arr.slice(0, 16) : null, endTz: g.toTz || g.fromTz, durationMin: g.min || 240 }
      : { ...ev, start: isYmd(g.date) ? g.date : String(g.dep || '').slice(0, 10) };
  }

  window.Ics = { build, download, gcalUrl, flightEvent, groundEvent, checkin, checkinEvent, tzOffset, localToUtc, fold, escText };
})();
