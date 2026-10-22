/* ATLAS – sdílení jedné nabídky letu odkazem #offer=… (JSON zkomprimovaný – sharelink.js, jako #trip= a #plan=).
   Odkaz nese trasu, data, cenu, aerolinku a odkaz na koupi – příjemce uvidí kartu nabídky bez hledání (cena je z doby
   sdílení, karta to říká). Data z odkazu jsou cizí vstup: sanitize() z nich postaví nový objekt jen se známými poli.
   Tlačítko 📤 Sdílet a karta nabídky jsou ve flights.js (offerShare, openOffer). */
(function () {
  const MAX_HASH = 20000; // jedna nabídka i s dlouhými odkazy do obchodů má pár set znaků
  const obj = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
  const fin = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  const iata = s => typeof s === 'string' && /^[A-Z0-9]{3}$/.test(s) ? s : null;
  const isYmd = s => {
    if (typeof s !== 'string' || !/^(19|20|21)\d\d-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(s + 'T00:00:00Z');
    return !isNaN(d) && d.toISOString().slice(0, 10) === s;
  };
  // místní čas letu „2026-11-14T06:10“ (bez zóny – jak ho ukazují výsledky)
  const localDt = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d/.test(s) && isYmd(s.slice(0, 10)) ? s.slice(0, 16) : null;
  // text bez znaků pro vložení HTML/JS a řídicích znaků (vypisuje se i přes esc() – tohle je druhá pojistka)
  const txt = (v, n) => (typeof v === 'string' ? v.replace(/[<>"'`]/g, '').replace(/[\x00-\x1f\x7f‪-‮⁦-⁩]/g, ' ').trim().slice(0, n) : '');
  const http = u => (typeof u === 'string' && u.length <= 2000 && /^https?:\/\/[^\s<>"'`]+$/i.test(u) ? u : null);
  const prov = s => (typeof s === 'string' && /^[a-z0-9-]{1,20}$/.test(s) ? s : '');
  const BAGS = ['none', 'cabin', 'checked'];

  function leg(l) {
    if (!obj(l) || !iata(l.from) || !iata(l.to) || !isYmd(l.date)) return null;
    const dep = localDt(l.dep), arr = dep && localDt(l.arr);
    return { from: l.from, to: l.to, date: l.date, ...(dep ? { dep } : {}), ...(arr ? { arr } : {}), stops: Number.isInteger(l.stops) && l.stops >= 0 && l.stops <= 5 ? l.stops : null, air: txt(l.air, 60) };
  }

  /** Bezpečná kopie nabídky z odkazu: jen známá pole, ověřené tvary; bez letu tam nebo ceny → výjimka. */
  function sanitize(raw, now = Date.now()) {
    if (!obj(raw) || (raw.v != null && raw.v !== 1)) throw new Error('neznámý formát nabídky');
    const out = leg(raw.out), back = raw.back != null ? leg(raw.back) : null;
    if (!out || !fin(raw.czk, 1, 1e7)) throw new Error('neplatná nabídka');
    const pax = Number.isInteger(raw.pax) && raw.pax >= 1 && raw.pax <= 9 ? raw.pax : 1;
    const d = obj(raw.dest) ? raw.dest : {};
    const o = {
      dest: { id: typeof d.id === 'string' && /^(ap|metro):[A-Z0-9]{3}$/.test(d.id) ? d.id : null, label: txt(d.label, 80) || out.to, cc: typeof d.cc === 'string' && /^[A-Z]{2}$/.test(d.cc) ? d.cc : '' },
      out, back: back && back.date >= out.date ? back : null,
      czk: Math.round(raw.czk), pax,
      // čas ceny ne z budoucnosti (hodiny jiného zařízení)
      at: fin(raw.at, 1.5e12, now + 864e5) ? raw.at : null,
      bags: BAGS.includes(raw.bags) ? raw.bags : 'none',
      buy: (Array.isArray(raw.buy) ? raw.buy : []).filter(b => Array.isArray(b) && http(b[0]) && ['all', 'out', 'back'].includes(b[2])).slice(0, 2).map(b => [b[0], prov(b[1]), b[2]]),
    };
    if (fin(raw.total, o.czk, 1e8)) o.total = Math.round(raw.total);
    if (o.back && Number.isInteger(raw.nights) && raw.nights >= 0 && raw.nights <= 366) o.nights = raw.nights;
    if (raw.demo === true) o.demo = true;
    return o;
  }

  // let z výsledku hledání → tvar odkazu (časy jen u letů, které je mají; přestupy u Aviasales neznámé)
  const legOf = l => ({ from: l.from, to: l.to, date: l.date, ...(l.hasTime && l.dep ? { dep: l.dep, arr: l.arr } : {}), stops: l.provider === 'travelpayouts' && !l.stops ? null : +l.stops || 0, air: l.carrierName || l.carrier || '' });
  /** Odložená nabídka z řádku výsledků (Pins.fromRow) → nabídka do odkazu; odkaz na koupi jako u tlačítek Koupit. */
  function fromPin(p) {
    const t = p.t, buy = t.bookUrl ? [[t.bookUrl, t.provider, 'all']] : !t.back ? [[t.out.bookUrl, t.out.provider, 'all']] : [[t.out.bookUrl, t.out.provider, 'out'], [t.back.bookUrl, t.back.provider, 'back']];
    return {
      dest: { id: p.dest.id, label: p.dest.label, cc: p.dest.cc }, out: legOf(t.out), back: t.back ? legOf(t.back) : null,
      czk: t.perPersonCzk, pax: p.q.adults, total: t.totalCzk, nights: t.nights, at: p.at, bags: p.q.bags, buy, ...(p.demo ? { demo: true } : {}),
    };
  }
  /** JSON nabídky do odkazu (pročištěný stejně jako při načtení). */
  const json = p => JSON.stringify({ v: 1, ...sanitize(fromPin(p)) });

  const fromJson = text => sanitize(JSON.parse(text));
  /** Část odkazu za #offer= → Promise s nabídkou; poškozený odkaz → zamítnutí. */
  async function unpack(payload) {
    if (typeof payload !== 'string' || !/^[A-Za-z0-9_-]+$/.test(payload) || payload.length > MAX_HASH) throw new Error('poškozený odkaz');
    return fromJson(await ShareLink.unpack(payload));
  }
  /** Nabídka z adresy (#offer=…) → Promise; null, když adresa žádnou nabídku nenese. */
  async function fromHash(hash) {
    const m = String(hash || '').match(/^#offer=(.*)$/);
    return m ? unpack(m[1]) : null;
  }

  /* ---------- text do zprávy (navigator.share / schránka) ---------- */
  const DOW = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];
  const kc = n => Math.round(n).toLocaleString('cs-CZ') + ' Kč';
  const day = d => `${DOW[new Date(d + 'T12:00:00Z').getUTCDay()]} ${+d.slice(8, 10)}. ${+d.slice(5, 7)}.`;
  const nightsTxt = n => `${n} ${n === 1 ? 'noc' : n >= 2 && n <= 4 ? 'noci' : 'nocí'}`;
  const legTxt = l => [l.dep ? l.dep.slice(11, 16) : '', `${l.from} → ${l.to}`, l.stops ? `${l.stops}× přestup` : l.stops === 0 ? 'přímý' : ''].filter(Boolean).join(' ');
  /** Krátký text nabídky: cíl a termín, cena, lety a aerolinka; odkaz přidá volající. */
  function text(o) {
    const air = [...new Set([o.out, o.back].filter(Boolean).map(l => l.air).filter(Boolean))].join(' + ');
    return [
      `✈️ ${o.dest.label} · ${o.back ? `${day(o.out.date)} – ${day(o.back.date)}${o.nights != null ? ` · ${nightsTxt(o.nights)}` : ''}` : `${day(o.out.date)} · jen tam`}`,
      `${kc(o.czk)}/os.${o.pax > 1 && o.total ? ` (celkem ${kc(o.total)} za ${o.pax} os.)` : ''}${o.demo ? ' (DEMO – vymyšlená cena)' : ''}`,
      [`tam ${legTxt(o.out)}`, o.back ? `zpět ${legTxt(o.back)}` : '', air].filter(Boolean).join(' · '),
      '(ATLAS – cena se mohla změnit, ověř ji před nákupem)',
    ].join('\n');
  }

  window.OfferShare = { sanitize, fromPin, json, unpack, fromHash, text };
})();
