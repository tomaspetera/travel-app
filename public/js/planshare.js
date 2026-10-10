/* ATLAS – sdílení plánu cesty z plánovače odkazem #plan=… (JSON plánu zkomprimovaný – sharelink.js; dřívější odkazy
   #plan=<base64url JSON> fungují dál). Data z odkazu jsou cizí vstup: sanitize() z nich postaví nový objekt jen se
   známými poli. */
(function () {
  const MAX_HASH = 150000; // ~110 kB JSON – víc plán z plánovače nemá
  const b64urlEncode = str => {
    let bin = '';
    for (const b of new TextEncoder().encode(str)) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const b64urlDecode = s => {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
  };

  // Text bez znaků pro vložení HTML/JS (<>"'`), řídicích znaků a obracení směru textu; zkrácený na max.
  // Apostrof se nahradí typografickým (Côte d’Azur), ostatní znaky se vypustí.
  const txt = (v, max, multiline = false) => typeof v === 'string' || typeof v === 'number'
    ? String(v).replace(/'/g, '’').replace(/[<>"`\u202a-\u202e\u2066-\u2069]/g, '').replace(/\r\n?/g, '\n')
      .replace(multiline ? /[\x00-\x09\x0b-\x1f\x7f]/g : /[\x00-\x1f\x7f]/g, ' ').trim().slice(0, max)
      .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g, m => m.length === 2 ? m : '') // i rozpůlený emoji
    : '';
  const isYmd = s => {
    if (typeof s !== 'string' || !/^(19|20|21)\d\d-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(s + 'T00:00:00Z');
    return !isNaN(d) && d.toISOString().slice(0, 10) === s;
  };
  const localDt = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(s.slice(0, 16)) && isYmd(s.slice(0, 10)) ? s.slice(0, 16) : null;
  const tz = s => typeof s === 'string' && s.length <= 40 && /^[A-Za-z][\w+-]*(\/[\w+-]+){0,2}$/.test(s) ? s : null;
  const iata = s => typeof s === 'string' && /^[A-Z0-9]{3}$/.test(s) ? s : null;
  const obj = v => v && typeof v === 'object' && !Array.isArray(v);
  // Odškrtnutí seznamu „Sbaleno“ v odkazu: volitelné pole done = bitová maska šestnáctkově (4 položky na znak, první
  // položka = nejvyšší bit prvního znaku, koncové nuly se vynechají – 80 položek nejvýš 20 znaků). Verze zůstává 1 jako
  // u dřívějších nových polí: starší odkazy pole nemají (vše neodškrtnuté) a starší verze aplikace ho přeskočí.
  const doneMask = list => {
    let s = '';
    for (let i = 0; i < list.length; i += 4) s += list.slice(i, i + 4).reduce((n, x, j) => n | (x.done ? 8 >> j : 0), 0).toString(16);
    return s.replace(/0+$/, '');
  };
  const doneAt = (mask, i) => typeof mask === 'string' && /^[0-9a-f]{1,20}$/.test(mask) && (parseInt(mask[i >> 2] || '0', 16) & (8 >> (i & 3))) > 0;

  function leg(l) {
    if (!obj(l) || !iata(l.from) || !iata(l.to)) return null;
    const dep = localDt(l.dep);
    const date = isYmd(l.date) ? l.date : dep ? dep.slice(0, 10) : null;
    if (!date) return null;
    const dur = Math.round(Number(l.durationMin));
    return {
      from: l.from, to: l.to, date, dep, arr: dep ? localDt(l.arr) : null, arrEst: l.arrEst === true, ...(l.arrUnknown === true && !localDt(l.arr) ? { arrUnknown: true } : {}),
      fromTz: tz(l.fromTz), toTz: tz(l.toTz), carrier: txt(l.carrier, 60), flightNo: txt(l.flightNo, 12),
      durationMin: dur > 0 && dur < 48 * 60 ? dur : null,
    };
  }

  // Cesta vlakem/busem z průvodce cestou (místo letu): názvy měst, místní časy a zóny, druh a dopravce.
  function ground(g) {
    if (!obj(g) || !txt(g.from, 80) || !txt(g.to, 80)) return null;
    const dep = localDt(g.dep);
    const date = isYmd(g.date) ? g.date : dep ? dep.slice(0, 10) : null;
    if (!date) return null;
    const min = Math.round(Number(g.min));
    return {
      from: txt(g.from, 80), to: txt(g.to, 80), date, dep, arr: dep ? localDt(g.arr) : null, fromTz: tz(g.fromTz), toTz: tz(g.toTz),
      kind: txt(g.kind, 20), carrier: txt(g.carrier, 40), min: min > 0 && min < 3000 ? min : null,
      fromStation: txt(g.fromStation, 60), toStation: txt(g.toStation, 60),
    };
  }

  /** Bezpečná kopie plánu: jen známá pole, ověřená data, omezené délky a počty. */
  function sanitize(raw) {
    if (!obj(raw)) throw new Error('neplatný plán');
    const start = isYmd(raw.start) ? raw.start : '';
    let end = start && isYmd(raw.end) && raw.end >= start ? raw.end : '';
    if (end && Date.parse(end) - Date.parse(start) > 366 * 864e5) end = '';
    // Aktivity jen ve dnech cesty – jiné by plánovač stejně nezobrazil.
    const days = {};
    if (start && obj(raw.days)) {
      for (const [d, items] of Object.entries(raw.days).slice(0, 62)) {
        if (!isYmd(d) || d < start || d > (end || start) || !Array.isArray(items)) continue;
        const list = items.slice(0, 40).map(x => txt(x, 300)).filter(Boolean);
        if (list.length) days[d] = list;
      }
    }
    const pax = Math.round(Number(raw.pax));
    const budget = Number(raw.budget);
    const legs = Array.isArray(raw.legs) ? raw.legs.slice(0, 4).map(leg).filter(Boolean) : [];
    const grounds = Array.isArray(raw.ground) ? raw.ground.slice(0, 4).map(ground).filter(Boolean) : [];
    const plan = {
      name: txt(raw.name, 120) || 'Sdílená cesta',
      dest: txt(raw.dest, 120) || '—',
      iso: typeof raw.iso === 'string' && /^[A-Z]{2}$/.test(raw.iso) ? raw.iso : null,
      start, end,
      pax: String(Number.isFinite(pax) ? Math.min(9, Math.max(1, pax)) : 2),
      budget: raw.budget !== '' && Number.isFinite(budget) && budget > 0 ? String(Math.round(Math.min(budget, 1e8))) : '',
      flight: txt(raw.flight, 500) || null,
      days,
      // položka { t, done } z plánovače, nebo text z odkazu s odškrtnutím v masce done (index = pořadí v odkazu)
      checklist: (Array.isArray(raw.checklist) ? raw.checklist.slice(0, 80) : [])
        .map((x, i) => ({ t: txt(obj(x) ? x.t : x, 120), done: obj(x) ? x.done === true : doneAt(raw.done, i) })).filter(x => x.t),
      notes: txt(raw.notes, 3000, true),
    };
    if (legs.length) plan.legs = legs;
    if (grounds.length) plan.ground = grounds;
    // cesta přes víc zemí: jen kódy zemí (vstupní podmínky si plánovač dopočítá z dat)
    const codes = v => (Array.isArray(v) ? [...new Set(v.filter(x => typeof x === 'string' && /^[A-Z]{2}$/.test(x)))].slice(0, 8) : []);
    const isos = codes(raw.isos), via = codes(raw.via);
    if (isos.length) plan.isos = isos;
    // přestupy v zemích, kde registrace platí i pro tranzit (ESTA v USA…)
    if (via.length) plan.via = via;
    // město cesty (letiště / metropole) pro „Hledat lety“ – jen platný kód, vlajka se dopočítá ze země
    if (obj(raw.place) && typeof raw.place.id === 'string' && /^(ap|metro):[A-Z]{3}$/.test(raw.place.id)) plan.place = { id: raw.place.id, label: txt(raw.place.label, 80) || plan.dest };
    return plan;
  }

  /** JSON plánu do odkazu (plán se před zakódováním pročistí stejně jako při načtení). */
  function json(trip) {
    const p = sanitize(trip), done = doneMask(p.checklist);
    return JSON.stringify({ v: 1, ...p, checklist: p.checklist.map(x => x.t), ...(done ? { done } : {}) });
  }

  const checked = payload => {
    if (typeof payload !== 'string' || !/^[A-Za-z0-9_-]+$/.test(payload) || payload.length > MAX_HASH) throw new Error('poškozený odkaz');
    return payload;
  };
  const fromJson = text => {
    const raw = JSON.parse(text);
    if (!obj(raw) || (raw.v != null && raw.v !== 1)) throw new Error('neznámý formát plánu');
    return sanitize(raw);
  };

  /** Dřívější tvar odkazu: base64url JSON bez komprese (ten nový dělá ShareLink.pack z json()). */
  const encode = trip => b64urlEncode(json(trip));
  const decode = payload => fromJson(b64urlDecode(checked(payload)));

  /** Část odkazu za #plan= v novém (zkomprimovaném) i dřívějším tvaru → Promise s plánem. */
  const unpack = async payload => fromJson(await ShareLink.unpack(checked(payload)));

  /** Plán z adresy (#plan=…) → Promise; null, když adresa žádný plán nenese. Poškozený odkaz → zamítnutí. */
  async function fromHash(hash) {
    const m = String(hash || '').match(/^#plan=(.*)$/);
    return m ? unpack(m[1]) : null;
  }

  window.PlanShare = { sanitize, json, encode, decode, unpack, fromHash };
})();
