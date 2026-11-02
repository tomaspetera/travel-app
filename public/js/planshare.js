/* ATLAS – sdílení plánu cesty z plánovače odkazem #plan=… (JSON plánu zkomprimovaný – sharelink.js; dřívější odkazy
   #plan=<base64url JSON> fungují dál). Data z odkazu jsou cizí vstup: sanitize() z nich postaví nový objekt jen se
   známými poli. Nové odkazy nesou den sdílení (sharedOn) – příjemce uvidí, z kdy jsou ceny. */
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
  // raw: vlastní záloha (backup.js) – plánovač vše vypisuje přes esc(), takže uvozovky a < > zůstanou; jen řídicí znaky ne.
  const txt = (v, max, multiline = false, raw = false) => typeof v === 'string' || typeof v === 'number'
    ? (raw ? String(v).replace(/[\u202a-\u202e\u2066-\u2069]/g, '') : String(v).replace(/'/g, '’').replace(/[<>"`\u202a-\u202e\u2066-\u2069]/g, '')).replace(/\r\n?/g, '\n')
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

  // 🚆 Vlak / bus, ke kterému uživatel v plánovači zapsal čas odjezdu (průvodce ho u přejezdů mezi místy nezná),
  // nástupiště, vůz / místo a kód jízdenky (app.js tripRides). Úsek = den + odkud + kam (bez uvozovek – průvodce je
  // v textech nechává, odkaz je mění na ’). Kód jízdenky jen ve vlastní záloze (kod), do odkazů ani kalendáře nejde.
  const RIDES_MAX = 8, RIDE_LEN = { plat: 12, seat: 30, kod: 40 };
  const rideKey = r => `${r.date}|${String(r.from || '').replace(/[<>"'`’]/g, '')}|${String(r.to || '').replace(/[<>"'`’]/g, '')}`;
  function rides(v, { kod = false, raw = false } = {}) {
    const T = (x, max) => txt(x, max, false, raw), seen = new Set();
    return (Array.isArray(v) ? v.slice(0, 30) : []).map(r => {
      if (!obj(r) || !isYmd(r.date) || !T(r.from, 80) || !T(r.to, 80)) return null;
      const dep = typeof r.dep === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.dep) ? r.dep : '', min = Math.round(Number(r.min));
      const o = { date: r.date, from: T(r.from, 80), to: T(r.to, 80), kind: r.kind === 'bus' ? 'bus' : 'vlak', dep, min: min > 0 && min < 3000 ? min : null, tz: tz(r.tz),
        plat: T(r.plat, RIDE_LEN.plat), seat: T(r.seat, RIDE_LEN.seat), ...(kod ? { kod: T(r.kod, RIDE_LEN.kod) } : {}) };
      // prázdný záznam (vše smazané) nic nenese; stejný úsek dvakrát jen jednou
      return (o.dep || o.plat || o.seat || o.kod) && !seen.has(rideKey(o)) && seen.add(rideKey(o)) ? o : null;
    }).filter(Boolean).slice(0, RIDES_MAX);
  }

  /** Bezpečná kopie plánu: jen známá pole, ověřená data, omezené délky a počty (lim: delší limity pro vlastní zálohu – backup.js). */
  function sanitize(raw, lim = {}) {
    const L = { act: 300, acts: 40, ck: 80, ckLen: 120, notes: 3000, raw: false, ...lim };
    const T = (v, max, multiline = false) => txt(v, max, multiline, L.raw);
    if (!obj(raw)) throw new Error('neplatný plán');
    const start = isYmd(raw.start) ? raw.start : '';
    let end = start && isYmd(raw.end) && raw.end >= start ? raw.end : '';
    if (end && Date.parse(end) - Date.parse(start) > 366 * 864e5) end = '';
    // Aktivity jen ve dnech cesty – jiné by plánovač stejně nezobrazil.
    const days = {};
    if (start && obj(raw.days)) {
      for (const [d, items] of Object.entries(raw.days).slice(0, 62)) {
        if (!isYmd(d) || d < start || d > (end || start) || !Array.isArray(items)) continue;
        const list = items.slice(0, L.acts).map(x => T(x, L.act)).filter(Boolean);
        if (list.length) days[d] = list;
      }
    }
    const pax = Math.round(Number(raw.pax));
    const budget = Number(raw.budget);
    const legs = Array.isArray(raw.legs) ? raw.legs.slice(0, 4).map(leg).filter(Boolean) : [];
    const grounds = Array.isArray(raw.ground) ? raw.ground.slice(0, 4).map(ground).filter(Boolean) : [];
    const plan = {
      name: T(raw.name, 120) || 'Sdílená cesta',
      dest: T(raw.dest, 120) || '—',
      iso: typeof raw.iso === 'string' && /^[A-Z]{2}$/.test(raw.iso) ? raw.iso : null,
      start, end,
      pax: String(Number.isFinite(pax) ? Math.min(9, Math.max(1, pax)) : 2),
      budget: raw.budget !== '' && Number.isFinite(budget) && budget > 0 ? String(Math.round(Math.min(budget, 1e8))) : '',
      flight: T(raw.flight, 500) || null,
      days,
      // položka { t, done } z plánovače, nebo text z odkazu s odškrtnutím v masce done (index = pořadí v odkazu); id
      // položky z „Co zařídit a co sbalit“ průvodce (pretrip.js) zůstane – záloha a přenos do zařízení bez něj rozpojily
      // odškrtnutí v plánovači a v průvodci (odkaz #plan= posílá jen texty)
      checklist: (Array.isArray(raw.checklist) ? raw.checklist.slice(0, L.ck) : [])
        .map((x, i) => ({ t: T(obj(x) ? x.t : x, L.ckLen), done: obj(x) ? x.done === true : doneAt(raw.done, i),
          ...(obj(x) && typeof x.id === 'string' && /^(todo|pack):[\w-]{1,40}$/.test(x.id) ? { id: x.id } : {}) })).filter(x => x.t),
      notes: T(raw.notes, L.notes, true),
    };
    if (legs.length) plan.legs = legs;
    if (grounds.length) plan.ground = grounds;
    // vlaky a busy s časem z plánovače – jen ve dnech cesty; kód jízdenky jen ve vlastní záloze (raw), ne v odkazu
    const rs = start ? rides(raw.rides, { kod: L.raw, raw: L.raw }).filter(r => r.date >= start && r.date <= (end || start)) : [];
    if (rs.length) plan.rides = rs;
    // cesta přes víc zemí: jen kódy zemí (vstupní podmínky si plánovač dopočítá z dat)
    const codes = v => (Array.isArray(v) ? [...new Set(v.filter(x => typeof x === 'string' && /^[A-Z]{2}$/.test(x)))].slice(0, 8) : []);
    const isos = codes(raw.isos), via = codes(raw.via);
    if (isos.length) plan.isos = isos;
    // přestupy v zemích, kde registrace platí i pro tranzit (ESTA v USA…)
    if (via.length) plan.via = via;
    // město cesty (letiště / metropole) pro „Hledat lety“ – jen platný kód, vlajka se dopočítá ze země
    if (obj(raw.place) && typeof raw.place.id === 'string' && /^(ap|metro):[A-Z]{3}$/.test(raw.place.id)) plan.place = { id: raw.place.id, label: txt(raw.place.label, 80) || plan.dest };
    // sid = stálé označení sdílené cesty (dává ho první sdílení): novější verze od kamaráda pak cestu aktualizuje, ne zkopíruje
    if (typeof raw.sid === 'string' && SID.test(raw.sid)) plan.sid = raw.sid;
    // ver = otisk odeslané verze, base = otisk verze druhé strany, kterou odesílatel naposledy dostal (merge podle ní
    // pozná, co z mé odeslané verze kamarád viděl – a tedy co smazal)
    if (typeof raw.ver === 'string' && VER.test(raw.ver)) plan.ver = raw.ver;
    if (typeof raw.base === 'string' && VER.test(raw.base)) plan.base = raw.base;
    // prev = otisky verzí, které odesílatel poslal dřív (nejvýš 5): merge podle nich pozná, že nová verze vychází
    // z jeho verze, kterou už mám (poslal jich víc po sobě)
    const prev = Array.isArray(raw.prev) ? [...new Set(raw.prev.filter(x => typeof x === 'string' && VER.test(x)))].slice(-5) : [];
    if (prev.length) plan.prev = prev;
    return plan;
  }
  const SID = /^[a-z0-9]{10}$/, VER = /^[a-z0-9]{1,13}$/;
  /** Otisk obsahu verze plánu (FNV-1a, base36): stejný obsah = stejný otisk – předpřipravený odkaz i odeslaný ho mají stejný. */
  function verOf(t) {
    const { sid, ver, base, prev, ...rest } = sanitize(t);
    let h = 0x811c9dc5;
    for (const ch of JSON.stringify(rest)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
    // „v“ na začátku: otisk jen z číslic by byl v sentSnaps číselný klíč – JS ho řadí první, takže by se nejnovější
    // odeslaná verze zahodila jako nejstarší
    return 'v' + h.toString(36);
  }
  /** Nové označení sdílené cesty (10 znaků a–z, 0–9). */
  function newSid() {
    const a = 'abcdefghijklmnopqrstuvwxyz0123456789', n = new Uint8Array(10);
    if (typeof crypto === 'object' && crypto && crypto.getRandomValues) crypto.getRandomValues(n); else for (let i = 0; i < 10; i++) n[i] = Math.floor(Math.random() * 256);
    return Array.from(n, x => a[x % 36]).join('');
  }

  /**
   * Novější verze sdíleného plánu do už uložené cesty (stejné sid, u starších odkazů stejný název a cíl) – místo kopie.
   * Od kamaráda: termín, cíl, let, vlaky, cestující, rozpočet a program. Tvoje zůstane: název, „Sbaleno“ i s odškrtnutím
   * (nové položky se přidají), kódy rezervací, místo a kód jízdenky u vlaku a vlastní aktivity – ty, které kamarád
   * neviděl (nebyly v mé verzi, ze které vychází – sentSnaps[p.base], ani v jeho dřívější, kterou mám – sharedSnap;
   * u staršího odkazu bez otisku jen sharedSnap; bez záznamu se nic nezahodí, jen se přidají chybějící). Aktivita
   * z té verze se pozná v kterýkoli den – kamarád ji mohl přesunout, nebo jsi posunul termín.
   * Poznámky: změněné u obou → tvoje a pod nimi kamarádovy (další verze kamarádovy jen nahradí). Aktivity mimo nový
   * termín se přesunou na jeho první / poslední den.
   */
  /**
   * Záznam vyměněné verze plánu (sharedSnap): jen texty aktivit (bez dnů – aktivita se pozná i po posunu termínu, menší
   * záloha a přenos do zařízení) a poznámky. Ukládá se při importu, aktualizaci i vlastním sdílení.
   */
  const snapOf = p => ({ acts: Object.values(obj(p && p.days) ? p.days : {}).flat().filter(x => typeof x === 'string' && x).slice(0, 600), notes: (p && typeof p.notes === 'string' && p.notes) || '' });
  // aktivity ze záznamu (i opakované – „Pláž“ každý den); dřívější tvar (1. 11. 2026) měl { days }
  const snapList = snap => (!snap ? [] : Array.isArray(snap.acts) ? snap.acts : obj(snap.days) ? Object.values(snap.days).filter(Array.isArray).flat() : []).filter(x => typeof x === 'string');
  // porovnání jako v odkazu: kamarádův plán i záznam prošly sanitize (bez uvozovek, ’ místo '), moje cesta má text, jak
  // jsem ho napsal – „Večeře v "Dishoom"“ je pořád táž aktivita
  const ak = x => txt(x, 300), nk = x => txt(x || '', 3000, true);
  function merge(own, p) {
    // společný základ: moje odeslaná verze, kterou kamarád viděl (p.base → own.sentSnaps), jinak naposledy přijatá
    // (sharedSnap) – při střídavých úpravách tak jeho mazání a přesuny platí a moje nové aktivity zůstanou
    const sent = p.base && obj(own.sentSnaps) && obj(own.sentSnaps[p.base]) ? own.sentSnaps[p.base] : null;
    const got = obj(own.sharedSnap) ? own.sharedSnap : null, start = p.start, end = p.end || p.start;
    // k ní i kamarádova verze, kterou už mám, když poslal víc verzí po sobě: nová z ní vychází (je mezi jeho dřív
    // odeslanými – p.prev) a moje odeslaná ji ještě neobsahovala (dostal jsem ji až potom – sent.base). Jinak by
    // jeho smazané a přesunuté aktivity zůstaly jako moje a poznámky se zdvojily; verze třetího člověka, který tu
    // kamarádovu neviděl, jeho aktivity nesmaže
    const gotToo = got && sent && typeof own.gotVer === 'string' && sent.base !== own.gotVer && Array.isArray(p.prev) && p.prev.includes(own.gotVer);
    const snaps = sent ? (gotToo ? [sent, got] : [sent]) : got ? [got] : [];
    // aktivity z vyměněné verze jako počty (multimnožina): opakovaná „Pláž“ přidaná jiný den je moje, ne kamarádova
    // (ze dvou verzí víc z obou – co kamarád viděl aspoň v jedné)
    const was = new Map();
    for (const sn of snaps) {
      const c = new Map();
      for (const x of snapList(sn)) c.set(ak(x), (c.get(ak(x)) || 0) + 1);
      for (const [k, n] of c) was.set(k, Math.max(was.get(k) || 0, n));
    }
    const days = {};
    for (const [d, items] of Object.entries(p.days || {})) days[d] = items.slice();
    const clampDay = d => (start && d < start ? start : start && d > end ? end : d);
    const ownItems = [];
    for (const d of Object.keys(obj(own.days) ? own.days : {}).sort()) for (const x of Array.isArray(own.days[d]) ? own.days[d] : []) if (typeof x === 'string' && x) ownItems.push({ k: clampDay(d), x });
    // 1) aktivita, kterou má kamarád týž den, je společná (spotřebuje se ze záznamu); i počty – druhá moje „Pláž“
    //    v den, kdy má kamarád jednu, je moje navíc
    const pday = new Map();
    for (const [d, items] of Object.entries(days)) for (const x of items) pday.set(`${d}|${ak(x)}`, (pday.get(`${d}|${ak(x)}`) || 0) + 1);
    const rest = [];
    for (const it of ownItems) {
      const key = `${it.k}|${ak(it.x)}`, at = pday.get(key) || 0, n = was.get(ak(it.x)) || 0;
      if (at) { pday.set(key, at - 1); if (n) was.set(ak(it.x), n - 1); } else rest.push(it);
    }
    // 2) zbytek: co bylo ve společném základu (a kamarád to smazal nebo přesunul), pryč; jinak moje – přidat
    for (const it of rest) {
      const n = was.get(ak(it.x)) || 0;
      if (n) { was.set(ak(it.x), n - 1); continue; }
      days[it.k] = [...(days[it.k] || []), it.x];
    }
    const ownCk = Array.isArray(own.checklist) ? own.checklist.filter(x => obj(x) && x.t) : [];
    const hasCk = new Set(ownCk.map(x => x.t));
    const checklist = [...ownCk, ...(p.checklist || []).filter(x => !hasCk.has(x.t)).map(x => ({ t: x.t, done: false, ...(x.id ? { id: x.id } : {}) }))];
    const mine = own.notes || '', pn = p.notes || '';
    const prevNotes = snaps.map(sn => (typeof sn.notes === 'string' ? nk(sn.notes) : null)).filter(x => x != null), known = v => prevNotes.includes(nk(v));
    // minule připojené kamarádovy poznámky (přesně text ze záznamu – oba pocházejí z kamarádovy verze)
    const added = snaps.map(sn => sn.notes).find(n => typeof n === 'string' && n && mine.endsWith(`\n\n${n}`));
    const notes = !mine || known(mine) || nk(mine) === nk(pn) ? pn
      : !pn || known(pn) ? mine
      // … nahradit novými (dřív se každou verzí přidávaly pod sebe)
      : added ? mine.slice(0, -added.length) + pn : `${mine}\n\n${pn}`;
    // vlak: čas a nástupiště od kamaráda, místo a kód jízdenky tvoje; tvoje vlaky, které v plánu nejsou, zůstanou
    const ownR = Array.isArray(own.rides) ? own.rides.filter(obj) : [], byKey = new Map(ownR.map(r => [rideKey(r), r]));
    const pR = (p.rides || []).map(r => { const o = byKey.get(rideKey(r)); return o ? { ...r, seat: o.seat || r.seat, ...(o.kod ? { kod: o.kod } : {}) } : r; });
    const pKeys = new Set(pR.map(rideKey));
    const rs = [...pR, ...ownR.filter(r => !pKeys.has(rideKey(r)) && (!start || (r.date >= start && r.date <= end)))].slice(0, RIDES_MAX);
    const out = { ...own, dest: p.dest, iso: p.iso, start: p.start, end: p.end, pax: p.pax, budget: p.budget, flight: p.flight,
      legs: p.legs, ground: p.ground, isos: p.isos, via: p.via, place: p.place, rides: rs.length ? rs : undefined,
      // otisk patří k záznamu přijaté verze – starší odkaz bez otisku ho smaže (jinak by další odkaz tvrdil, že jsem
      // viděl verzi, kterou záznam už nepopisuje)
      days, checklist, notes, sid: p.sid || own.sid, sharedSnap: snapOf(p), gotVer: p.ver };
    for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
    return out;
  }

  // dnešek v místním čase (YYYY-MM-DD)
  const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  /** JSON plánu do odkazu (plán se před zakódováním pročistí stejně jako při načtení). */
  function json(trip) {
    // otisky (ver / base / prev) jen z cesty samé – ne ty, které by cesta nesla z importu
    const { ver: _v, base: _b, prev: _p, ...p } = sanitize(trip), done = doneMask(p.checklist);
    // sharedOn = den sdílení („ceny jsou z doby sdílení“ u příjemce) – jen den, ať je odkaz připravený při otevření plánu
    // stejný jako ten po kliknutí (ShareLink.prepare); verze zůstává 1, starší verze aplikace pole přeskočí
    const base = typeof trip.gotVer === 'string' && VER.test(trip.gotVer) ? trip.gotVer : null;
    // prev: co jsem poslal dřív (sentSnaps) – kamarád pozná, že tahle verze vychází z mé, kterou už má
    const prev = obj(trip.sentSnaps) ? Object.keys(trip.sentSnaps).filter(k => VER.test(k)).slice(-5) : [];
    return JSON.stringify({ v: 1, ...p, checklist: p.checklist.map(x => x.t), ...(done ? { done } : {}), ver: verOf(trip), ...(base ? { base } : {}), ...(prev.length ? { prev } : {}), sharedOn: today() });
  }

  const checked = payload => {
    if (typeof payload !== 'string' || !/^[A-Za-z0-9_-]+$/.test(payload) || payload.length > MAX_HASH) throw new Error('poškozený odkaz');
    return payload;
  };
  /** Den sdílení z odkazu: platné datum, ne z budoucnosti (hodiny jiného zařízení – den rezerva), jinak null. */
  const sharedDay = v => (isYmd(v) && v >= '2020-01-01' && v <= today(new Date(Date.now() + 864e5)) ? v : null);
  // plán z odkazu + sharedOn (den sdílení), když ho odkaz nese – do plánovače se neukládá (previewPlan ho odebere)
  const fromJson = text => {
    const raw = JSON.parse(text);
    if (!obj(raw) || (raw.v != null && raw.v !== 1)) throw new Error('neznámý formát plánu');
    const p = sanitize(raw), on = sharedDay(raw.sharedOn);
    return on ? { ...p, sharedOn: on } : p;
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

  window.PlanShare = { sanitize, json, encode, decode, unpack, fromHash, txt, rides, rideKey, RIDE_LEN, newSid, merge, snapOf, verOf };
})();
