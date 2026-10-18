/* ATLAS – chytré hledání: věta jako „k moři v květnu do 5000 na týden ve dvou“ → nastavení hledání letů.
   Bez umělé inteligence a bez serveru: slovník českých obratů (i bez diakritiky), místa ze zbytku věty dohledá
   našeptávač (flights.js). Smart.parse(text, { today, presets, holidays, holidayDates }) → { chips, patch, to, from, kind }. */
(function () {
  'use strict';
  // bez diakritiky a malými písmeny – délka i pozice znaků zůstanou (české znaky jsou v NFC jeden znak)
  const fold = s => s.normalize('NFC').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const parseYmd = s => new Date(s + 'T12:00:00Z');
  const addDays = (s, n) => { const d = parseYmd(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
  const dow = s => parseYmd(s).getUTCDay();
  const lastDay = (y, m) => new Date(Date.UTC(y, m + 1, 0, 12)).getUTCDate();
  const dm = s => `${+s.slice(8, 10)}. ${+s.slice(5, 7)}.`;
  const czk = n => `${Math.round(n).toLocaleString('cs-CZ').replace(/ /g, ' ')} Kč`;

  const NUM = { jeden: 1, jedna: 1, jednu: 1, jednoho: 1, dva: 2, dve: 2, dvou: 2, tri: 3, trech: 3, ctyri: 4, ctyrech: 4, pet: 5, peti: 5, sest: 6, sesti: 6, sedm: 7, osm: 8, devet: 9, deset: 10, jedenact: 11, dvanact: 12, trinact: 13, ctrnact: 14 };
  const NUM_RE = `\\d{1,2}|${Object.keys(NUM).sort((a, b) => b.length - a.length).join('|')}`;
  const num = v => (/^\d+$/.test(v) ? +v : NUM[v] || 0);
  const MONTHS = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
  // tvary měsíců bez diakritiky; červenec před červnem (delší tvar napřed)
  const MONTH_FORMS = [['cervenci', 6], ['cervenec', 6], ['cervence', 6], ['lednu', 0], ['leden', 0], ['ledna', 0], ['unoru', 1], ['unor', 1], ['unora', 1],
    ['breznu', 2], ['brezen', 2], ['brezna', 2], ['dubnu', 3], ['duben', 3], ['dubna', 3], ['kvetnu', 4], ['kveten', 4], ['kvetna', 4],
    ['cervnu', 5], ['cerven', 5], ['cervna', 5], ['srpnu', 7], ['srpen', 7], ['srpna', 7], ['zari', 8], ['rijnu', 9], ['rijen', 9], ['rijna', 9],
    ['listopadu', 10], ['listopad', 10], ['prosinci', 11], ['prosinec', 11], ['prosince', 11]];
  const MONTH_OF = Object.fromEntries(MONTH_FORMS);
  // K moři podle ročního období (regiony našeptávače – rg:…): v zimě jen tam, kde je i v zimě na koupání teplo.
  const SEA = {
    kanary: ['Kanárské ostrovy', '🇪🇸'], madeira: ['Madeira', '🇵🇹'], 'egypt-more': ['Rudé moře (Egypt)', '🇪🇬'], kreta: ['Kréta', '🇬🇷'], kypr: ['Kypr', '🇨🇾'],
    'turecka-riviera': ['Turecká riviéra', '🇹🇷'], algarve: ['Algarve', '🇵🇹'], baleary: ['Baleáry', '🇪🇸'], 'chorvatske-pobrezi': ['Chorvatské pobřeží', '🇭🇷'], sicilie: ['Sicílie', '🇮🇹'],
  };
  const seaFor = m => (m >= 5 && m <= 7 ? ['chorvatske-pobrezi', 'kreta', 'baleary', 'turecka-riviera'] // červen–srpen
    : m === 4 || m === 8 ? ['kreta', 'kypr', 'turecka-riviera', 'baleary'] // květen, září
      : m === 3 || m === 9 ? ['kanary', 'kreta', 'kypr', 'turecka-riviera'] // duben, říjen
        : ['kanary', 'egypt-more', 'madeira']); // listopad–březen
  // hory: letiště u Alp (lyže v zimě, turistika v létě)
  const MOUNTAINS = [['INN', 'Innsbruck', '🇦🇹'], ['SZG', 'Salcburk', '🇦🇹'], ['GVA', 'Ženeva', '🇨🇭'], ['TRN', 'Turín', '🇮🇹']];
  // daleko za teplem (jako 🌏 Exotika v Letech)
  const EXOTIC = [['TH', 'Thajsko', '🇹🇭'], ['ID', 'Indonésie', '🇮🇩'], ['VN', 'Vietnam', '🇻🇳'], ['AE', 'Spojené arabské emiráty', '🇦🇪'], ['LK', 'Srí Lanka', '🇱🇰']];

  // slova, která místo neurčují (zbytek věty po vyřazení rozpoznaných obratů)
  const FILL = new Set(('chci chtel chtela chteli chtela chceme chtej bych bychom rad rada radi letet letim letime poletim poletime poletet let lety letenka letenky letenku letadlem '
    + 'levne levny levnou levna levnej nejlevneji nejlevnejsi hledam hledame najdi najit ukaz jet jedu jedeme pojedu pojedeme cesta cestu cesty dovolena dovolenou dovolene '
    + 'vylet vyletu i pro nas me mi my ja jsem nejak nejaky nejakou nejake termin terminu okolo kolem cca asi prosim potrebuji potrebujem idealne klidne treba zase ten ta '
    + 'to tento tenhle ktery nebo ale jen jenom jeste uz nejlepe mozna nam vam si se nejlevnejsi nejlepsi super hezky hezkou nekde nekam kam odkud kdy kdyz tak taky take '
    + 'tam zpet zpatky domu letadlo letadla mesto mesta kde').split(' '));
  const TO_WORDS = new Set(['do', 'na', 'k', 'ke', 'kam', 'v', 've', 'za', 'u', 'pres', 'po']);
  const FROM_WORDS = new Set(['z', 'ze', 'odkud', 'od']);
  // před „moře“ jméno moře → je to místo (Rudé moře), ne „k moři“
  const SEA_NAMES = /(rude|cerne|baltske|severni|stredozemni|jadranske|egejske|kaspicke|mrtve)\s+$/;

  function parse(text, o = {}) {
    const today = o.today || ymd(new Date());
    const raw = String(text || '').normalize('NFC').slice(0, 200);
    const s = fold(raw);
    const used = new Array(s.length).fill(false);
    const chips = [], patch = {};
    let kind = null, month = null, dates = null, len = null, kids = 0;
    // obrat najdi, označ jako použitý; fn vrátí false = nepoužít (shoda zůstane ve zbytku věty)
    const rule = (re, fn) => {
      const g = new RegExp(re.source, 'g' + (re.flags.includes('i') ? 'i' : ''));
      let m;
      while ((m = g.exec(s))) {
        if (m[0] === '') { g.lastIndex++; continue; }
        const at = m.index;
        // jen od začátku slova (moře v „Baltimore“ ne) a jen nepoužitý text; jinak hledat dál od dalšího znaku
        if ((at > 0 && /[a-z0-9]/.test(s[at - 1])) || used.slice(at, at + m[0].length).some(Boolean) || fn(m, at) === false) { g.lastIndex = at + 1; continue; }
        used.fill(true, at, at + m[0].length);
      }
    };
    const W = '(?=$|[^a-z0-9])'; // konec slova (bez \b – u čísel s tečkou)
    const AMT = '(\\d{1,3}(?:[ .]\\d{3})+|\\d+)'; // částka i s mezerami po tisících („5 000“), ne „5000 2 lidi“

    // --- termín: konkrétní dny „15. 5.“, „od 3. 6. do 10. 6.“, „3.–10. 6.“ ---
    const mkDate = (d, m, y) => {
      d = +d; m = +m;
      if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
      let yr = y ? +y : +today.slice(0, 4);
      if (d > lastDay(yr, m - 1)) return null;
      let v = `${yr}-${pad(m)}-${pad(d)}`;
      if (!y && v < today) { yr++; v = `${yr}-${pad(m)}-${pad(d)}`; }
      return v;
    };
    rule(new RegExp(`(?:od\\s*)?(\\d{1,2})\\.\\s*(\\d{1,2})\\.?(?:\\s*(20\\d\\d))?(?:\\s*(?:-|–|az|do)\\s*(\\d{1,2})\\.\\s*(\\d{1,2})\\.?(?:\\s*(20\\d\\d))?)?${W}`), (m, at) => {
      const a = mkDate(m[1], m[2], m[3]);
      // „3.–10. 6.“: konec rozsahu dnů ve stejném měsíci – patří pravidlu níž
      if (!a || (!m[4] && /\d{1,2}\.\s*(?:-|–|az)\s*$/.test(s.slice(0, at)))) return false;
      const b = m[4] ? mkDate(m[4], m[5], m[6] || (+m[5] < +m[2] ? +a.slice(0, 4) + 1 : a.slice(0, 4))) : null;
      if (m[4] && (!b || b < a)) return false;
      dates = { exact: true, out: a, back: b };
    });

    rule(new RegExp(`(?:od\\s*)?(\\d{1,2})\\.\\s*(?:-|–|az|do)\\s*(\\d{1,2})\\.\\s*(\\d{1,2})\\.?(?:\\s*(20\\d\\d))?${W}`), m => {
      const b = mkDate(m[2], m[3], m[4]), a = b && mkDate(m[1], m[3], m[4] || b.slice(0, 4));
      if (!a || !b || b < a) return false;
      if (dates && dates.exact) return false;
      dates = { exact: true, out: a, back: b };
    });
    // --- za týden / za 14 dní = kdy (ne jak dlouho) ---
    rule(new RegExp(`za\\s+(?:(${NUM_RE})\\s*)?(tyden|tydny|tydnu|den|dny|dni|dnu)${W}`), m => {
      const n = m[1] ? num(m[1]) : 1, d = /^ty/.test(m[2]) ? n * 7 : n;
      if (!(d >= 1 && d <= 120)) return false;
      dates = dates || { from: addDays(today, Math.max(0, d - 3)), to: addDays(today, d + 4), label: `za ${m[1] ? `${n} ` : ''}${m[2] === 'tyden' ? 'týden' : m[2].replace('tydn', 'týdn').replace('dni', 'dní')}` };
    });
    // --- délka pobytu ---
    rule(new RegExp(`(?:na\\s+)?(?:prodlouzen[yeyj]+|dlouh[yej]+)\\s+vikend\\w*${W}`), () => { len = 'long'; });
    rule(new RegExp(`(?:na\\s+)?(?:tento|tenhle|tenhleten|nejblizsi)\\s+vikend${W}|o\\s+vikendu${W}`), () => {
      len = 'weekend';
      // odlet čt–so nejbližšího víkendu (v neděli už ten příští)
      const sat = addDays(today, (6 - dow(today) + 7) % 7);
      dates = dates || { from: today, to: sat, label: 'tento víkend' };
    });
    rule(new RegExp(`(?:na\\s+)?(?:pristi|dalsi)\\s+vikend${W}`), () => {
      len = 'weekend';
      const sat = addDays(today, ((6 - dow(today) + 7) % 7) + 7);
      dates = dates || { from: addDays(sat, -2), to: sat, label: 'příští víkend' };
    });
    rule(new RegExp(`(?:na\\s+)?vikend\\w*${W}`), () => { len = len || 'weekend'; });
    rule(new RegExp(`(?:na\\s+)?(${NUM_RE})\\s*(?:noc|noci|nocich)${W}`), m => { const n = num(m[1]); if (!(n >= 1 && n <= 30)) return false; len = { n }; });
    rule(new RegExp(`(?:na\\s+)?(${NUM_RE})\\s*(?:den|dny|dni|dnu)${W}`), m => { const n = num(m[1]); if (!(n >= 1 && n <= 31)) return false; len = n === 14 ? '2weeks' : { n: Math.max(1, n - 1) }; });
    rule(new RegExp(`(?:na\\s+)?(${NUM_RE})\\s*tydn[uy]?${W}`), m => { const n = num(m[1]); if (!(n >= 1 && n <= 4)) return false; len = n === 1 ? 'week' : n === 2 ? '2weeks' : { n: n * 7 }; });
    rule(new RegExp(`(?:na\\s+)?(?:cely\\s+)?tyden${W}`), () => { len = len || 'week'; });
    rule(new RegExp(`(?:na\\s+)?par\\s+dni${W}|kratk[yeou]+\\s+(?:vylet|vyletu|pobyt)${W}`), () => { len = len || 'long'; });

    // --- měsíc, roční období, svátky, relativní termín ---
    const monthRange = m => {
      let y = +today.slice(0, 4);
      if (m < +today.slice(5, 7) - 1) y++;
      const from = `${y}-${pad(m + 1)}-01`, to = `${y}-${pad(m + 1)}-${pad(lastDay(y, m))}`;
      return { from: from < today ? today : from, to };
    };
    rule(new RegExp(`(?:(?:v|ve|na|behem|koncem|zacatkem|pocatkem|polovinou|v\\s+polovine|od|do)\\s+)?(${MONTH_FORMS.map(x => x[0]).join('|')})${W}`), m => {
      if (dates && !dates.month) return false;
      const k = MONTH_OF[m[1]], r = monthRange(k);
      if (dates && dates.month) { dates.to = monthRange(k).to; dates.label = `${dates.label}–${MONTHS[k]}`; month = month ?? k; return; } // „v květnu a červnu“
      month = k;
      dates = { ...r, month: true, label: MONTHS[k] };
    });
    const seasons = [['(?:v\\s+)?lete|leto|o\\s+prazdninach|prazdniny|na\\s+leto', 5, 7, 'léto'], ['(?:na\\s+)?jare|jaro', 2, 4, 'jaro'], ['(?:na\\s+)?podzim\\w*', 8, 10, 'podzim'], ['(?:v\\s+)?zime|zima|na\\s+zimu', 11, 13, 'zima']];
    for (const [re, a, b, label] of seasons) {
      rule(new RegExp(`(?:${re})${W}`), m => {
        if (dates) return false;
        const pr = /prazdnin/.test(m[0]), A = pr ? 6 : a, Bm = pr ? 7 : b, cm = +today.slice(5, 7) - 1;
        // období právě běží (podzim v říjnu) → od dneška do jeho konce; jinak nejbližší celé (zima přes Nový rok)
        const inNow = (cm >= A && cm <= Bm) || (Bm > 11 && cm <= Bm - 12);
        const start = inNow ? today : monthRange(A % 12).from, sy = +start.slice(0, 4), sm = +start.slice(5, 7) - 1;
        const ey = sy + (Bm > 11 && sm >= A ? 1 : 0), em = Bm % 12;
        dates = { from: start, to: `${ey}-${pad(em + 1)}-${pad(lastDay(ey, em))}`, label: pr ? 'prázdniny' : label };
        month = inNow ? cm : A % 12;
      });
    }
    const hol = (o.holidays || []);
    const holRule = (re, name, fallback) => rule(new RegExp(`(?:(?:na|o|pres|na\\s+svatky)\\s+)?(?:${re})${W}`), () => {
      if (dates) return false;
      const lw = hol.find(x => fold(x.name || '').includes(name));
      if (lw && o.holidayDates) { dates = { holiday: lw, label: lw.name }; return; }
      const r = fallback();
      if (!r) return false;
      dates = r;
    });
    holRule('vanoc\\w*|vanocni\\s+svatky', 'vanoce', () => { const y = today.slice(5) > '12-27' ? +today.slice(0, 4) + 1 : +today.slice(0, 4); return { from: [today, `${y}-12-19`].sort()[1], to: `${y}-12-24`, label: 'Vánoce' }; });
    holRule('silvestr\\w*|novy\\s+rok|novyho\\s+roku', 'novy rok', () => { const y = +today.slice(0, 4) + (today.slice(5) > '12-31' ? 1 : 0); return { from: [today, `${y}-12-27`].sort()[1], to: `${y}-12-31`, label: 'Silvestr' }; });
    holRule('velikonoc\\w*', 'velikonoce', () => null);
    rule(new RegExp(`(?:co\\s+nejdriv|hned|ihned|narychlo|last\\s*minute|lastminute|co\\s+nejdrive)${W}`), () => { if (dates) return false; dates = { from: today, to: addDays(today, 14), label: 'co nejdřív' }; });
    rule(new RegExp(`(?:pristi|dalsi)\\s+tyden${W}`), () => { if (dates) return false; const mon = addDays(today, ((8 - dow(today)) % 7) || 7); dates = { from: mon, to: addDays(mon, 6), label: 'příští týden' }; });
    rule(new RegExp(`(?:tento|tenhle)\\s+tyden${W}`), () => { if (dates) return false; dates = { from: today, to: addDays(today, (7 - dow(today)) % 7), label: 'tento týden' }; });
    rule(new RegExp(`(?:pristi|dalsi)\\s+mesic${W}`), () => {
      if (dates) return false;
      const k = (+today.slice(5, 7)) % 12;
      month = k; dates = { ...monthRange(k), label: MONTHS[k] };
    });
    rule(new RegExp(`za\\s+(${NUM_RE}|mesic)\\s*(mesic\\w*|tyd\\w*)?${W}`), m => {
      if (dates) return false;
      const n = m[1] === 'mesic' ? 1 : num(m[1]), unit = m[1] === 'mesic' ? 'mesic' : m[2] || '';
      if (!n || !unit) return false;
      const d = unit.startsWith('mesic') ? n * 30 : n * 7;
      dates = { from: addDays(today, Math.max(1, d - 4)), to: addDays(today, d + 7), label: `za ${m[1] === 'mesic' ? 'měsíc' : `${n} ${unit.startsWith('mesic') ? (n < 5 ? 'měsíce' : 'měsíců') : (n < 5 ? 'týdny' : 'týdnů')}`}` };
    });
    rule(new RegExp(`(?:zitra|zejtra)${W}`), () => { if (dates) return false; dates = { exact: true, out: addDays(today, 1), back: null, label: 'zítra' }; });
    rule(new RegExp(`(?:dnes|dneska)${W}`), () => { if (dates) return false; dates = { exact: true, out: today, back: null, label: 'dnes' }; });

    // --- cena ---
    const price = (v, unit) => {
      let n = +String(v).replace(/[^\d]/g, '');
      if (unit) n *= 1000;
      return n >= 300 && n <= 500000 ? n : 0;
    };
    rule(new RegExp(`(?:do|za|max(?:imalne)?|maximum|pod|nejvys(?:e)?|levneji\\s+nez|budget|rozpocet)\\s*${AMT}\\s*(tisic\\w*|tis\\.?|k)?\\s*(?:kc|korun\\w*|czk|,-)?${W}`), m => {
      const n = price(m[1], m[2]);
      if (!n) return false;
      patch.maxPrice = String(n);
    });
    rule(new RegExp(`${AMT}\\s*(tisic\\w*|tis\\.?)?\\s*(?:kc|korun\\w*|czk)${W}`), m => { const n = price(m[1], m[2]); if (!n || patch.maxPrice) return false; patch.maxPrice = String(n); });

    // --- lidé, přestupy, zavazadla, jen tam ---
    const people = n => { if (n >= 1 && n <= 9) { patch.adults = n; return true; } return false; };
    rule(new RegExp(`(?:ve|pro)\\s+(${NUM_RE})(?:\\s+(?:lidi|lide|osoby|osob|dospele|dospeli|dospelych|lidi))?${W}`), m => (people(num(m[1])) ? undefined : false));
    rule(new RegExp(`(${NUM_RE})\\s*(?:lidi|lide|osoby|osob|dospeli|dospelych|pasazeri|pasazery|cestujici)${W}`), m => (people(num(m[1])) ? undefined : false));
    rule(new RegExp(`(?:sam|sama|samotn[yaá]|solo|jen\\s+ja)${W}`), () => { people(1); });
    // děti platí letenku jako dospělí: „2 dospělí a 2 děti“ = 4 cestující (bez počtu dospělých dva)
    rule(new RegExp(`(?:a\\s+|s\\s+)?(${NUM_RE})\\s*(?:deti|ditka|detmi|ditetem|dite)${W}|(?:s|se)\\s+(?:ditetem|ditkem|miminkem)${W}`), m => {
      const k = m[1] ? num(m[1]) : 1;
      if (!(k >= 1 && k <= 6)) return false;
      kids = k;
    });
    rule(new RegExp(`s\\s+(?:pritelkyni|pritelem|partnerem|partnerkou|manzelkou|manzelem|holkou|klukem|zenou|muzem)${W}`), () => { people(2); });
    rule(new RegExp(`(?:primy|prime|primo|primym|primou|bez\\s+prestupu|bez\\s+prestupovani)${W}`), () => { patch.directOnly = true; });
    rule(new RegExp(`(?:s\\s+)?(?:kabinov\\w*|prirucn\\w*)(?:\\s+(?:kufr\\w*|zavazad\\w*))?${W}|(?:s\\s+)?kufrik\\w*${W}`), () => { patch.bags = 'cabin'; });
    rule(new RegExp(`(?:s\\s+)?(?:velk\\w+\\s+)?kufr\\w*(?:\\s+k\\s+odbaveni)?${W}|odbaven\\w*\\s+zavazad\\w*${W}`), () => { patch.bags = patch.bags || 'checked'; });
    rule(new RegExp(`(?:jen\\s+(?:s\\s+)?batoh\\w*|bez\\s+kufr\\w*|bez\\s+zavazad\\w*)${W}`), () => { patch.bags = 'none'; });
    rule(new RegExp(`(?:jen\\s+tam|jednosmern\\w*|one\\s*way|bez\\s+zpatecni\\w*|bez\\s+navratu)${W}`), () => { patch.trip = 'oneway'; });
    rule(new RegExp(`(?:tam\\s+(?:i|a)\\s+zpet|zpatecni\\w*)${W}`), () => { patch.trip = 'return'; });

    // --- kam: k moři, za teplem, exotika, kamkoliv ---
    rule(new RegExp(`(?:(?:k|ke|na|u)\\s+)?(?:mori|more|moricku|moricko|plaz\\w*|koupat|koupani|pobrezi)${W}`), (m, at) => {
      if (/mor/.test(m[0]) && SEA_NAMES.test(s.slice(0, at))) return false; // Rudé moře = místo
      kind = kind || 'sea';
    });
    rule(new RegExp(`(?:za|do|na)?\\s*(?:teplem|tepla|teplo|slunce|sluncem|slunicko|slunicka|slunickem|jih|jihu)${W}`), () => { kind = kind || 'warm'; patch.minTemp = Math.max(patch.minTemp || 0, 20); });
    rule(new RegExp(`(?:do\\s+)?(?:horka|horko|vedra|vedro)${W}`), () => { kind = kind || 'warm'; patch.minTemp = 25; });
    rule(new RegExp(`(?:do\\s+|na\\s+)?(?:exotik\\w*|exoticky\\w*|tropu|tropy|do\\s+dalky|daleko)${W}`), () => { kind = 'exotic'; });
    rule(new RegExp(`(?:kamkoliv|kamkoli|kdekoliv|kdekoli|nekam|cokoliv|kamkolvek)${W}`), () => { kind = kind || 'any'; });
    rule(new RegExp(`(?:na\\s+|do\\s+)?(?:hory|horach|hor|alpy|alp|lyze|lyzovat|lyzovani|na\\s+snih)${W}`), () => { kind = kind || 'mountains'; });

    // --- zbytek věty: místa (z X = odkud, jinak kam) ---
    const to = [], from = [];
    let mode = 'to', cur = [];
    const flush = () => { if (cur.length) (mode === 'from' ? from : to).push(cur.join(' ')); cur = []; };
    const re = /[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*|[,/;&+]/gu;
    let m;
    while ((m = re.exec(s))) {
      const at = m.index, w = m[0], orig = raw.slice(at, at + w.length);
      if (used.slice(at, at + w.length).some(Boolean)) { flush(); continue; }
      if (/^[,/;&+]$/.test(w) || w === 'a' || w === 'nebo' || w === 'ci') { flush(); continue; }
      if (FROM_WORDS.has(w)) { flush(); mode = 'from'; continue; }
      if (TO_WORDS.has(w)) { flush(); mode = 'to'; continue; }
      if (FILL.has(w) || /^\d+$/.test(w)) { flush(); continue; }
      cur.push(orig);
    }
    flush();

    if (kids) patch.adults = Math.min(9, (patch.adults || 2) + kids);
    // --- délka → noci a dny odletu ---
    const P = o.presets || {};
    if (typeof len === 'string') {
      patch.len = len;
      if (P[len]) Object.assign(patch, { nMin: P[len].nMin, nMax: P[len].nMax, outDays: P[len].out.slice(), backDays: P[len].back.slice() });
    } else if (len && len.n) Object.assign(patch, { len: 'custom', nMin: len.n, nMax: len.n, outDays: [], backDays: [] });

    // --- termín → pole formuláře ---
    if (dates && dates.holiday) {
      Object.assign(patch, { dateMode: 'flex', trip: patch.trip || 'return', len: 'holiday', ...o.holidayDates(dates.holiday, today) });
      chips.push(['📅', dates.label]);
    } else if (dates && dates.exact) {
      const n = patch.nMin != null ? Math.round((patch.nMin + patch.nMax) / 2) : 7;
      const back = dates.back || (patch.trip === 'oneway' ? null : addDays(dates.out, n));
      Object.assign(patch, { dateMode: 'exact', xOut: dates.out, xFlex: 0, ...(back ? { xBack: back } : {}) });
      if (!dates.back && !back) patch.trip = 'oneway';
      delete patch.outDays; delete patch.backDays;
      chips.push(['📅', dates.label || (dates.back ? `${dm(dates.out)} – ${dm(dates.back)}` : dm(dates.out))]);
    } else if (dates) {
      Object.assign(patch, { dateMode: 'flex', dFrom: dates.from, dTo: dates.to < dates.from ? dates.from : dates.to });
      chips.push(['📅', dates.label]);
    }
    if (patch.len && !(dates && dates.exact) && patch.len !== 'holiday') chips.push(['🌙', patch.len === 'custom' ? `${patch.nMin} ${patch.nMin === 1 ? 'noc' : patch.nMin < 5 ? 'noci' : 'nocí'}` : { weekend: 'víkend', long: 'prodl. víkend', week: 'týden', '2weeks': '2 týdny' }[patch.len]]);
    if (patch.len && patch.len !== 'holiday' && patch.dateMode !== 'exact') patch.dateMode = 'flex';

    // --- kam podle druhu ---
    const mon = month ?? (dates && (dates.from || dates.out) ? +((dates.from || dates.out).slice(5, 7)) - 1 : +addDays(today, 14).slice(5, 7) - 1);
    let items = null;
    if (kind === 'sea') items = seaFor(mon).map(k => ({ id: `rg:${k}`, label: SEA[k][0], flag: SEA[k][1], type: 'region' }));
    else if (kind === 'exotic') items = EXOTIC.map(([cc, label, flag]) => ({ id: `cc:${cc}`, label, flag, type: 'country' }));
    else if (kind === 'mountains') items = MOUNTAINS.map(([iata, label, flag]) => ({ id: `ap:${iata}`, label, flag, type: 'airport' }));
    if (kind) chips.unshift([{ sea: '🏖️', warm: '☀️', exotic: '🌴', any: '🌍', mountains: '🏔️' }[kind], { sea: 'k moři', warm: patch.minTemp >= 25 ? 'do horka' : 'za teplem', exotic: 'exotika', any: 'kamkoliv', mountains: 'na hory' }[kind]]);
    if (patch.maxPrice) chips.push(['💰', `do ${czk(+patch.maxPrice)}`]);
    if (patch.adults) chips.push(['👥', `${patch.adults} ${patch.adults === 1 ? 'osoba' : patch.adults < 5 ? 'osoby' : 'osob'}${kids ? ' vč. dětí' : ''}`]);
    if (patch.directOnly) chips.push(['✈️', 'jen přímé']);
    if (patch.bags) chips.push(['🧳', { none: 'bez kufru', cabin: 'kabinový kufr', checked: 'kufr k odbavení' }[patch.bags]]);
    if (patch.trip === 'oneway') chips.push(['➡️', 'jen tam']);
    return { chips: chips.map(([i, t]) => ({ icon: i, text: t })), patch, to, from, kind, items };
  }

  /** Zkracování koncovek pro našeptávač („do Říma“ → Řím, „z Vídně“ → Víd): celé slovo, bez 1 a bez 2 znaků. */
  function stems(phrase) {
    const w = String(phrase || '').trim();
    if (!w) return [];
    const out = [w];
    for (const k of [1, 2]) { const v = w.slice(0, -k); if (v.replace(/\s/g, '').length >= 3 && !/\s$/.test(v)) out.push(v); }
    return [...new Set(out)];
  }
  // pořadí druhů míst: země a oblasti před městy, náhodná místa z geokódování až nakonec
  const TYPE_RANK = { country: 0, region: 1, continent: 2, metro: 3, airport: 4, city: 5, place: 6 };
  /**
   * Nejlepší návrh pro frázi ze všech dotazů (list = [{ q, items }] pro tvary ze stems): jen návrhy, jejichž název začíná
   * hledaným tvarem (bez diakritiky), lepší druh a delší tvar dřív; geokódovaná místa (geo:) jen bez jiné shody.
   */
  function bestPlace(list) {
    let best = null;
    for (const { q, items } of list) {
      const fq = fold(q).replace(/\s+/g, ' ');
      for (const it of items || []) {
        const lab = fold(String(it.label || '')).replace(/\s*\(.*\)$/, '');
        const ok = lab.startsWith(fq) || lab.split(/[\s-]+/).some(p => p.startsWith(fq)) || (it.aliases || []).some(a => fold(a).startsWith(fq));
        if (!ok) continue;
        const geo = /^geo:/.test(it.id || '');
        const score = (geo ? 100 : 0) + (TYPE_RANK[it.type] ?? 7) * 10 - fq.length / 100;
        if (!best || score < best.score) best = { score, it };
      }
    }
    return best ? best.it : null;
  }

  /**
   * Základní tvar jména místa z pádu (poslední slovo): „Brna“ → Brno, „Prahy“ → Praha, „Vídně“ → Vídeň, „Lisabonu“ →
   * Lisabon, „Krétu“ → Kréta, „Paříže“ → Paříž. Vrací kandidáty včetně původního tvaru (nejpravděpodobnější první).
   */
  function nominatives(phrase) {
    const p = String(phrase || '').trim(), i = p.lastIndexOf(' '), head = p.slice(0, i + 1), w = p.slice(i + 1);
    if (w.length < 3) return p ? [p] : [];
    const out = [w], f = fold(w), cut = n => w.slice(0, -n);
    if (/ne$/.test(f) && /ě$/.test(w)) out.push(cut(2) + 'eň'); // Vídně → Vídeň, Plzně → Plzeň
    if (/ě$/.test(w)) out.push(cut(1) + 'o'); // v Brně → Brno, v Mnichově → Mnichovo? (i Mnichov níž)
    if (/[aeiyu]$/.test(f)) out.push(cut(1)); // Lisabonu → Lisabon, Paříže → Paříž, Krakova → Krakov
    if (/a$/.test(f)) out.push(cut(1) + 'o'); // Brna → Brno, Ostravy? ne – Kolína nad Rýnem…
    if (/y$/.test(f)) out.push(cut(1) + 'a'); // Prahy → Praha, Barcelony → Barcelona
    if (/u$/.test(f)) out.push(cut(1) + 'a', cut(1) + 'o'); // Krétu → Kréta, po Toskánsku → Toskánsko
    if (/e$/.test(f) && !/ne$/.test(f)) out.push(cut(1) + 'a'); // Kréte? Olomouci ne – Bratislave → Bratislava
    if (/em$|ou$/.test(f)) out.push(cut(2), cut(2) + 'a'); // Brnem → Brno? (Brn) – Prahou → Praha
    if (/ich$|ech$/.test(f)) out.push(cut(3) + 'y'); // Benátkách? – Athénách → Athény (bez záruky)
    return [...new Set(out.filter(x => x.length >= 3).map(x => head + x))];
  }

  // Objevuj: druh plánu podle slov ve větě
  const EX_MODE = { city: '🏙️ program ve městě', day: '🎒 výlety do okolí', loop: '🧭 okruh s přespáním', bike: '🚴 na kole', hike: '🥾 pěšky' };
  const EX_INT = { kids: '🧒 s dětmi', art: '🖼️ muzea a umění', history: '🏰 památky', nature: '🌳 příroda' };
  /**
   * Objevuj: „Lisabon na 3 dny“, „Krakov pěšky 10 km“, „výlety z Brna“, „Řím s dětmi od 15. 5.“ → { place (fráze místa),
   * mode, days, km, start, interests, chips }. Místo dohledá Objevuj (nominatives + api/geocode).
   */
  function parseExplore(text, o = {}) {
    const raw = String(text || '').normalize('NFC').slice(0, 200), s = fold(raw), blank = raw.split('');
    let mode = null, km = null, days = null;
    const interests = [];
    const W = '(?=$|[^a-z0-9])';
    const take = (re, fn) => {
      const g = new RegExp(re.source, 'g');
      let m;
      while ((m = g.exec(s))) {
        const at = m.index;
        if ((at > 0 && /[a-z0-9]/.test(s[at - 1])) || fn(m) === false) { g.lastIndex = at + 1; continue; }
        for (let i = at; i < at + m[0].length; i++) blank[i] = ' ';
      }
    };
    take(new RegExp(`(?:na\\s+)?(?:kole|kolo|cyklo\\w*|bike)${W}`), () => { mode = 'bike'; });
    take(new RegExp(`(?:pesky|pesi\\s+(?:vylet\\w*|okruh\\w*|tur\\w*)|tur[auy]|turistik\\w*|vyslap\\w*|hike|hiking)${W}`), () => { mode = mode || 'hike'; });
    take(new RegExp(`(?:na\\s+)?(?:okruh\\w*|road\\s*trip\\w*|autem\\s+po\\s+okoli)${W}`), () => { mode = mode || 'loop'; });
    take(new RegExp(`(?:jednodenni\\s+)?(?:vylet\\w*|do\\s+okoli)${W}`), () => { mode = mode || 'day'; });
    take(new RegExp(`(\\d{1,3})\\s*km${W}`), m => { km = +m[1]; });
    take(new RegExp(`(?:na\\s+)?(${NUM_RE})\\s*(?:den|dny|dni|dnu)${W}`), m => { const n = num(m[1]); if (!(n >= 1 && n <= 14)) return false; days = n; });
    take(new RegExp(`(?:na\\s+)?(?:prodlouzen\\w+\\s+)?vikend\\w*${W}`), m => { days = days || (/prodlouz/.test(m[0]) ? 3 : 2); });
    take(new RegExp(`(?:na\\s+)?(?:cely\\s+)?tyden${W}`), () => { days = days || 7; });
    take(new RegExp(`(?:s|se)\\s+(?:detmi|ditetem|ditkem|deckama)${W}|pro\\s+deti${W}`), () => { interests.push('kids'); });
    take(new RegExp(`(?:muze\\w*|galeri\\w*|umeni)${W}`), () => { interests.push('art'); });
    take(new RegExp(`(?:pamatk\\w*|histori\\w*|hrad\\w*|zamk\\w*|zamek)${W}`), () => { interests.push('history'); });
    take(new RegExp(`(?:prirod\\w*|vyhled\\w*)${W}`), () => { interests.push('nature'); });
    const p = parse(blank.join(''), o), pt = p.patch;
    const start = pt.xOut || pt.dFrom || null;
    const place = p.to[0] || p.from[0] || '';
    const chips = [];
    if (mode) chips.push(EX_MODE[mode]);
    if (days) chips.push(`📅 ${days} ${days === 1 ? 'den' : days < 5 ? 'dny' : 'dní'}`);
    if (start) chips.push(`🗓️ od ${dm(start)}`);
    if (km) chips.push(`📏 ${km} km`);
    for (const k of [...new Set(interests)]) chips.push(EX_INT[k]);
    return { place, mode, days, km, start, interests: [...new Set(interests)], chips };
  }

  window.Smart = { parse, stems, bestPlace, fold, nominatives, parseExplore };
})();
