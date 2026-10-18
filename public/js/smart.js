/* ATLAS – chytré hledání: věta jako „k moři v květnu do 5000 na týden ve dvou“ → nastavení hledání letů.
   Bez umělé inteligence a bez serveru: slovník českých obratů (i bez diakritiky), místa ze zbytku věty dohledá
   našeptávač (flights.js). Smart.parse(text, { today, presets, holidays, holidayDates }) → { chips, patch, to, from, kind }. */
(function () {
  'use strict';
  // bez diakritiky a malými písmeny – délka i pozice znaků zůstanou (české znaky jsou v NFC jeden znak)
  const fold = s => s.normalize('NFC').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const pad = n => String(n).padStart(2, '0');
  /** Velikonoční neděle (gregoriánský kalendář, anonymní algoritmus) → 'YYYY-MM-DD'. */
  function easter(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const n = h + l - 7 * m + 114;
    return `${y}-${pad(Math.floor(n / 31))}-${pad((n % 31) + 1)}`;
  }
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
  const MGEN_CZ = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];
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
  // polární záře: letiště za polárním kruhem a Island (září–březen)
  const AURORA = [['TOS', 'Tromsø', '🇳🇴'], ['RVN', 'Rovaniemi', '🇫🇮'], ['KTT', 'Kittilä', '🇫🇮'], ['KEF', 'Reykjavík', '🇮🇸']];
  const EXOTIC = [['TH', 'Thajsko', '🇹🇭'], ['ID', 'Indonésie', '🇮🇩'], ['VN', 'Vietnam', '🇻🇳'], ['AE', 'Spojené arabské emiráty', '🇦🇪'], ['LK', 'Srí Lanka', '🇱🇰']];

  // slova, která místo neurčují (zbytek věty po vyřazení rozpoznaných obratů)
  const FILL = new Set(('chci chtel chtela chteli chtela chceme chtej bych bychom rad rada radi letet letim letime poletim poletime poletet let lety letenka letenky letenku letadlem '
    + 'levne levny levnou levna levnej nejlevneji nejlevnejsi hledam hledame najdi najit ukaz jet jedu jedeme pojedu pojedeme cesta cestu cesty dovolena dovolenou dovolene '
    + 'vylet vyletu i pro nas me mi my ja jsem nejak nejaky nejakou nejake termin terminu okolo kolem cca asi prosim potrebuji potrebujem idealne klidne treba zase ten ta '
    + 'to tento tenhle ktery nebo ale jen jenom jeste uz nejlepe mozna nam vam si se nejlevnejsi nejlepsi super hezky hezkou nekde nekam kam odkud kdy kdyz tak taky take '
    + 'tam zpet zpatky domu letadlo letadla mesto mesta kde neco nejakeho nejakem nejakou je jsou bude budou nez all inclusive allinclusive '
    // proč a jak levně („na svatbu do Milána“, „na trhy“, „za babku“) – místo to není
    + 'svatbu svatba svatbe koncert koncertu festival festivalu zapas zapasu konferenci konference oslavu oslavy narozeniny navstevu trhy trh '
    + 'nakupy nakupum vylety s batohem batoh rande sluzebne sluzebni pracovne pracovni co par korun babku hubicku bez '
    // za čím a jak („kam za kulturou“, „na safari do Keni“, „sever Španělska“, „Portugalsko autem“)
    + 'safari kultura kulturu kulturou kulturni pamatky pamatkami zabava zabavu zabavou party jidlem jidlo gastro vinem vino '
    + 'sever severu zapad zapadu vychod vychodu autem vlakem autobusem busem zajezd zajezdy zajezdu pobyt pobytu pobyty ne '
    + 'romanticky romanticka romanticke romantickou romantiku relax relaxacni odpocinek odpocinkovy mam mame').split(' '));
  const TO_WORDS = new Set(['do', 'na', 'k', 'ke', 'kam', 'v', 've', 'za', 'u', 'pres', 'po']);
  const FROM_WORDS = new Set(['z', 'ze', 'odkud', 'od']);
  // před „moře“ jméno moře → je to místo (Rudé moře), ne „k moři“
  const SEA_NAMES = /(rude|cerne|baltske|severni|stredozemni|jadranske|egejske|kaspicke|mrtve)\s+$/;

  function parse(text, o = {}) {
    const today = o.today || ymd(new Date());
    // „Vídeň → Nice“: šipka odděluje odkud a kam (ve zbytku věty jako „>“)
    // „Praha - Londýn“, „Praha–Londýn“: pomlčka mezi slovy (ne mezi daty „3.–7. 6.“, ne „Baden-Baden“) jako ~ (měkká šipka)
    const raw = String(text || '').normalize('NFC').slice(0, 200).replace(/\s*(?:→|->|⇒|=>)\s*/gu, ' > ')
      .replace(/(\p{L})(?:\s*[–—]\s*|\s+-\s+)(?=\p{L})/gu, '$1 ~ '); // bez lookbehind (starší Safari ho nezná)
    const s = fold(raw);
    const used = new Array(s.length).fill(false);
    const chips = [], patch = {};
    let kind = null, month = null, dates = null, len = null, kids = 0, withKids = false;
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

    // polární záře (před měsíci – „za polární září“ není září)
    rule(new RegExp(`(?:na\\s+|za\\s+)?(?:polarn\\w+\\s+zar\\w*|aurora\\w*|aurory|polarni\\s+kruh\\w*)${W}`), () => { kind = 'aurora'; });
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
      if (!a || (!m[4] && /\b\d{1,2}\.?\s*(?:-|–|az)\s*$/.test(s.slice(0, at)))) return false;
      const b = m[4] ? mkDate(m[4], m[5], m[6] || (+m[5] < +m[2] ? +a.slice(0, 4) + 1 : a.slice(0, 4))) : null;
      if (m[4] && (!b || b < a)) return false;
      dates = { exact: true, out: a, back: b };
    });

    // (i „5-9.12.“ bez tečky za prvním dnem)
    rule(new RegExp(`(?:od\\s*)?\\b(\\d{1,2})\\.?\\s*(?:-|–|az|do)\\s*(\\d{1,2})\\.\\s*(\\d{1,2})\\.?(?:\\s*(20\\d\\d))?${W}`), m => {
      const b = mkDate(m[2], m[3], m[4]), a = b && mkDate(m[1], m[3], m[4] || b.slice(0, 4));
      if (!a || !b || b < a) return false;
      if (dates && dates.exact) return false;
      dates = { exact: true, out: a, back: b };
    });
    // „20. listopadu“, „od 3. do 7. prosince“, „3.–7. prosince“: dny se jménem měsíce (2. pád)
    const MGEN = ['ledna', 'unora', 'brezna', 'dubna', 'kvetna', 'cervna', 'cervence', 'srpna', 'zari', 'rijna', 'listopadu', 'prosince'];
    rule(new RegExp(`(?:od\\s*)?(\\d{1,2})\\.?\\s*(?:(?:-|–|az|do)\\s*(\\d{1,2})\\.?\\s*)?(${MGEN.join('|')})(?:\\s*(20\\d\\d))?${W}`), m => {
      if (dates && dates.exact) return false;
      const mo = MGEN.indexOf(m[3]) + 1, b = m[2] ? mkDate(m[2], mo, m[4]) : null, a = mkDate(m[1], mo, m[4] || (b ? b.slice(0, 4) : undefined));
      if (!a || (m[2] && (!b || b < a))) return false;
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
    // „příští týden“ / „tento týden“ = kdy (odlet v tom týdnu, po–ne), ne délka pobytu „týden“
    rule(new RegExp(`(?:(pristi|dalsi)|tento|tenhle)\\s+tyden${W}`), m => {
      if (dates) return false;
      const mon = addDays(today, (8 - dow(today)) % 7 || 7); // nejbližší příští pondělí
      dates = m[1] ? { from: mon, to: addDays(mon, 6), label: 'příští týden' } : { from: today, to: addDays(today, (7 - dow(today)) % 7), label: 'tento týden' };
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
    // začátkem / v polovině / koncem měsíce: jen ta třetina (1.–10., 10.–20., od 20.)
    const PART = [[/^(?:zacat|pocat)/, 1, 10, 'začátek'], [/pul|polov/, 10, 20, 'polovina'], [/^kon/, 20, 31, 'konec']];
    rule(new RegExp(`(?:(v|ve|na|behem|koncem|konec|zacatkem|zacatek|pocatkem|polovinou|polovina|v\\s+polovine|v\\s+pulce|pulka|od|do)\\s+)?(${MONTH_FORMS.map(x => x[0]).join('|')})${W}`), m => {
      if (dates && !dates.month) return false;
      const k = MONTH_OF[m[2]], r = monthRange(k);
      if (dates && dates.month) { dates.to = monthRange(k).to; dates.label = `${dates.label}–${MONTHS[k]}`; month = month ?? k; return; } // „v květnu a červnu“
      month = k;
      const part = PART.find(x => x[0].test(m[1] || ''));
      if (part) {
        const ym = r.to.slice(0, 8), from = ym + pad(part[1]), to = ym + pad(Math.min(part[2], +r.to.slice(8)));
        if (to >= today) { dates = { from: from < today ? today : from, to, month: true, label: `${part[3]} ${MGEN_CZ[k]}` }; return; }
      }
      dates = { ...r, month: true, label: MONTHS[k] };
    });
    // nejbližší výskyt pevného období v roce (měsíc-den od–do), které ještě neskončilo
    const nextSpan = (a, b, label) => { let y = +today.slice(0, 4); if (`${y}-${b}` < today) y++; const from = `${y}-${a}`; return { from: from < today ? today : from, to: `${y}-${b}`, label }; };
    // jarní / podzimní prázdniny (ne letní): jarní se liší podle okresu – únor až polovina března
    rule(new RegExp(`(?:na\\s+|o\\s+)?(?:jarni|jarnich)\\s+prazdnin\\w*${W}`), () => { if (dates) return false; dates = nextSpan('02-01', '03-20', 'jarní prázdniny'); len = len || 'week'; });
    rule(new RegExp(`(?:na\\s+|o\\s+)?(?:podzimni|podzimnich)\\s+prazdnin\\w*${W}`), () => { if (dates) return false; dates = nextSpan('10-24', '11-01', 'podzimní prázdniny'); len = len || 'long'; });
    // Valentýn: prodloužený víkend kolem 14. 2.
    rule(new RegExp(`(?:na\\s+|o\\s+)?valentyn\\w*${W}`), () => { if (dates) return false; dates = nextSpan('02-12', '02-14', 'Valentýn'); len = len || 'weekend'; });
    const seasons = [['(?:v\\s+)?lete|leto|letni|o\\s+prazdninach|prazdniny|na\\s+leto', 5, 7, 'léto'], ['(?:na\\s+)?jare|jaro', 2, 4, 'jaro'], ['(?:na\\s+)?podzim\\w*', 8, 10, 'podzim'], ['(?:v\\s+)?zime|zima|na\\s+zimu|zimni', 11, 13, 'zima']];
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
    // „mezi svátky“ = mezi Vánoci a Silvestrem (ne nejbližší státní svátek)
    rule(new RegExp(`mezi\\s+svatk\\w*${W}|mezi\\s+vanoc\\w+\\s+a\\s+(?:silvestr\\w*|novym\\s+rokem)${W}`), () => {
      if (dates) return false;
      const y = today.slice(5) > '12-30' ? +today.slice(0, 4) + 1 : +today.slice(0, 4);
      dates = { from: [today, `${y}-12-26`].sort()[1], to: `${y}-12-30`, label: 'mezi svátky' };
      month = 11;
    });
    // vánoční / adventní trhy: advent do 21. 12. (ne svátky – to už trhy končí), délku dá zbytek věty
    rule(new RegExp(`(?:na\\s+)?(?:vanocni|adventni)\\s+trh\\w*${W}|(?:na\\s+)?advent\\w*${W}`), () => {
      if (dates) return false;
      const y = today.slice(5) > '12-21' ? +today.slice(0, 4) + 1 : +today.slice(0, 4);
      dates = { from: [today, `${y}-11-27`].sort()[1], to: `${y}-12-21`, label: 'vánoční trhy' };
      month = 11;
    });
    holRule('vanoc\\w*|vanocni\\s+svatky', 'vanoce', () => { const y = today.slice(5) > '12-27' ? +today.slice(0, 4) + 1 : +today.slice(0, 4); return { from: [today, `${y}-12-19`].sort()[1], to: `${y}-12-24`, label: 'Vánoce' }; });
    holRule('silvestr\\w*|novy\\s+rok|novyho\\s+roku', 'novy rok', () => { const y = +today.slice(0, 4) + (today.slice(5) > '12-31' ? 1 : 0); return { from: [today, `${y}-12-27`].sort()[1], to: `${y}-12-31`, label: 'Silvestr' }; });
    // Velikonoce bez prodlouženého víkendu v seznamu (dál než pár měsíců): odlet čt–pá před Velikonoční nedělí
    holRule('velikonoc\\w*', 'velikonoce', () => {
      let y = +today.slice(0, 4), e = easter(y);
      if (addDays(e, 1) < today) e = easter(++y);
      len = len || 'long';
      return { from: [today, addDays(e, -3)].sort()[1], to: addDays(e, -2), label: 'Velikonoce' };
    });
    // „na státní svátek“, „o svátcích“: nejbližší prodloužený víkend
    rule(new RegExp(`(?:na\\s+|o\\s+|pres\\s+)?(?:statni\\s+svat\\w*|svatek|svatky|svatcich)${W}`), () => {
      if (dates || !hol[0] || !o.holidayDates) return false;
      dates = { holiday: hol[0], label: hol[0].name };
    });
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
    rule(new RegExp(`(?:pozitri|pozejtri)${W}`), () => { if (dates) return false; dates = { exact: true, out: addDays(today, 2), back: null, label: 'pozítří' }; });
    // „příští pátek“, „tuto sobotu“: konkrétní den – tento = nejbližší (i dnes), příští = v příštím týdnu (po–ne)
    const WD1 = [['nedeli|nedele', 0, 'neděle'], ['pondeli', 1, 'pondělí'], ['utery', 2, 'úterý'], ['stredu|streda', 3, 'středa'], ['ctvrtek', 4, 'čtvrtek'], ['patek', 5, 'pátek'], ['sobotu|sobota', 6, 'sobota']];
    rule(new RegExp(`(?:v\\s+|ve\\s+)?(pristi|tento|tenhle|tuto|tuhle)\\s+(${WD1.map(x => x[0]).join('|')})${W}`), m => {
      if (dates) return false;
      const d = WD1.find(x => x[0].split('|').includes(m[2]));
      const out = m[1] === 'pristi' ? addDays(today, (((8 - dow(today)) % 7) || 7) + (d[1] + 6) % 7) : addDays(today, (d[1] - dow(today) + 7) % 7);
      dates = { exact: true, out, back: null, label: `${d[2]} ${dm(out)}` };
    });

    // „od pátku do neděle“, „čt–ne“: odlet a návrat v ty dny, noci mezi nimi (před „v pátek“ – „do neděle“ není místo)
    const WG = [['nedele|nedeli|ne', 0, 'neděle'], ['pondeli|po', 1, 'pondělí'], ['utery|ut', 2, 'úterý'], ['stredy|stredu|st', 3, 'středa'], ['ctvrtka|ctvrtek|ct', 4, 'čtvrtek'], ['patku|patek|pa', 5, 'pátek'], ['soboty|sobotu|so', 6, 'sobota']];
    const wg = w => WG.find(x => x[0].split('|').includes(w));
    const WGA = WG.map(x => x[0]).join('|');
    rule(new RegExp(`(?:od\\s+)?(${WGA})\\.?\\s*(?:-|–|—|~|do|az)\\s*(${WGA})\\.?${W}`), m => {
      const a = wg(m[1]), b = wg(m[2]);
      // zkratky („pa–ne“) jen s pomlčkou, ne „po do …“
      if (!a || !b || a === b || ((m[1].length <= 2 || m[2].length <= 2) && !/[-–—~]/.test(m[0]))) return false;
      const n = (b[1] - a[1] + 7) % 7;
      len = { n, out: [a[1]], back: [b[1]] };
      chips.push(['🛫', `${a[2]} → ${b[2]}`]);
    });
    // „od pátku“ (bez dne návratu): odlet v ten den – ne místo odletu „pátku“
    rule(new RegExp(`od\\s+(nedele|pondeli|utery|stredy|ctvrtka|patku|soboty)${W}`), m => {
      const d = wg(m[1]);
      if (!d) return false;
      patch.outDays = [...new Set([...(patch.outDays || []), d[1]])].sort();
      chips.push(['🛫', `odlet ${['v neděli', 'v pondělí', 'v úterý', 've středu', 've čtvrtek', 'v pátek', 'v sobotu'][d[1]]}`]);
    });
    // „v pátek“: odlet v ten den v týdnu (jako dny odletu ve formuláři)
    const WD = [['nedeli', 0, 'neděli'], ['pondeli', 1, 'pondělí'], ['utery', 2, 'úterý'], ['stredu', 3, 'středu'], ['ctvrtek', 4, 'čtvrtek'], ['patek', 5, 'pátek'], ['sobotu', 6, 'sobotu']];
    rule(new RegExp(`(?:v|ve|o)\\s+(${WD.map(x => x[0]).join('|')})${W}`), m => {
      const d = WD.find(x => x[0] === m[1]);
      patch.outDays = [...new Set([...(patch.outDays || []), d[1]])].sort();
      chips.push(['🛫', `odlet v ${d[2]}`]);
    });
    // --- cena ---
    const price = (v, unit) => {
      let n = +String(v).replace(/[^\d]/g, '');
      if (unit) n *= 1000;
      return n >= 300 && n <= 500000 ? n : 0;
    };
    // € → Kč kurzem ze serveru (o.eurCzk), bez něj ~25 Kč; zaokrouhleno na stovky
    rule(new RegExp(`(?:(?:do|za|max(?:imalne)?|maximum|pod|nejvys(?:e)?|mam|mame|budget|rozpocet|rozpoctem)\\s*)?${AMT}\\s*(?:eur\\w*|€)${W}`), m => {
      const n = Math.round(+String(m[1]).replace(/[^\d]/g, '') * (o.eurCzk || 25) / 100) * 100;
      if (!(n >= 300 && n <= 500000) || patch.maxPrice) return false;
      patch.maxPrice = String(n);
    });
    // („mám 5000 na víkend“, „za 2 litry“ = 2 000 Kč)
    rule(new RegExp(`(?:do|za|max(?:imalne)?|maximum|pod|nejvys(?:e)?|levneji\\s+nez|budget|rozpocet|rozpoctem|mam|mame)\\s*${AMT}\\s*(tisic\\w*|tis\\.?|k|litr\\w*|liter)?\\s*(?:kc|korun\\w*|czk|,-)?${W}`), m => {
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
    rule(new RegExp(`(?:a\\s+|s\\s+)?(${NUM_RE})\\s*(?:deti|ditka|detmi|ditetem|dite)${W}|(?:s|se|a)\\s+(?:ditetem|ditkem|miminkem|dite|ditko|miminko)${W}`), m => {
      const k = m[1] ? num(m[1]) : 1;
      if (!(k >= 1 && k <= 6)) return false;
      kids = k;
    });
    // „s dětmi“ bez počtu: kolik jich je, nevím – jen se nebere jako místo a připomene upravit počet osob
    rule(new RegExp(`(?:s|se)\\s+(?:detmi|detma|deckama|ditkama)${W}|pro\\s+deti${W}`), () => { withKids = true; });
    rule(new RegExp(`s\\s+(?:pritelkyni|pritelem|partnerem|partnerkou|manzelkou|manzelem|holkou|klukem|zenou|muzem)${W}`), () => { people(2); });
    rule(new RegExp(`(?:primy|prime|primo|primym|primou|bez\\s+prestupu|bez\\s+prestupovani)${W}`), () => { patch.directOnly = true; });
    // „bez kufru“ před „kufr“ (jinak by „kufru“ znamenalo kufr k odbavení)
    rule(new RegExp(`(?:jen\\s+(?:s\\s+)?batoh\\w*|bez\\s+(?:velk\\w+\\s+)?kufr\\w*|bez\\s+(?:odbaven\\w+\\s+)?zavazad\\w*|jen\\s+(?:s\\s+)?(?:malym\\s+)?(?:batoh\\w*|taskou|kabelkou))${W}`), () => { patch.bags = 'none'; });
    rule(new RegExp(`(?:s\\s+)?(?:kabinov\\w*|prirucn\\w*)(?:\\s+(?:kufr\\w*|zavazad\\w*))?${W}|(?:s\\s+)?kufrik\\w*${W}`), () => { patch.bags = 'cabin'; });
    rule(new RegExp(`(?:s\\s+)?(?:velk\\w+\\s+)?kufr\\w*(?:\\s+k\\s+odbaveni)?${W}|odbaven\\w*\\s+zavazad\\w*${W}`), () => { patch.bags = patch.bags || 'checked'; });
    rule(new RegExp(`(?:jen\\s+tam|jednosmern\\w*|one\\s*way|bez\\s+zpatecni\\w*|bez\\s+navratu)${W}`), () => { patch.trip = 'oneway'; });
    rule(new RegExp(`(?:tam\\s+(?:i|a)\\s+zpet|zpatecni\\w*)${W}`), () => { patch.trip = 'return'; });

    // --- kam: k moři, za teplem, exotika, kamkoliv ---
    rule(new RegExp(`(?:(?:k|ke|na|u)\\s+)?(?:mori|more|moricku|moricko|plaz\\w*|koupat|koupani|pobrezi)${W}`), (m, at) => {
      if (/mor/.test(m[0]) && SEA_NAMES.test(s.slice(0, at))) return false; // Rudé moře = místo
      kind = kind || 'sea';
    });
    rule(new RegExp(`(?:za|do|na)?\\s*(?:tepl(?:o|a|em|e|eho|emu|ou|y|ych|ym|ymi|ejsi[a-z]*|eji|ot[a-z]*)|slunce|sluncem|slunicko|slunicka|slunickem|jih|jihu)${W}`), () => { kind = kind || 'warm'; patch.minTemp = Math.max(patch.minTemp || 0, 20); });
    rule(new RegExp(`(?:do\\s+)?(?:horka|horko|vedra|vedro)${W}`), () => { kind = kind || 'warm'; patch.minTemp = 25; });
    rule(new RegExp(`(?:do\\s+|na\\s+)?(?:exotik\\w*|exoticky\\w*|tropu|tropy|do\\s+dalky|daleko)${W}`), () => { kind = 'exotic'; });
    rule(new RegExp(`(?:kamkoliv|kamkoli|kdekoliv|kdekoli|nekam|cokoliv|kamkolvek)${W}`), () => { kind = kind || 'any'; });
    rule(new RegExp(`(?:na\\s+|do\\s+)?(?:hory|horach|hor|alpy|alp|alpach|alpami|lyze|lyzovat|lyzovani|lyzovack\\w*|lyzak\\w*|na\\s+snih)${W}`), () => { kind = kind || 'mountains'; });

    // --- zbytek věty: místa (z X = odkud, jinak kam) ---
    const to = [], from = [];
    let mode = 'to', cur = [], arrows = 0, soft = null, backNext = false;
    const back = []; // „a zpět z Neapole“: návrat z jiného místa
    const flush = () => { if (cur.length) (mode === 'from' ? from : mode === 'back' ? back : to).push(cur.join(' ')); cur = []; };
    const re = /[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*|[,/;&+>~]/gu;
    let m;
    while ((m = re.exec(s))) {
      const at = m.index, w = m[0], orig = raw.slice(at, at + w.length);
      if (used.slice(at, at + w.length).some(Boolean)) { flush(); continue; }
      // šipka: co bylo před ní (místo právě psané, jinak poslední „kam“), je odkud; za ní kam
      // (další šipka: „Praha → Řím → Barcelona“ – další místa jsou cíle, odkud je jen první)
      if (w === '>' || w === '~') {
        const n = from.length;
        arrows++; if (cur.length) { (from.length ? to : from).push(cur.join(' ')); cur = []; } else if (to.length && !from.length) from.push(to.pop()); mode = 'to';
        if (w === '~' && from.length > n) soft = from[from.length - 1];
        continue;
      }
      if (/^[,/;&+]$/.test(w) || w === 'a' || w === 'nebo' || w === 'ci') { flush(); backNext = false; continue; }
      // „zpět z X“ / „návrat z X“ (ne „tam a zpět“): X je místo návratu
      if (/^(?:zpet|zpatky|navrat\w*)$/.test(w)) { flush(); backNext = true; continue; }
      if (backNext && (w === 'z' || w === 'ze' || w === 'od')) { backNext = false; mode = 'back'; continue; }
      backNext = false;
      if (FROM_WORDS.has(w)) { flush(); mode = 'from'; continue; }
      if (TO_WORDS.has(w)) { flush(); mode = 'to'; continue; }
      // „město“ hned za slovem názvu patří k němu („Nové Město“, „do Nového Města“) – samotné („do města“) ne
      if ((FILL.has(w) && !(cur.length && /^mest[aeou]?$|^mestem$/.test(w))) || /^\d+$/.test(w)) { flush(); continue; }
      cur.push(orig);
    }
    flush();
    // pomlčka bez místa za ní („Řím – víkend“) nebyla odkud → kam: místo před ní je cíl
    if (soft && !to.length && !kind && from.length === 1) { to.push(from.pop()); arrows--; }

    if (kids) patch.adults = Math.min(9, (patch.adults || 2) + kids);
    // --- délka → noci a dny odletu ---
    const P = o.presets || {};
    if (typeof len === 'string') {
      patch.len = len;
      // den odletu z věty („v pátek na týden“, „od soboty na týden“) přednost před dny délky
      if (P[len]) Object.assign(patch, { nMin: P[len].nMin, nMax: P[len].nMax, outDays: patch.outDays && patch.outDays.length ? patch.outDays : P[len].out.slice(), backDays: P[len].back.slice() });
    } else if (len && len.n) Object.assign(patch, { len: 'custom', nMin: len.n, nMax: len.n, outDays: len.out || patch.outDays || [], backDays: len.back || [] });

    // --- termín → pole formuláře ---
    // svátek a k němu delší pobyt („na Silvestra na týden“): odlet v okolí svátku s tou délkou, ne prodloužený víkend
    if (dates && dates.holiday && (len === 'week' || len === '2weeks' || (len && len.n >= 4))) {
      dates = { from: [addDays(today, 1), addDays(dates.holiday.start, -3)].sort()[1], to: dates.holiday.start, label: dates.label };
    }
    if (dates && dates.holiday) {
      Object.assign(patch, { dateMode: 'flex', trip: patch.trip || 'return', len: 'holiday', ...o.holidayDates(dates.holiday, today) });
      chips.push(['📅', dates.label]);
    } else if (dates && dates.exact) {
      const n = patch.nMin != null ? Math.round((patch.nMin + patch.nMax) / 2) : 7;
      const back = dates.back || (patch.trip === 'oneway' ? null : addDays(dates.out, n));
      Object.assign(patch, { dateMode: 'exact', xOut: dates.out, xFlex: 0, ...(back ? { xBack: back } : {}) });
      if (!dates.back && !back) patch.trip = 'oneway';
      delete patch.outDays; delete patch.backDays;
      // návrat dopočtený z délky (bez délky týden) – v čipu vidět („Řím 3 noci od 5.12.“ = 5. 12. – 8. 12.)
      // („zítra“, „pátek 23. 10.“ i s dopočteným návratem: „zítra – 26. 10.“)
      chips.push(['📅', dates.label ? `${dates.label}${back && !dates.back ? ` – ${dm(back)}` : ''}` : back ? `${dm(dates.out)} – ${dm(back)}` : dm(dates.out)]);
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
    else if (kind === 'aurora') items = AURORA.map(([iata, label, flag]) => ({ id: `ap:${iata}`, label, flag, type: 'airport' }));
    if (kind) chips.unshift([{ sea: '🏖️', warm: '☀️', exotic: '🌴', any: '🌍', mountains: '🏔️', aurora: '🌌' }[kind], { sea: 'k moři', warm: patch.minTemp >= 25 ? 'do horka' : 'za teplem', exotic: 'exotika', any: 'kamkoliv', mountains: 'na hory', aurora: 'polární záře' }[kind]]);
    if (patch.maxPrice) chips.push(['💰', `do ${czk(+patch.maxPrice)}`]);
    if (patch.adults) chips.push(['👥', `${patch.adults} ${patch.adults === 1 ? 'osoba' : patch.adults < 5 ? 'osoby' : 'osob'}${kids ? ' vč. dětí' : ''}`]);
    if (withKids && !kids && !patch.adults) chips.push(['🧒', 's dětmi – počet osob uprav']);
    if (patch.directOnly) chips.push(['✈️', 'jen přímé']);
    if (patch.bags) chips.push(['🧳', { none: 'bez kufru', cabin: 'kabinový kufr', checked: 'kufr k odbavení' }[patch.bags]]);
    if (patch.trip === 'oneway') chips.push(['➡️', 'jen tam']);
    // „Praha → Řím → Barcelona → Praha“: dvě a víc šipek = cesta přes víc měst (odkud, pak místa v pořadí)
    const chain = arrows >= 2 && from.length === 1 && to.length >= 2 && !kind;
    return { chips: chips.map(([i, t]) => ({ icon: i, text: t })), patch, to, from, kind, items, ...(chain ? { chain: true } : {}), ...(back.length === 1 && to.length === 1 && !kind && !chain ? { back: back[0] } : {}) };
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
   * typos = true: i opravy překlepů ze serveru (fuzzy) – volající je zkouší až po všem ostatním.
   */
  function bestPlace(list, typos = false) {
    let best = null;
    // přesná shoda celého slova („Malaga“ = Málaga) má přednost před zkráceným tvarem („Mala…“ → Malajsie)
    const full = list[0] ? fold(list[0].q).replace(/\s+/g, ' ') : '';
    for (const { q, items } of list) {
      const fq = fold(q).replace(/\s+/g, ' ');
      for (const it of items || []) {
        const lab = fold(String(it.label || '')).replace(/\s*\(.*\)$/, '');
        // i jiný název místa ze serveru: anglický (en – „Rome“, „Tuscany“) nebo místní (aliases – „Roma“, „Toscana“)
        const alt = [...(it.aliases || []), ...(it.en ? [it.en] : [])].map(a => fold(a));
        const ok = lab.startsWith(fq) || lab.split(/[\s-]+/).some(p => p.startsWith(fq)) || alt.some(a => a.startsWith(fq));
        // typos: i místo, které server našel jako opravu překlepu (fuzzy)
        if (!ok && !(typos && it.fuzzy)) continue;
        const geo = /^geo:/.test(it.id || '');
        const exact = lab === full || alt.includes(full);
        const score = (ok ? 0 : 500) + (geo ? 100 : 0) + (exact ? -50 : 0) + (TYPE_RANK[it.type] ?? 7) * 10 - fq.length / 100;
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
    take(new RegExp(`(?:jednodenni\\s+)?(?:vylet\\w*|do\\s+okoli)${W}|(?:v\\s+)?okoli${W}`), () => { mode = mode || 'day'; });
    // „co vidět v Římě“, „Řím co navštívit“, „co dělat v Londýně“: slova otázky nejsou místo
    take(new RegExp(`(?:co|kam|jak)\\s+(?:videt|navstivit|delat|zazit|podniknout|stoji\\s+za\\s+to|jit|zajit)${W}|(?:zajimav\\w*|tipy|tip|doporuceni)${W}`), () => {});
    take(new RegExp(`(\\d{1,3})\\s*km${W}`), m => { km = +m[1]; });
    take(new RegExp(`(?:na\\s+)?(${NUM_RE})\\s*(?:den|dny|dni|dnu)${W}`), m => { const n = num(m[1]); if (!(n >= 1 && n <= 14)) return false; days = n; });
    take(new RegExp(`(?:(?:na|o|pres)\\s+)?(?:prodlouzen\\w+\\s+)?vikend\\w*${W}`), m => { days = days || (/prodlouz/.test(m[0]) ? 3 : 2); });
    // „příští týden“ je kdy (začátek), ne délka – nechat pro parse()
    take(new RegExp(`(?:na\\s+)?(?:cely\\s+)?tyden${W}`), m => { if (/(?:pristi|dalsi|tento|tenhle)\s+$/.test(s.slice(0, m.index))) return false; days = days || 7; });
    take(new RegExp(`(?:s|se)\\s+(?:detmi|ditetem|ditkem|deckama)${W}|pro\\s+deti${W}`), () => { interests.push('kids'); });
    take(new RegExp(`(?:muze\\w*|galeri\\w*|umeni)${W}`), () => { interests.push('art'); });
    take(new RegExp(`(?:pamatk\\w*|histori\\w*|hrad\\w*|zamk\\w*|zamek)${W}`), () => { interests.push('history'); });
    take(new RegExp(`(?:prirod\\w*|vyhled\\w*)${W}`), () => { interests.push('nature'); });
    const p = parse(blank.join(''), o), pt = p.patch;
    let start = pt.xOut || pt.dFrom || null;
    // „od pátku do neděle“: dny = noci + 1, začátek nejbližší ten den v týdnu (dnes, je-li to on)
    if (!days && pt.len === 'custom' && pt.nMin) days = Math.min(14, pt.nMin + 1);
    if (!start && pt.outDays && pt.outDays.length === 1) { const t = o.today || ymd(new Date()); start = addDays(t, (pt.outDays[0] - dow(t) + 7) % 7); }
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
