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

  // i 7. pád („se dvěma dětmi“, „s jedním dítětem“) – jinak by z „dvěma dětmi“ bylo místo a děti by se nepočítaly
  const NUM = { jeden: 1, jedna: 1, jedno: 1, jednu: 1, jednoho: 1, jednim: 1, dva: 2, dve: 2, dvou: 2, dvema: 2, tri: 3, trech: 3, tremi: 3, ctyri: 4, ctyrech: 4, ctyrmi: 4, pet: 5, peti: 5, sest: 6, sesti: 6, sedm: 7, sedmi: 7, osm: 8, osmi: 8, devet: 9, deviti: 9, deset: 10, jedenact: 11, dvanact: 12, trinact: 13, ctrnact: 14 };
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
  // oblasti z víc zemí („na Balkán“, „do Skandinávie“, „Pobaltí“) – hledání do těch zemí (místa by našla nesmysl:
  // „Balkán“ letiště Balkanabat v Turkmenistánu, „Skandinávie“ nic)
  const GROUPS = {
    balkan: ['Balkán', [['HR', 'Chorvatsko', '🇭🇷'], ['ME', 'Černá Hora', '🇲🇪'], ['AL', 'Albánie', '🇦🇱'], ['RS', 'Srbsko', '🇷🇸'], ['BA', 'Bosna a Hercegovina', '🇧🇦']]],
    skandinavie: ['Skandinávie', [['NO', 'Norsko', '🇳🇴'], ['SE', 'Švédsko', '🇸🇪'], ['DK', 'Dánsko', '🇩🇰'], ['FI', 'Finsko', '🇫🇮']]],
    pobalti: ['Pobaltí', [['LT', 'Litva', '🇱🇹'], ['LV', 'Lotyšsko', '🇱🇻'], ['EE', 'Estonsko', '🇪🇪']]],
  };
  const AURORA = [['TOS', 'Tromsø', '🇳🇴'], ['RVN', 'Rovaniemi', '🇫🇮'], ['KTT', 'Kittilä', '🇫🇮'], ['KEF', 'Reykjavík', '🇮🇸']];
  const EXOTIC = [['TH', 'Thajsko', '🇹🇭'], ['ID', 'Indonésie', '🇮🇩'], ['VN', 'Vietnam', '🇻🇳'], ['AE', 'Spojené arabské emiráty', '🇦🇪'], ['LK', 'Srí Lanka', '🇱🇰']];

  // slova, která místo neurčují (zbytek věty po vyřazení rozpoznaných obratů)
  const FILL = new Set(('nekdy kdykoli kdykoliv chci chtel chtela chteli chtela chceme chtej bych bychom rad rada radi letet letim letime poletim poletime poletet let letem lety letenka letenky letenku letadlem '
    + 'levne levny levnou levna levnej nejlevneji nejlevnejsi hledam hledame najdi najit ukaz jet jedu jedeme pojedu pojedeme cesta cestu cesty dovolena dovolenou dovolene '
    + 'vylet vyletu i pro nas me mi my ja jsem nejak nejaky nejakou nejake termin terminu okolo kolem cca asi prosim potrebuji potrebujem idealne klidne treba zase ten ta '
    + 'to tento tenhle ktery nebo az ale jen jenom jeste uz nejlepe mozna nam vam si se nejlevnejsi nejlepsi super hezky hezkou nekde nekam kam odkud kdy kdyz tak taky take '
    + 'tam zpet zpatky domu letadlo letadla mesto mesta kde neco nejakeho nejakem nejakou je jsou bude budou nez all inclusive allinclusive kg kilo kil kila '
    // proč a jak levně („na svatbu do Milána“, „na trhy“, „za babku“) – místo to není
    + 'svatbu svatba svatbe koncert koncertu festival festivalu zapas zapasu konferenci konference oslavu oslavy narozeniny navstevu trhy trh '
    + 'nakupy nakupum vylety s batohem batoh rande sluzebne sluzebni pracovne pracovni co par korun babku hubicku bez '
    // za čím a jak („kam za kulturou“, „na safari do Keni“, „sever Španělska“, „Portugalsko autem“)
    + 'safari kultura kulturu kulturou kulturni pamatky pamatkami zabava zabavu zabavou party jidlem jidlo gastro vinem vino '
    + 'sever severu zapad zapadu vychod vychodu autem vlakem autobusem busem zajezd zajezdy zajezdu pobyt pobytu pobyty ne '
    + 'romanticky romanticka romanticke romantickou romantiku relax relaxacni odpocinek odpocinkovy mam mame '
    // „do 2000 na osobu“, „s rodinou“, „oba“ (jinak z „osobu“ Osorno, z „rodinu“ místo)
    + 'osobu osobe osoba hlavu rodina rodinu rodinou oba obe celou cela cely '
    // „odkudkoliv do Londýna“, „z okolí Brna“, „z domova“ – odkud je domov (s okruhem), ne místo „okolí Brna“
    + 'odkudkoliv odkudkoli okoli domova doma ted '
    // „potřebuju“, „na výročí“, „rok v Austrálii“, „z toho 2 děti“, „pátek 20.11. – neděle 22.11.“ – dřív místa
    + 'potrebuju potrebujeme vyroci rok krajin toho pondeli utery streda ctvrtek patek sobota nedele '
    // „odlet 20.11. návrat 25.11.“ – slova u data (dřív místo „odlet“)
    + 'odlet odletu odletem prilet priletu navrat navratu vracim vracime vratim vratime kocarkem kocarek '
    // s kým („s přáteli do Paříže“, „s partou na hory“, „s mámou a tátou“) – dřív z toho bylo místo cesty
    + 'pratele prateli pratelama kamaradi kamarady kamaradama kamaradkami kamaradkama kamosi kamosema kamose partou parta partu '
    + 'kolegy kolegou kolegyni kolegynemi kolegama holkama klukama holkami kluky rodici rodicema babickou dedou dedeckem '
    + 'psem pejskem mamou tatou mamkou tatkou synem dcerou klukem holkou zenou muzem manzelkou manzelem partnerem partnerkou pritelem pritelkyni').split(' '));
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
    let soonWk = false, kind = null, group = null, month = null, dates = null, len = null, kids = 0, babies = 0, teens = 0, withKids = false;
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
    /*
     * Druhé samostatné datum ve větě je návrat (dates.back). Den dřív než odlet = data napsaná obráceně, nebo pořadí
     * pravidel (číselné „18.11.“ projde celou větu dřív než „15. listopadu“) → prohodit; do příštího roku jen přes Nový
     * rok („28.12. – zpět 3.1.“, nejvýš 45 nocí) – dřív „odlet 15. listopadu, návrat 18.11.“ = 18. 11. 2026 – 15. 11. 2027.
     */
    const second = (d, mo, y, at, end) => {
      const yr = y ? +y : +dates.out.slice(0, 4), same = mkDate(d, mo, yr);
      if (!same) return false;
      // „Řím 20.11. nebo 27.11.“: dvě možnosti odletu, ne tam a zpět → odlet kdykoli mezi nimi (nejvýš 45 dní); „nebo“
      // mezi oběma daty v kterémkoli pořadí ve větě (číselné datum projde větu dřív než „20. listopadu“) – jen „nebo“ přímo
      // mezi nimi bez „zpět / návrat“ („nebo až 27.11.“, „(nebo 27.11.)“): „20.11. Řím nebo Milán, zpět 27.11.“ je tam
      // a zpět (nebo mezi místy)
      const gap = dates.at == null ? null : at > dates.at ? s.slice(dates.end ?? at, at) : s.slice(end ?? dates.at, dates.at);
      const or = g => /(?:^|[^a-z])(?:nebo|ci)(?=[^a-z]|$)/.test(g) && !/(?:^|[^a-z])(?:zpet|zpatky|navrat\w*)(?=[^a-z]|$)/.test(g);
      // „20.11. do Říma nebo Milána a 27.11. zpátky“: za pozdějším datem „zpátky / zpět“ (bez dalšího data) = návrat,
      // i když je mezi daty „nebo“ (mezi místy)
      const lateEnd = at > (dates.at ?? -1) ? end : dates.end, retAfter = lateEnd != null && /^[\s,]*(?:a\s+)?(?:zpet|zpatky|navrat\w*)(?![\s,:]*\d)/.test(s.slice(lateEnd));
      if (retAfter) { /* návrat – níž */ } else if (gap != null ? or(gap) : /(?:^|[^a-z])(?:nebo|ci)\s*$/.test(s.slice(0, at))) {
        const o = dates.out, x = same >= o ? same : !y && mkDate(d, mo, yr + 1);
        const [from, to] = [o, same >= today ? same : x].filter(Boolean).sort();
        if (!to || from === to || (Date.parse(to) - Date.parse(from)) / 864e5 > 45) return false;
        dates = { from, to, label: `${dm(from)} – ${dm(to)}` };
        return true;
      }
      // dřív ve větě a bez roku („odlet 28. prosince, návrat 3.1.“ – číselné 3.1. prošlo větu první, rok 2027): odlet
      // v roce před návratem, ne 28. 12. 2027
      if (!y && dates.at != null && at < dates.at && same > dates.out) {
        const prev = mkDate(d, mo, yr - 1);
        if (prev && prev >= today && prev < dates.out && (Date.parse(dates.out) - Date.parse(prev)) / 864e5 <= 45) { dates = { exact: true, out: prev, back: dates.out, at, end: dates.end }; return true; }
      }
      if (same > dates.out) { dates.back = same; return true; }
      if (same === dates.out) return false;
      // dřívější den: prohodit (data obráceně), nebo návrat příští rok – podle toho, co dá kratší cestu („28.12. – zpět
      // 3.1.“ i v lednu příští rok; „1.12. a zpět 28.2.“ návrat v únoru, i když je to přes 45 nocí – ne tichých 7 nocí)
      const nx = !y && mkDate(d, mo, yr + 1);
      const sw = same >= today ? Date.parse(dates.out) - Date.parse(same) : Infinity, nl = nx ? Date.parse(nx) - Date.parse(dates.out) : Infinity;
      if (sw === Infinity && nl === Infinity) return false;
      if (nl <= sw) dates.back = nx;
      else { dates.back = dates.out; dates.out = same; }
      return true;
    };
    // „mezi 10. a 20. listopadem“, „mezi 10. 11. a 20. 11.“: odlet kdykoli v tom rozmezí, ne přesná data tam a zpět
    // (dřív z toho bylo místo „mezi listopadem“)
    const MINS = ['lednem', 'unorem', 'breznem', 'dubnem', 'kvetnem', 'cervnem', 'cervencem', 'srpnem', 'zarim', 'rijnem', 'listopadem', 'prosincem'];
    rule(new RegExp(`mezi\\s+(\\d{1,2})\\.\\s*(?:(\\d{1,2})\\.\\s*)?a\\s+(\\d{1,2})\\.\\s*(?:(\\d{1,2})\\.?|(${MINS.join('|')}))${W}`), m => {
      const mb = m[4] ? +m[4] : MINS.indexOf(m[5]) + 1, ma = m[2] ? +m[2] : mb;
      // rozmezí, které už začalo („mezi 1. a 15. listopadem“ 5. 11.), platí od dneška – ne až za rok (jako „v listopadu“)
      const y0 = +today.slice(0, 4), a0 = mkDate(m[1], ma, y0), b0 = a0 && mkDate(m[3], mb, mb < ma ? y0 + 1 : y0);
      const now = Boolean(b0 && b0 >= today && b0 >= a0);
      const a = now ? [a0, today].sort()[1] : mkDate(m[1], ma), b = now ? b0 : a && mkDate(m[3], mb, mb < ma ? +a.slice(0, 4) + 1 : a.slice(0, 4));
      if (!a || !b || b < a || dates) return false;
      dates = { from: a, to: b, label: `${dm(a)} – ${dm(b)}` };
    });
    // „4.–6. 12. nebo 11.–13. 12.“: dva termíny se stejnou délkou (± 1 noc) → odlet v jeden z obou dnů, délka z nich
    // (dřív druhý termín tiše zahozený); druhý nejvýš 60 dní po prvním
    const orRange = (a, b, at) => {
      if (!dates || !dates.exact || !dates.back || dates.end == null || a <= dates.out) return false;
      if (!/^[\s,(]*(?:nebo|ci)[\s,(]*$/.test(s.slice(dates.end, at))) return false;
      const nd = (x, y) => Math.round((Date.parse(y) - Date.parse(x)) / 864e5), n1 = nd(dates.out, dates.back), n2 = nd(a, b);
      if (Math.abs(n1 - n2) > 1 || nd(dates.out, a) > 60) return false;
      len = { n: Math.min(n1, n2), lo: Math.min(n1, n2), hi: Math.max(n1, n2), out: [...new Set([dow(dates.out), dow(a)])], back: [...new Set([dow(dates.back), dow(b)])] };
      dates = { from: dates.out, to: a, label: `${dm(dates.out)} – ${dm(dates.back)} nebo ${dm(a)} – ${dm(b)}` };
      return true;
    };
    rule(new RegExp(`(?:od\\s*)?(\\d{1,2})\\.\\s*(\\d{1,2})\\.?(?:\\s*(20\\d\\d))?(?:\\s*(?:-|–|az|do)\\s*(\\d{1,2})\\.\\s*(\\d{1,2})\\.?(?:\\s*(20\\d\\d))?)?${W}`), (m, at) => {
      const a = mkDate(m[1], m[2], m[3]);
      // „3.–10. 6.“: konec rozsahu dnů ve stejném měsíci – patří pravidlu níž
      if (!a || (!m[4] && /\b\d{1,2}\.?\s*(?:-|–|az|do)\s*$/.test(s.slice(0, at)))) return false;
      const b = m[4] ? mkDate(m[4], m[5], m[6] || (+m[5] < +m[2] ? +a.slice(0, 4) + 1 : a.slice(0, 4))) : null;
      if (m[4] && (!b || b < a)) return false;
      // druhé samostatné datum („15.11. a zpět 18.11.“, „odlet 20.11. návrat 25.11.“) je návrat – dřív přepsalo odlet
      if (!b && dates && dates.exact && dates.out && !dates.back) return second(m[1], m[2], m[3], at, at + m[0].length) ? undefined : false;
      if (b && dates) return orRange(a, b, at) ? undefined : false;
      // třetí datum („a zpět 27.11. nebo 28.11.“) termín z prvních dvou nepřepíše
      if (dates) return false;
      dates = { exact: true, out: a, back: b, at, end: at + m[0].length };
    });

    // (i „5-9.12.“ bez tečky za prvním dnem)
    rule(new RegExp(`(?:od\\s*)?\\b(\\d{1,2})\\.?\\s*(?:-|–|az|do)\\s*(\\d{1,2})\\.\\s*(\\d{1,2})\\.?(?:\\s*(20\\d\\d))?${W}`), (m, at) => {
      const b = mkDate(m[2], m[3], m[4]), a = b && mkDate(m[1], m[3], m[4] || b.slice(0, 4));
      if (!a || !b || b < a) return false;
      if (dates && dates.exact) return orRange(a, b, at) ? undefined : false;
      dates = { exact: true, out: a, back: b, at, end: at + m[0].length };
    });
    // „20. listopadu“, „od 3. do 7. prosince“, „3.–7. prosince“: dny se jménem měsíce (2. pád)
    const MGEN = ['ledna', 'unora', 'brezna', 'dubna', 'kvetna', 'cervna', 'cervence', 'srpna', 'zari', 'rijna', 'listopadu', 'prosince'];
    rule(new RegExp(`(?:od\\s*)?(\\d{1,2})\\.?\\s*(?:(?:-|–|az|do|nebo|ci)\\s*(\\d{1,2})\\.?\\s*)?(${MGEN.join('|')})(?:\\s*(20\\d\\d))?${W}`), (m, at) => {
      const mo = MGEN.indexOf(m[3]) + 1;
      // „odlet 20. listopadu, návrat 25. listopadu“: druhé samostatné datum je návrat (jako u „15.11. a zpět 18.11.“)
      if (!m[2] && dates && dates.exact && dates.out && !dates.back) return second(m[1], mo, m[4], at, at + m[0].length) ? undefined : false;
      if (dates && dates.exact) return false;
      const b = m[2] ? mkDate(m[2], mo, m[4]) : null, a = mkDate(m[1], mo, m[4] || (b ? b.slice(0, 4) : undefined));
      if (!a || (m[2] && (!b || b < a))) return false;
      // „20. nebo 27. listopadu“: dvě možnosti odletu → odlet kdykoli mezi nimi (jako „20.11. nebo 27.11.“)
      if (m[2] && /(?:nebo|ci)\s*\d/.test(m[0])) { dates = { from: a, to: b, label: `${dm(a)} – ${dm(b)}` }; return; }
      dates = { exact: true, out: a, back: b, at, end: at + m[0].length };
    });
    // --- za týden / za 14 dní = kdy (ne jak dlouho) ---
    rule(new RegExp(`za\\s+(?:(${NUM_RE})\\s*)?(tyden|tydny|tydnu|den|dny|dni|dnu)${W}`), m => {
      const n = m[1] ? num(m[1]) : 1, d = /^ty/.test(m[2]) ? n * 7 : n;
      if (!(d >= 1 && d <= 120)) return false;
      dates = dates || { from: addDays(today, Math.max(0, d - 3)), to: addDays(today, d + 4), label: `za ${m[1] ? `${n} ` : ''}${m[2] === 'tyden' ? 'týden' : m[2].replace('tydn', 'týdn').replace('dni', 'dní')}` };
    });
    // „první / druhý / poslední víkend v prosinci“, „první týden v lednu“: jen ten týden měsíce (dřív z „první“ bylo místo
    // a termín celý měsíc). Víkend = odlet čt–so jako u „příští víkend“, týden = odlet v těch 7 dnech.
    const ORD = { prvni: [1, 'první'], druhy: [2, 'druhý'], treti: [3, 'třetí'], ctvrty: [4, 'čtvrtý'], posledni: [-1, 'poslední'] };
    rule(new RegExp(`(?:na\\s+|o\\s+|v\\s+)?(${Object.keys(ORD).join('|')})\\s+(vikend|tyden)\\s+(?:v|ve)\\s+(${MONTH_FORMS.map(x => x[0]).join('|')})${W}`), m => {
      if (dates) return false;
      const k = MONTH_OF[m[3]], [n, word] = ORD[m[1]], wk = m[2] === 'vikend';
      const span = y => {
        const ym = `${y}-${pad(k + 1)}-`, last = lastDay(y, k);
        if (!wk) return n < 0 ? [ym + pad(last - 6), ym + pad(last)] : [ym + pad(n * 7 - 6), ym + pad(n * 7)];
        const sat1 = 1 + (6 - dow(ym + '01') + 7) % 7, satL = last - (dow(ym + pad(last)) + 1) % 7, sat = n < 0 ? satL : sat1 + 7 * (n - 1);
        return sat > last ? null : [addDays(ym + pad(sat), -2), ym + pad(sat)]; // čtvrtek může být ještě v minulém měsíci
      };
      let y = +today.slice(0, 4), r = span(y);
      if (r && r[1] < today) r = span(++y);
      if (!r) return false;
      dates = { from: r[0] < today ? today : r[0], to: r[1], label: `${word} ${wk ? 'víkend' : 'týden'} ${MGEN_CZ[k]}` };
      if (wk) len = 'weekend'; else len = len || 'week';
    });
    // --- délka pobytu ---
    // „na nejbližší prodloužený víkend“, „nejbližší svátky / volno“: první ze seznamu prodloužených víkendů (jako 🎉 Svátky)
    // – dřív „nejbližší“ jako místo a termín žádný
    rule(new RegExp(`(?:na\\s+|o\\s+|pres\\s+)?(?:nejblizsi|nejbližší)\\s+(?:prodlouzen\\w+\\s+vikend\\w*|svatk\\w*|svatky|volno|volnu)${W}`), () => {
      const lw = (o.holidays || [])[0];
      if (dates || !lw || !o.holidayDates) return false;
      dates = { holiday: lw, label: lw.name };
    });
    rule(new RegExp(`(?:na\\s+)?(?:prodlouzen[yeyj]+|dlouh[yej]+)\\s+vikend\\w*${W}`), () => { len = 'long'; });
    // odlet čt–so nejbližšího víkendu (v neděli už ten příští)
    const thisWk = () => ({ from: today, to: addDays(today, (6 - dow(today) + 7) % 7), label: 'tento víkend' });
    rule(new RegExp(`(?:na\\s+)?(?:tento|tenhle|tenhleten|nejblizsi)\\s+vikend${W}|o\\s+vikendu${W}`), m => {
      len = 'weekend';
      // „o víkendu“ jen délka, když věta termín má i jinde („v prosinci o víkendu“, „adventní trhy … o víkendu“) –
      // dřív vyhrál tento víkend a prosinec se zahodil; bez jiného termínu nejbližší víkend (doplní se po termínech níž)
      if (/^o\s/.test(m[0])) { soonWk = true; return; }
      dates = dates || thisWk();
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
    rule(new RegExp(`(?:na\\s+)?(?:vikend|weekend)\\w*${W}`), () => { len = len || 'weekend'; });
    rule(new RegExp(`(?:na\\s+)?(${NUM_RE})\\s*(?:noc|noci|nocich)${W}`), m => { const n = num(m[1]); if (!(n >= 1 && n <= 30)) return false; len = { n }; });
    // „na 10 dní“, „na 3 týdny“ je přibližná délka (jako „na 2 týdny“): od 5 nocí pár nocí na obě strany, kratší přesně
    const about = k => { const d = k <= 4 ? 0 : k <= 6 ? 1 : k <= 10 ? 2 : 3; return { n: k, lo: Math.max(1, k - d), hi: Math.min(30, k + d) }; };
    rule(new RegExp(`(?:na\\s+)?(${NUM_RE})\\s*(?:den|dny|dni|dnu)${W}`), m => { const n = num(m[1]); if (!(n >= 1 && n <= 31)) return false; len = n === 14 ? '2weeks' : about(Math.max(1, n - 1)); });
    rule(new RegExp(`(?:na\\s+)?(${NUM_RE})\\s*tydn[uy]?${W}`), m => { const n = num(m[1]); if (!(n >= 1 && n <= 4)) return false; len = n === 1 ? 'week' : n === 2 ? '2weeks' : about(n * 7); });
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
    // („na začátku / na konci / ke konci / uprostřed prosince“ – jinak by z „začátku“ bylo místo)
    const PART = [[/zacat|pocat/, 1, 10, 'začátek'], [/pul|polov|uprostred/, 10, 20, 'polovina'], [/kon/, 20, 31, 'konec']];
    rule(new RegExp(`(?:(do\\s+konce|na\\s+zacatku|na\\s+pocatku|na\\s+konci|ke\\s+konci|uprostred|v|ve|na|behem|koncem|konec|zacatkem|zacatek|pocatkem|polovinou|polovina|v\\s+polovine|v\\s+pulce|pulka|od|do)\\s+)?(${MONTH_FORMS.map(x => x[0]).join('|')})${W}`), m => {
      const k = MONTH_OF[m[2]], r = monthRange(k);
      // měsíc navíc k datu v něm („Řím 4.–6. 12. v prosinci“, „12. 11. v listopadu“): jen spolknout – dřív „prosinci“ jako místo
      if (dates && !dates.month) { const d = dates.out || dates.from || (dates.holiday && dates.holiday.start) || ''; return +d.slice(5, 7) - 1 === k && !m[1]?.startsWith('do') ? undefined : false; }
      if (dates && dates.month) { dates.to = monthRange(k).to; dates.label = `${dates.label}–${MONTHS[k]}`; month = month ?? k; return; } // „v květnu a červnu“
      month = k;
      if (/^do\s+konce/.test(m[1] || '')) { dates = { from: today, to: r.to, month: true, label: `do konce ${MGEN_CZ[k]}` }; return; }
      const part = PART.find(x => x[0].test(m[1] || ''));
      if (part) {
        const ym = r.to.slice(0, 8), from = ym + pad(part[1]), to = ym + pad(Math.min(part[2], +r.to.slice(8)));
        if (to >= today) { dates = { from: from < today ? today : from, to, month: true, label: `${part[3]} ${MGEN_CZ[k]}` }; return; }
      }
      dates = { ...r, month: true, label: MONTHS[k] };
    });
    // „do konce roku / měsíce“: odlet kdykoli od dneška do konce roku (měsíce)
    rule(new RegExp(`(?:nekdy\\s+)?do\\s+konce\\s+(roku|mesice|tohoto\\s+mesice)${W}`), m => {
      if (dates) return false;
      const y = +today.slice(0, 4), mo = +today.slice(5, 7) - 1;
      dates = m[1] === 'roku' ? { from: today, to: `${y}-12-31`, label: 'do konce roku' } : { from: today, to: `${today.slice(0, 8)}${pad(lastDay(y, mo))}`, label: 'do konce měsíce' };
    });
    // nejbližší výskyt pevného období v roce (měsíc-den od–do), které ještě neskončilo – a nekončí do 2 dnů: „na podzimní
    // prázdniny“ v neděli 1. 11. dřív dalo odlet jen 1. 11. se dny odletu st–pá → žádný let (jako svátky: holidayList)
    const nextSpan = (a, b, label) => { let y = +today.slice(0, 4); if (`${y}-${b}` < addDays(today, 2)) y++; const from = `${y}-${a}`; return { from: from < today ? today : from, to: `${y}-${b}`, label }; };
    // jarní / podzimní prázdniny (ne letní): jarní se liší podle okresu – únor až polovina března
    rule(new RegExp(`(?:na\\s+|o\\s+)?(?:jarni|jarnich)\\s+prazdnin\\w*${W}`), () => { if (dates) return false; dates = nextSpan('02-01', '03-20', 'jarní prázdniny'); len = len || 'week'; });
    rule(new RegExp(`(?:na\\s+|o\\s+)?(?:podzimni|podzimnich)\\s+prazdnin\\w*${W}`), () => { if (dates) return false; dates = nextSpan('10-24', '11-01', 'podzimní prázdniny'); len = len || 'long'; });
    // Mikuláš (5. 12.): víkend kolem něj; jen „na / o Mikuláše“ – „do Liptovského Mikuláše“ je místo
    rule(new RegExp(`(?:na|o)\\s+mikulas(?:e|i)?${W}`), () => { if (dates) return false; dates = nextSpan('12-03', '12-06', 'Mikuláš'); len = len || 'weekend'; });
    // Valentýn: prodloužený víkend kolem 14. 2.
    rule(new RegExp(`(?:na\\s+|o\\s+)?valentyn\\w*${W}`), () => { if (dates) return false; dates = nextSpan('02-12', '02-14', 'Valentýn'); len = len || 'weekend'; });
    // pololetní prázdniny: pátek na přelomu ledna a února – prodloužený víkend
    rule(new RegExp(`(?:na\\s+|o\\s+)?(?:pololetni|pololetnich)\\s+prazdnin\\w*${W}`), () => { if (dates) return false; dates = nextSpan('01-28', '02-03', 'pololetní prázdniny'); len = len || 'long'; });
    const seasons = [['(?:(?:o|na|pres)\\s+)?letni\\w*\\s+prazdnin\\w*|(?:v\\s+)?lete|leto|letni|o\\s+prazdninach|prazdniny|na\\s+leto', 5, 7, 'léto'], ['(?:na\\s+)?jare|jaro', 2, 4, 'jaro'], ['(?:na\\s+)?podzim\\w*', 8, 10, 'podzim'], ['(?:v\\s+)?zime|zima|na\\s+zimu|zimni', 11, 13, 'zima']];
    for (const [re, a, b, label] of seasons) {
      rule(new RegExp(`(?:${re})${W}`), (m, at) => {
        // „v létě o prázdninách“: druhé období jen spolknout (jinak by „o prázdninách“ zůstalo jako místo)
        if (dates) return dates.season ? undefined : false;
        // vánoční / velikonoční „prázdniny“ nejsou letní (ty bere Vánoce / Velikonoce níž)
        if (/^prazdnin/.test(m[0]) && /(?:vanocni|velikonocni|pololetni|jarni|podzimni)\s+$/.test(s.slice(0, at))) return false;
        const pr = /prazdnin/.test(m[0]), A = pr ? 6 : a, Bm = pr ? 7 : b, cm = +today.slice(5, 7) - 1;
        // období právě běží (podzim v říjnu) → od dneška do jeho konce; jinak nejbližší celé (zima přes Nový rok)
        const inNow = (cm >= A && cm <= Bm) || (Bm > 11 && cm <= Bm - 12);
        const start = inNow ? today : monthRange(A % 12).from, sy = +start.slice(0, 4), sm = +start.slice(5, 7) - 1;
        const ey = sy + (Bm > 11 && sm >= A ? 1 : 0), em = Bm % 12;
        dates = { from: start, to: `${ey}-${pad(em + 1)}-${pad(lastDay(ey, em))}`, label: pr ? 'prázdniny' : label, season: true };
        month = inNow ? cm : A % 12;
      });
    }
    const hol = (o.holidays || []);
    // datum hned po „zpět / zpátky / návrat“ (i „zpět v sobotu 26.12.“, „zpět do Prahy 26.12.“ – nejvýš 3 slova mezi)
    const retBefore = at => at != null && /(?:^|[^a-z])(?:zpet|zpatky|navrat\w*)(?:\s+(?!nebo\b|ci\b)[a-z]+){0,3}[\s,:–-]*$/.test(s.slice(0, at));
    // „přes Vánoce a Silvestr“ (i obráceně, i „Nový rok“): obojí – odlet před Štědrým dnem, návrat po Novém roce, ± 1 den;
    // dřív jen Vánoce na 3–4 noci (Silvestr se tiše zahodil). name = svátek, který přišel druhý; null = nejde o tuto dvojici
    const xmasNy = (d, name) => {
      const xmas = x => (x.holiday && /vanoc/.test(fold(x.holiday.name || ''))) || x.label === 'Vánoce';
      const ny = x => (x.holiday && /novy rok/.test(fold(x.holiday.name || ''))) || x.label === 'Silvestr';
      if (!d || !(name === 'vanoce' ? ny(d) : xmas(d))) return null;
      const ds = (d.holiday ? d.holiday.start : d.to) || '';
      if (!/^\d{4}-\d\d-\d\d$/.test(ds)) return null;
      const y = +ds.slice(0, 4) - (ds.slice(5) < '06-01' ? 1 : 0);
      const out = [`${y}-12-23`, addDays(today, 1)].sort()[1], back = `${y + 1}-01-02`;
      if (out > `${y}-12-29`) return null;
      return { exact: true, out, back, flex: 1, xmasNy: true };
    };
    const holRule = (re, name, fallback) => rule(new RegExp(`(?:(?:na|o|pres|na\\s+svatky)\\s+)?(?:${re})${W}`), (m, at) => {
      const lw = hol.find(x => fold(x.name || '').includes(name));
      const xn = (name === 'vanoce' || name === 'novy rok') && xmasNy(dates, name);
      if (xn) { dates = xn; return; }
      // „Štědrý den do Londýna a zpět 27.12.“: datum z věty je návrat, svátek odlet (dřív „Štědrý den“ neznámé místo)
      if (dates) {
        // svátek mimo seznam prodloužených víkendů (Vánoce od ledna do léta tam nejsou): začátek z náhradního termínu –
        // u Vánoc Štědrý den (konec „Vánoce“ 19.–24. 12.), jinak jeho první den; nejvýš 45 nocí
        // (náhradní termín Silvestra nastaví délku – tady jen pro začátek svátku, délku nemění)
        const len0 = len, fb = !lw && dates.exact && dates.out && !dates.back ? fallback() : null;
        len = len0;
        const st = lw ? lw.start : fb ? (name === 'vanoce' ? fb.to : fb.from) : '';
        // poslední den svátku: datum z věty je návrat jen od něj dál („zpět 27.12.“), ne „od 26.3. o Velikonocích“ (odlet)
        const end = lw ? lw.end : fb ? (name === 'vanoce' ? addDays(fb.to, 2) : name === 'velikonoce' ? addDays(fb.from, 4) : name === 'novy rok' ? addDays(fb.to, 1) : fb.to) : '';
        // … i dřív, když před datem stojí „zpět“ / „návrat“ („Vánoce v Londýně a zpět 26.12.“ = 24.–26. 12.)
        // „po Vánocích do Londýna 28.12.“, „hned po Velikonocích“: datum je odlet (po svátku), ne návrat
        const ret = retBefore(dates.at), after = /(?:^|[^a-z])po\s*$/.test(s.slice(0, at));
        if (dates.exact && dates.out && !dates.back && /^\d{4}-\d\d-\d\d$/.test(st || '') && st < dates.out && end && (ret || (!after && dates.out >= end)) && (Date.parse(dates.out) - Date.parse(st)) / 864e5 <= 45) dates = { exact: true, out: st, back: dates.out };
        return;
      }
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
    holRule('vanocni\\s+prazdnin\\w*|vanoc\\w*|vanocni\\s+svatky|stedr\\w+\\s+(?:den|dne|vecer\\w*)|stedrovecer\\w*', 'vanoce', () => { const y = today.slice(5) > '12-27' ? +today.slice(0, 4) + 1 : +today.slice(0, 4); return { from: [today, `${y}-12-19`].sort()[1], to: `${y}-12-24`, label: 'Vánoce' }; });
    // Silvestr: být tam 31. 12. – odlet 27.–31. 12., ne prodloužený víkend Nového roku (odlet 31. 12. večer nebo 1. 1.
    // by Silvestra minul); „na Nový rok“ dál podle prodlouženého víkendu
    const silvestr = () => { const y = +today.slice(0, 4) + (today.slice(5) > '12-31' ? 1 : 0); len = len || 'long'; return { from: [today, `${y}-12-27`].sort()[1], to: `${y}-12-31`, label: 'Silvestr' }; };
    // s daty z věty („Silvestr v Londýně 27.12.–2.1.“) platí data – Silvestr už není místo
    rule(new RegExp(`(?:(?:na|o|pres)\\s+)?silveste?r\\w*${W}`), () => {
      const xn = xmasNy(dates, 'silvestr');
      if (xn) { dates = xn; return; }
      if (dates) {
        // „Silvestr v Londýně a zpět 1.1.“: datum po „zpět / návrat“ je návrat, odlet na Silvestra (dřív odlet 1. 1.)
        if (dates.exact && dates.out && !dates.back && retBefore(dates.at)) {
          const st = `${+dates.out.slice(0, 4) - (dates.out.slice(5) < '12-31' ? 1 : 0)}-12-31`;
          if (st < dates.out && (Date.parse(dates.out) - Date.parse(st)) / 864e5 <= 45) dates = { exact: true, out: st, back: dates.out };
        }
        return;
      }
      dates = silvestr(); month = 11;
    });
    holRule('novy\\s+rok|novyho\\s+roku', 'novy rok', silvestr);
    // Velikonoce bez prodlouženého víkendu v seznamu (dál než pár měsíců): odlet čt–pá před Velikonoční nedělí
    holRule('velikonocni\\s+prazdnin\\w*|velikonoc\\w*', 'velikonoce', () => {
      let y = +today.slice(0, 4), e = easter(y);
      if (addDays(e, 1) < today) e = easter(++y);
      len = len || 'long';
      return { from: [today, addDays(e, -3)].sort()[1], to: addDays(e, -2), label: 'Velikonoce' };
    });
    // svátek jménem („na Den boje za svobodu“, „na 1. máje“, „o svatém Václavu“): jeho prodloužený víkend – ze seznamu,
    // jinak spočtený (o.longWeekend), jinak pár dní před svátkem s délkou prodlouženého víkendu; dřív jméno svátku jako
    // místo. Datum („17. listopadu“) zůstává datem.
    const NAMED = [
      ['den\\s+boje\\s+za\\s+svobodu(?:\\s+a\\s+demokracii)?|sametov\\w+\\s+revoluc\\w*', '11-17', 'den boje', 'Den boje za svobodu'],
      ['svatek\\s+prace|(?:1\\.|prvniho)\\s*maje|prvni\\s+maj', '05-01', 'svatek prace', 'Svátek práce'],
      ['den\\s+vitezstvi|den\\s+osvobozeni', '05-08', 'den vitezstvi', 'Den vítězství'],
      ['(?:svat\\w+\\s+)?cyril\\w*\\s+a\\s+metod\\w*', '07-05', 'cyril', 'Cyril a Metoděj'],
      ['(?:mistr\\w*\\s+)?jan\\w*\\s+hus\\w*', '07-06', 'hus', 'Mistr Jan Hus'],
      ['den\\s+ceske\\s+statnosti|svat\\w+\\s+vaclav\\w*', '09-28', 'statnosti', 'Den české státnosti'],
      ['vznik\\w*\\s+(?:samostatn\\w+\\s+)?(?:ceskoslovensk\\w*|republiky|csr)', '10-28', 'vznik', 'Vznik Československa'],
    ];
    for (const [re, md, key, label] of NAMED) {
      rule(new RegExp(`(?:(?:na|o|pres|kolem)\\s+)?(?:${re})${W}`), () => {
        if (dates) return false;
        let y = +today.slice(0, 4); if (`${y}-${md}` < addDays(today, 2)) y++;
        const d = `${y}-${md}`;
        let lw = hol.find(x => fold(x.name || '').includes(key) && x.start <= d && x.end >= d);
        if (!lw && o.longWeekend) { const x = o.longWeekend(addDays(d, -4), 8); if (x && x.start <= d && x.end >= d) lw = x; }
        if (lw && o.holidayDates) { dates = { holiday: lw, label: lw.name }; return; }
        // svátek ve středu (prodloužený víkend není) nebo bez seznamu: odlet pár dní před ním, délka prodlouženého víkendu
        dates = { from: [addDays(today, 1), addDays(d, -4)].sort()[1], to: d, label };
        len = len || 'long';
      });
    }
    // „na státní svátek“, „o svátcích“: nejbližší prodloužený víkend
    rule(new RegExp(`(?:na\\s+|o\\s+|pres\\s+)?(?:statni\\s+svat\\w*|svatek|svatky|svatcich)${W}`), () => {
      // „na státní svátek v listopadu“: svátek v tom měsíci (dřív zůstal celý měsíc a „státní svátek“ jako místo)
      if (dates && dates.month) { const h = o.holidayDates && hol.find(x => x.start >= dates.from && x.start <= dates.to); if (h) dates = { holiday: h, label: h.name }; return; }
      if (dates) return;
      if (!hol[0] || !o.holidayDates) return false;
      dates = { holiday: hol[0], label: hol[0].name };
    });
    rule(new RegExp(`(?:na\\s+|o\\s+|pres\\s+)?dusick\\w*${W}`), () => { if (dates) return; dates = nextSpan('10-30', '11-02', 'Dušičky'); len = len || 'long'; });
    rule(new RegExp(`(?:co\\s+nejdriv|hned|ihned|narychlo|last\\s*minute|lastminute|co\\s+nejdrive)${W}`), () => { if (dates) return false; dates = { from: today, to: addDays(today, 14), label: 'co nejdřív' }; });
    rule(new RegExp(`(?:pristi|dalsi)\\s+tyden${W}`), () => { if (dates) return false; const mon = addDays(today, ((8 - dow(today)) % 7) || 7); dates = { from: mon, to: addDays(mon, 6), label: 'příští týden' }; });
    rule(new RegExp(`(?:tento|tenhle)\\s+tyden${W}`), () => { if (dates) return false; dates = { from: today, to: addDays(today, (7 - dow(today)) % 7), label: 'tento týden' }; });
    rule(new RegExp(`(?:pristi|dalsi)\\s+mesic${W}|v\\s+pristim\\s+mesici${W}`), () => {
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
    // „na měsíc“, „měsíc v Thajsku“ = ~4 týdny (27–30 nocí); „na 2 měsíce / půl roku / rok“ – zpáteční let tak daleko
    // hledání nenajde (nejvýš 45 nocí) → jen tam. Dřív z „měsíc“, „půl roku“ bylo místo. (Až za „za měsíc“ a „příští měsíc“.)
    // „příští rok v prosinci“: měsíc až v příštím roce (letošní prosinec by byl nejbližší); jinak jen není místo
    rule(new RegExp(`(?:pristi|pristim|dalsi)\\s+rok\\w*${W}|v\\s+pristim\\s+roce${W}`), () => {
      const y = +today.slice(0, 4);
      // (jen do ~roka dopředu – dál hledání letů nesahá, pak zůstane nejbližší)
      if (dates && dates.month && month != null && +dates.to.slice(0, 4) === y && `${y + 1}-${pad(month + 1)}-01` <= addDays(today, 359)) dates = { from: `${y + 1}-${pad(month + 1)}-01`, to: `${y + 1}-${pad(month + 1)}-${pad(lastDay(y + 1, month))}`, month: true, label: `${MONTHS[month]} ${y + 1}` };
    });
    let longStay = false;
    // „tento / tenhle měsíc“ = do konce měsíce; „za měsíc“, „příští měsíc“ s jiným termínem ve větě nic (ne pobyt na měsíc)
    rule(new RegExp(`(?:tento|tenhle|tenhleten|letosni)\\s+mesic${W}`), () => {
      if (dates) return;
      const y = +today.slice(0, 4), mo = +today.slice(5, 7) - 1, end = `${y}-${pad(mo + 1)}-${pad(lastDay(y, mo))}`;
      // poslední 2–3 dny měsíce: „do konce měsíce“ by bylo jen dnes a zítra (31. 10. = jen 31. 10., lety, které už
      // odletěly) – nejbližší týden
      if (Date.parse(end) - Date.parse(today) < 3 * 864e5) { const to = addDays(today, 6); dates = { from: today, to, label: `nejbližší dny (do ${dm(to)})` }; return; }
      dates = { from: today, to: end, label: 'do konce měsíce' };
      month = mo;
    });
    rule(new RegExp(`(?:za|pristi|pristim|dalsi)\\s+mesic\\w*${W}`), () => {});
    // „v příštích dvou měsících“, „do 3 měsíců“, „během 2 měsíců“ = kdy (od dneška), ne pobyt na měsíce (jen tam)
    rule(new RegExp(`(?:(?:v|ve|behem|do)\\s+(?:(?:pristich|nasledujicich|dalsich|nejblizsich)\\s+)?|(?:pristich|nasledujicich|dalsich|nejblizsich)\\s+)(${NUM_RE})\\s*mesic\\w*${W}`), m => {
      const n = num(m[1]);
      if (!(n >= 1 && n <= 12)) return false;
      if (dates) return;
      const to = addDays(today, Math.min(n * 30, 330));
      dates = { from: today, to, label: `${dm(today)} – ${dm(to)}` };
    });
    rule(new RegExp(`(?:na\\s+)?(?:cely\\s+)?mesic${W}`), () => { len = len || about(30); });
    rule(new RegExp(`(?:na\\s+)?(${NUM_RE})\\s*mesic\\w*${W}|na\\s+(?:pul\\s+roku|cely\\s+rok|rok)${W}`), m => {
      if (m[1] && !(num(m[1]) >= 2 && num(m[1]) <= 24)) return false;
      patch.trip = 'oneway'; longStay = true;
    });
    // „zítra do Londýna a zpět 5.11.“: zítra odlet, datum po „zpět“ návrat (dřív „zítra“ místo a odlet 5. 11.)
    rule(new RegExp(`(?:zitra|zejtra)${W}`), () => { const z = addDays(today, 1); if (dates && dates.exact && dates.out > z && !dates.back && retBefore(dates.at)) { dates = { exact: true, out: z, back: dates.out }; return; } if (dates) return false; dates = { exact: true, out: addDays(today, 1), back: null, label: 'zítra' }; });
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
    // „zpátky v neděli“: den návratu, ne další den odletu (dřív odlet v pátek i v neděli)
    let backDow = null;
    rule(new RegExp(`(?:v|ve|o)\\s+(${WD.map(x => x[0]).join('|')})${W}`), (m, at) => {
      const d = WD.find(x => x[0] === m[1]);
      if (retBefore(at)) { backDow = d[1]; chips.push(['🛬', `návrat v ${d[2]}`]); return; }
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
    rule(new RegExp(`(?:(?:do|za|max(?:\\.|imalne)?|maximum|pod|nejvys(?:e)?|mam|mame|budget|rozpocet|rozpoctem)\\s*)?${AMT}\\s*(?:eur\\w*|€)${W}`), m => {
      const n = Math.round(+String(m[1]).replace(/[^\d]/g, '') * (o.eurCzk || 25) / 100) * 100;
      if (!(n >= 300 && n <= 500000) || patch.maxPrice) return false;
      patch.maxPrice = String(n);
    });
    // „do 2,5 tisíce“, „max 3,5k“ = 2 500 / 3 500 Kč (dřív bez ceny a místo „tisíce“)
    rule(new RegExp(`(?:do|za|max(?:\\.|imalne)?|maximum|pod|nejvys(?:e)?|budget|rozpocet|rozpoctem|mam|mame)\\s*(\\d{1,3}),(\\d)\\s*(?:k(?![a-z])|tisic\\w*|tis\\.?)\\s*(?:kc|korun\\w*|czk|,-)?${W}`), m => {
      const n = (+m[1] + +m[2] / 10) * 1000;
      if (!(n >= 300 && n <= 500000) || patch.maxPrice) return false;
      patch.maxPrice = String(n);
    });
    // („mám 5000 na víkend“, „za 2 litry“ = 2 000 Kč)
    rule(new RegExp(`(?:do|za|max(?:\\.|imalne)?|maximum|pod|nejvys(?:e)?|levneji\\s+nez|budget|rozpocet|rozpoctem|mam|mame)\\s*${AMT}(\\s*k(?![a-z])|\\s*(?:tisic\\w*|tis\\.?|litr\\w*|liter))?\\s*(?:kc|korun\\w*|czk|,-)?${W}`), m => {
      // („do 6k“, „do 5 k na víkend“ = tisíce; „do 6000 k moři“: 6 000 000 nedává smysl – k je předložka, cena 6 000)
      const n = price(m[1], m[2]) || (m[2] ? price(m[1]) : 0);
      if (!n) return false;
      patch.maxPrice = String(n);
    });
    rule(new RegExp(`${AMT}\\s*(tisic\\w*|tis\\.?)?\\s*(?:kc|korun\\w*|czk)${W}`), m => { const n = price(m[1], m[2]); if (!n || patch.maxPrice) return false; patch.maxPrice = String(n); });
    // „do tisícovky“, „do pětistovky“ (dřív místo „tisícovky“)
    const BILLS = { petistovk: 500, tisicovk: 1000, dvoutisicovk: 2000, petitisicovk: 5000 };
    rule(new RegExp(`(?:do|za|pod|max(?:\\.|imalne)?|maximum)\\s+(${Object.keys(BILLS).join('|')})\\w*${W}`), m => { if (patch.maxPrice) return false; patch.maxPrice = String(BILLS[m[1]]); });
    // „celkem / dohromady do 10 000 pro dva“, „do 4000 za oba“: částka za všechny → na osobu se vydělí počtem lidí níž
    let priceAll = false, pairAll = false;
    rule(new RegExp(`(?:celkem|dohromady|za\\s+(?:oba|obe|vsechny|nas\\s+vsechny))${W}`), m => { priceAll = true; pairAll = pairAll || /ob[ae]$/.test(m[0]); });

    // --- lidé, přestupy, zavazadla, jen tam ---
    // „ve dvou“, „pro 4 osoby“ = tolik lidí celkem – děti z minulého hledání ne (zmíněné děti se přidají níž)
    const people = n => { if (n >= 1 && n <= 9) { patch.adults = n; patch.children = 0; patch.infants = 0; return true; } return false; };
    // („pro jedno dítě a dva dospělé“: „pro jedno“ jsou děti, ne 1 dospělý)
    rule(new RegExp(`(?:ve|pro)\\s+(${NUM_RE})(?:\\s+(?:lidech|lidi|lide|osobach|osoby|osob|dospele|dospeli|dospelych))?(?!\\s+(?:dit|deti|miminek|miminka|miminko|batol))${W}`), m => (people(num(m[1])) ? undefined : false));
    // „2x dospělý 1x dítě“ (jako v rezervacích): „x“ za počtem a jednotné číslo „dospělý“ – dřív „2x dospělý 1x“ jako místo
    rule(new RegExp(`(${NUM_RE})\\s*(?:x\\s*)?(?:lidi|lide|osoby|osob|dospeli|dospelych|dospele|dospely|dospelou|pasazeri|pasazery|cestujici)${W}`), m => (people(num(m[1])) ? undefined : false));
    rule(new RegExp(`(?:sam|sama|samotn[yaá]|solo|jen\\s+ja)${W}`), () => { people(1); });
    // „rodina 2+2“, „2+1 do Říma“: dospělí + děti (dřív bez lidí)
    rule(new RegExp(`(?:rodina\\s+)?([1-9])\\s*\\+\\s*([1-6])(?![\\d.])${W}`), m => { if (!people(+m[1])) return false; kids = +m[2]; });
    // děti 2–11 let platí sedadlo, miminko letí na klíně: „2 dospělí a 2 děti“ = 2 dospělí + 2 děti, „s miminkem“ =
    // miminko navíc (bez počtu dospělých dva); „dítě“ / „miminko“ i bez předložky („2 dospělí, dítě a miminko“)
    // věk dětí („s dětmi 5 a 8 let“, „s dítětem 1 rok“): letenka podle věku – do 2 let miminko na klíně, 2–11 dítě,
    // od 12 let platí jako dospělý (dřív jen „s dětmi – kolik jich je, uprav“, „s dítětem 1 rok“ = dítě se sedadlem)
    const AGES = '(\\d{1,2}(?:\\s*(?:,|a|i)\\s*\\d{1,2}){0,5})';
    rule(new RegExp(`(?:s|se)\\s+(?:detmi|detma|deckama|ditkama|ditetem|ditkem)\\s*\\(?\\s*(?:(?:ve\\s+)?veku\\s+${AGES}(?:\\s*(?:let|roky|roku|rok))?|${AGES}\\s*(?:let|roky|roku|rok))\\s*\\)?${W}`), m => {
      const ages = (m[1] || m[2]).match(/\d{1,2}/g).map(Number);
      if (ages.some(a => a > 17)) return false;
      if (/^s[e]?\s+(?:ditetem|ditkem)/.test(m[0]) && ages.length > 1) return false; // „s dítětem 5 a 8 let“ – nevím
      babies = ages.filter(a => a < 2).length; kids = ages.filter(a => a >= 2 && a < 12).length; teens = ages.filter(a => a >= 12).length;
    });
    rule(new RegExp(`(?:a\\s+|se?\\s+)?(${NUM_RE})\\s*(?:x\\s*)?(?:deti|ditka|detmi|ditetem|ditkem|dite|batolata|batolat|batolatum)${W}|(?:(?:s|se|a)\\s+)?(?:ditetem|ditkem|dite|ditko|batoletem|batole)${W}`), m => {
      const k = m[1] ? num(m[1]) : 1;
      if (!(k >= 1 && k <= 6)) return false;
      kids = k;
    });
    rule(new RegExp(`(?:a\\s+|se?\\s+)?(${NUM_RE})\\s*(?:x\\s*)?(?:miminka|miminek|miminky|mimina|miminkem|miminko|mimino|miminem)${W}|(?:(?:s|se|a)\\s+)?(?:miminkem|miminko|mimino|miminem)${W}`), m => {
      const k = m[1] ? num(m[1]) : 1;
      if (!(k >= 1 && k <= 4)) return false;
      babies = k;
    });
    // „s dětmi“ bez počtu: kolik jich je, nevím – jen se nebere jako místo a připomene upravit počet osob
    rule(new RegExp(`(?:s|se)\\s+(?:detmi|detma|deckama|ditkama)${W}|pro\\s+deti${W}`), () => { withKids = true; });
    // „se ženou“ = 2 osoby, „s mámou a tátou“ / „s klukem a dcerou“ = 3 (já + oba)
    const MATE = 'pritelkyni|pritelem|partnerem|partnerkou|manzelkou|manzelem|holkou|klukem|zenou|muzem|synem|dcerou|mamou|tatou|kamaradem|kamaradkou';
    rule(new RegExp(`(?:s|se)\\s+(?:${MATE})(\\s+(?:a|i)\\s+(?:se\\s+|s\\s+)?(?:${MATE}))?${W}`), m => { people(m[1] ? 3 : 2); });
    rule(new RegExp(`(?:primy|prime|primo|primym|primou|bez\\s+prestupu|bez\\s+prestupovani)${W}`), () => { patch.directOnly = true; });
    // čas letu, přestupy a aerolinky formulář hledání nemá – vybírají se ve výsledcích (⚙️ Filtry). Věta je nebere jako
    // místo („Řím ráno“ dřív hledalo i místo „ráno“, „Ryanairem“ místo „Ryanairem“) a řekne, kde je najít.
    const later = new Set();
    rule(new RegExp(`(?:(?:odlet\\w*|prilet\\w*|let)\\s+)?(?:ne\\s+)?(?:(?:brzo|brzy)\\s+)?(?:rano|ranni(?:m|ho)?|dopoledne|odpoledne|vecer|vecerni(?:m|ho)?|v\\s+noci|nocni(?:m|ho)?|po\\s+praci)(?:\\s+let\\w*)?(?:\\s+ne)?${W}`), () => { later.add('čas letu'); });
    rule(new RegExp(`(?:(?:odlet\\w*|prilet\\w*)\\s+)?(?:po|do|od|pred)\\s+\\d{1,2}(?:[:.]\\d{2})?\\s*(?:h|hod\\w*)${W}|(?:odlet\\w*|prilet\\w*)\\s+(?:po|do|od|pred)\\s+\\d{1,2}(?::\\d{2})?${W}`), () => { later.add('čas letu'); });
    rule(new RegExp(`(?:max(?:\\.|imalne)?\\s*)?(?:1|jeden|jednim)\\s+prestup\\w*${W}|s\\s+jednim\\s+prestupem${W}|kratk\\w+\\s+prestup\\w*${W}`), () => { later.add('přestupy'); });
    rule(new RegExp(`(?:s\\s+|se\\s+|bez\\s+|jen\\s+|pres\\s+)?(?:ryanair\\w*|wizz\\w*|easyjet\\w*|smartwings\\w*|lufthans\\w*|eurowings\\w*|vueling\\w*|transavi\\w*|norwegian\\w*|emirates\\w*|turkish\\w*)(?:\\s+air\\w*)?${W}`), () => { later.add('aerolinky'); });
    // „bez kufru“ před „kufr“ (jinak by „kufru“ znamenalo kufr k odbavení)
    rule(new RegExp(`(?:jen\\s+(?:s\\s+)?batoh\\w*|bez\\s+(?:velk\\w+\\s+)?kufr\\w*|bez\\s+(?:odbaven\\w+\\s+)?zavazad\\w*|jen\\s+(?:s\\s+)?(?:malym\\s+)?(?:batoh\\w*|taskou|kabelkou))${W}`), () => { patch.bags = 'none'; });
    rule(new RegExp(`(?:s\\s+)?(?:kabinov\\w*|prirucn\\w*)(?:\\s+(?:kufr\\w*|zavazad\\w*))?${W}|(?:s\\s+)?kufrik\\w*${W}`), () => { patch.bags = 'cabin'; });
    rule(new RegExp(`(?:s\\s+)?(?:velk\\w+\\s+)?kufr\\w*(?:\\s+k\\s+odbaveni)?${W}|odbaven\\w*\\s+zavazad\\w*${W}`), () => { patch.bags = patch.bags || 'checked'; });
    rule(new RegExp(`(?:jen\\s+tam|jednosmern\\w*|one\\s*way|bez\\s+zpatecni\\w*|bez\\s+navratu)${W}`), () => { patch.trip = 'oneway'; });
    rule(new RegExp(`(?:tam\\s+(?:i|a)\\s+zpet|zpatecni\\w*)${W}`), () => { patch.trip = 'return'; });

    // --- kam: k moři, za teplem, exotika, kamkoliv ---
    rule(new RegExp(`(?:(?:k|ke|na|u)\\s+)?(?:mori|more|moricku|moricko|plaz\\w*|koupat|koupani|pobrezi)${W}`), (m, at) => {
      if (/mor/.test(m[0]) && SEA_NAMES.test(s.slice(0, at))) return false; // Rudé moře = místo
      // „Slunečné / Lazurové pobřeží“: „pobřeží“ hned za slovem názvu je jméno místa
      const prev = (s.slice(0, at).match(/([a-z]+)\s*$/) || [])[1];
      if (m[0] === 'pobrezi' && prev && !FILL.has(prev) && !TO_WORDS.has(prev) && !FROM_WORDS.has(prev)) return false;
      kind = kind || 'sea';
    });
    // „k oceánu“, „u oceánu“ = k moři (místo by našlo Austrálii a Oceánii); „Atlantský oceán“ bez předložky zůstane místem
    rule(new RegExp(`(?:k|ke|u|na)\\s+ocean\\w*${W}`), () => { kind = kind || 'sea'; });
    rule(new RegExp(`(?:na|do|po|v|ve)?\\s*(balkan\\w*|skandinavi\\w*|pobalti\\w*)${W}`), m => { group = /^balk/.test(m[1]) ? 'balkan' : /^sk/.test(m[1]) ? 'skandinavie' : 'pobalti'; });
    rule(new RegExp(`(?:za|do|na)?\\s*(?:tepl(?:o|a|em|e|eho|emu|ou|y|ych|ym|ymi|ejsi[a-z]*|eji|ot[a-z]*)|slunce|sluncem|slunicko|slunicka|slunickem|jih|jihu)${W}`), () => { kind = kind || 'warm'; patch.minTemp = Math.max(patch.minTemp || 0, 20); });
    rule(new RegExp(`(?:do\\s+)?(?:horka|horko|vedra|vedro)${W}`), () => { kind = kind || 'warm'; patch.minTemp = 25; });
    rule(new RegExp(`(?:do\\s+|na\\s+)?(?:exotik\\w*|exoticky\\w*|tropu|tropy|do\\s+dalky|daleko)${W}`), () => { kind = 'exotic'; });
    rule(new RegExp(`(?:kamkoliv|kamkoli|kdekoliv|kdekoli|nekam|cokoliv|kamkolvek)${W}`), () => { kind = kind || 'any'; });
    // „hory“ bez „na/do“ hned za slovem názvu („z Kutné Hory“) je část jména místa, ne „na hory“
    rule(new RegExp(`(?:na\\s+|do\\s+)?(?:hory|horach|hor|alpy|alp|alpach|alpami|lyze|lyzemi|lyzovat|lyzovani|lyzovack\\w*|lyzak\\w*|na\\s+snih)${W}`), (m, at) => {
      const prev = (s.slice(0, at).match(/([a-z]+)\s*$/) || [])[1];
      if (/^(?:hory|horach|hor)$/.test(m[0]) && prev && !FILL.has(prev) && !TO_WORDS.has(prev) && !FROM_WORDS.has(prev)) return false;
      kind = kind || 'mountains';
    });

    if (soonWk && !dates && month == null) dates = thisWk();
    // --- zbytek věty: místa (z X = odkud, jinak kam) ---
    const to = [], from = [];
    let mode = 'to', cur = [], arrows = 0, soft = null, backNext = false, justBack = false;
    const back = []; // „a zpět z Neapole“: návrat z jiného místa
    // „do Londýna a zpět do Prahy“: kam se vracím = odkud letím (dřív Praha druhý cíl) – jen jedno místo, pak zase kam;
    // jen „do“ hned za „zpět“ („tam 20.11. a zpátky 24.11. do Londýna“: Londýn je cíl)
    const home = [];
    // „přes Vídeň“ = přestup, ne cíl – místo se zahodí (přestupní letiště hledání neurčuje)
    const flush = () => {
      if (cur.length && mode !== 'via') (mode === 'from' ? from : mode === 'back' ? back : mode === 'home' ? home : to).push(cur.join(' '));
      if (mode === 'home') mode = 'to';
      cur = [];
    };
    // překlep v dlouhém měsíci za „v / ve“ („v prosnci“, „v listopdu“): jedno písmeno navíc, chybí, jiné nebo prohozené –
    // jen tvary od 7 písmen (u krátkých by to chytalo místa); dřív „prosnci“ jako místo a termín žádný
    const ed1 = (a, b) => {
      if (a === b || Math.abs(a.length - b.length) > 1) return false;
      let i = 0; while (i < a.length && a[i] === b[i]) i++;
      if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
      return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
    };
    const typoMonth = w => { if (w.length < 6) return null; const f = MONTH_FORMS.find(([x]) => x.length >= 7 && ed1(w, x)); return f ? f[1] : null; };
    const re = /[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*|[,/;&+>~]/gu;
    let m, prevW = '';
    while ((m = re.exec(s))) {
      const at = m.index, w = m[0], orig = raw.slice(at, at + w.length), pw = prevW;
      prevW = w;
      const afterBack = justBack; justBack = false;
      // slovo vzaté pravidlem („přes víkend Londýn“, „přes léto“) „přes“ ukončí – jinak by zahodilo i cíl za ním
      if (used.slice(at, at + w.length).some(Boolean)) { flush(); if (mode === 'via') mode = 'to'; continue; }
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
      if (/^(?:zpet|zpatky|navrat\w*)$/.test(w)) { flush(); backNext = true; justBack = true; continue; }
      if (backNext && (w === 'z' || w === 'ze' || w === 'od')) { backNext = false; mode = 'back'; continue; }
      if (afterBack && w === 'do') { backNext = false; flush(); mode = 'home'; continue; }
      backNext = false;
      if (FROM_WORDS.has(w)) { flush(); mode = 'from'; continue; }
      if (w === 'pres') { flush(); mode = 'via'; continue; }
      if (TO_WORDS.has(w)) { flush(); mode = 'to'; continue; }
      // „město“ hned za slovem názvu patří k němu („Nové Město“, „do Nového Města“) – samotné („do města“) ne
      if (/^(?:v|ve)$/.test(pw) && !dates && !used.slice(at, at + w.length).some(Boolean)) {
        const k = typoMonth(w);
        if (k != null) { const r = monthRange(k); dates = { from: r.from, to: r.to, label: MONTHS[k] }; month = k; flush(); continue; }
      }
      // „na vykend“, „o vykendu“ (y místo i): víkend, ne místo
      if (/^vykend\w*$/.test(w)) {
        len = len || 'weekend';
        if (/^(?:o|tento|tenhle|nejblizsi)$/.test(pw)) { if (cur.length && fold(cur[cur.length - 1]) === pw) cur.pop(); if (!dates) dates = thisWk(); }
        flush(); continue;
      }
      if ((FILL.has(w) && !(cur.length && /^mest[aeou]?$|^mestem$/.test(w))) || /^\d+$/.test(w)) { flush(); continue; }
      cur.push(orig);
    }
    flush();
    // „zpátky do Brna z Londýna“: jediné místo kam = cíl; „z Vídně do Londýna a zpět do Prahy“ (návrat jinam) se zahodí –
    // hledat Prahu jako druhý cíl by bylo špatně
    if (home.length) (!from.length ? from : !to.length ? to : []).push(home[0]);
    // pomlčka bez místa za ní („Řím – víkend“) nebyla odkud → kam: místo před ní je cíl
    if (soft && !to.length && !kind && from.length === 1) { to.push(from.pop()); arrows--; }

    if (kids || babies || teens) {
      patch.adults = Math.min(9, (patch.adults || 2) + teens); // dítě od 12 let letí za cenu dospělého
      patch.children = Math.min(kids, 9 - patch.adults);
      patch.infants = Math.min(babies, patch.adults); // miminko na klíně – nejvýš jedno na dospělého
    }
    // --- délka → noci a dny odletu ---
    const P = o.presets || {};
    if (backDow != null && dates && dates.exact && !dates.back) { const k = ((backDow - dow(dates.out) + 7) % 7) || 7; dates.back = addDays(dates.out, k); }
    else if (backDow != null && !len && patch.outDays && patch.outDays.length === 1) { const a = patch.outDays[0]; len = { n: ((backDow - a + 7) % 7) || 7, out: [a], back: [backDow] }; }
    if (typeof len === 'string') {
      patch.len = len;
      // den odletu z věty („v pátek na týden“, „od soboty na týden“) přednost před dny délky
      if (P[len]) Object.assign(patch, { nMin: P[len].nMin, nMax: P[len].nMax, outDays: patch.outDays && patch.outDays.length ? patch.outDays : P[len].out.slice(), backDays: P[len].back.slice() });
    } else if (len && len.n) Object.assign(patch, { len: 'custom', nMin: len.lo || len.n, nMax: len.hi || len.n, outDays: len.out || patch.outDays || [], backDays: len.back || [] });

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
      // Vánoce i Silvestr s delším pobytem („na 2 týdny“): návrat po Novém roce zůstane, odlet o tolik dřív
      if (dates.xmasNy) {
        const k = patch.nMin != null ? Math.round((patch.nMin + patch.nMax) / 2) : 0;
        if (k > 10) dates.out = [addDays(dates.back, -k), addDays(today, 1)].sort()[1];
        dates.label = `Vánoce i Silvestr (${dm(dates.out)} – ${dm(dates.back)} ± 1 den)`;
      }
      Object.assign(patch, { dateMode: 'exact', xOut: dates.out, xFlex: dates.flex || 0, ...(back ? { xBack: back } : {}) });
      if (!dates.back && !back) patch.trip = 'oneway';
      // návrat přes 45 nocí („1.12. a zpět 28.2.“): zpáteční tak daleko hledání nenajde – jen tam, zpět zvlášť (jako „na 3 měsíce“)
      if (back && (Date.parse(back) - Date.parse(dates.out)) / 864e5 > 45) { patch.trip = 'oneway'; longStay = true; }
      delete patch.outDays; delete patch.backDays;
      // návrat dopočtený z délky (bez délky týden) – v čipu vidět („Řím 3 noci od 5.12.“ = 5. 12. – 8. 12.)
      // („zítra“, „pátek 23. 10.“ i s dopočteným návratem: „zítra – 26. 10.“)
      chips.push(['📅', dates.label ? `${dates.label}${back && !dates.back ? ` – ${dm(back)}` : ''}` : back ? `${dm(dates.out)} – ${dm(back)}` : dm(dates.out)]);
    } else if (dates) {
      Object.assign(patch, { dateMode: 'flex', dFrom: dates.from, dTo: dates.to < dates.from ? dates.from : dates.to });
      chips.push(['📅', dates.label]);
    }
    if (patch.len && !(dates && dates.exact) && patch.len !== 'holiday') chips.push(['🌙', patch.len === 'custom' ? (patch.nMax > patch.nMin ? `${patch.nMin}–${patch.nMax} nocí` : `${patch.nMin} ${patch.nMin === 1 ? 'noc' : patch.nMin < 5 ? 'noci' : 'nocí'}`) : { weekend: 'víkend', long: 'prodl. víkend', week: 'týden', '2weeks': '2 týdny' }[patch.len]]);
    if (patch.len && patch.len !== 'holiday' && patch.dateMode !== 'exact') patch.dateMode = 'flex';

    // --- kam podle druhu ---
    const mon = month ?? (dates && (dates.from || dates.out) ? +((dates.from || dates.out).slice(5, 7)) - 1 : +addDays(today, 14).slice(5, 7) - 1);
    let items = null;
    if (kind === 'sea') items = seaFor(mon).map(k => ({ id: `rg:${k}`, label: SEA[k][0], flag: SEA[k][1], type: 'region' }));
    else if (kind === 'exotic') items = EXOTIC.map(([cc, label, flag]) => ({ id: `cc:${cc}`, label, flag, type: 'country' }));
    else if (kind === 'mountains') items = MOUNTAINS.map(([iata, label, flag]) => ({ id: `ap:${iata}`, label, flag, type: 'airport' }));
    else if (kind === 'aurora') items = AURORA.map(([iata, label, flag]) => ({ id: `ap:${iata}`, label, flag, type: 'airport' }));
    if (group) { items = GROUPS[group][1].map(([cc, label, flag]) => ({ id: `cc:${cc}`, label, flag, type: 'country' })); chips.unshift(['🗺️', GROUPS[group][0]]); }
    if (kind) chips.unshift([{ sea: '🏖️', warm: '☀️', exotic: '🌴', any: '🌍', mountains: '🏔️', aurora: '🌌' }[kind], { sea: 'k moři', warm: patch.minTemp >= 25 ? 'do horka' : 'za teplem', exotic: 'exotika', any: 'kamkoliv', mountains: 'na hory', aurora: 'polární záře' }[kind]]);
    // částka za všechny („celkem“, „za oba“): ceny v hledání jsou na osobu – vydělit dospělými a dětmi (na stovky)
    if (pairAll && !patch.adults) Object.assign(patch, { adults: 2, children: 0, infants: 0 }); // „za oba“ = 2 osoby
    const payers = (patch.adults || 0) + (patch.children || 0);
    if (priceAll && patch.maxPrice && payers > 1) patch.maxPrice = String(Math.max(100, Math.round(+patch.maxPrice / payers / 100) * 100));
    // víc lidí: cena v hledání je na osobu – „rodina 2+2 do 15 tisíc“ = do 15 000 Kč/os., ne 15 000 za rodinu (štítek to řekne)
    if (patch.maxPrice) chips.push(['💰', `do ${czk(+patch.maxPrice)}${payers > 1 ? '/os.' : ''}`]);
    const cs3 = (n, a, b, c) => `${n} ${n === 1 ? a : n < 5 ? b : c}`;
    if (patch.adults && !patch.children && !patch.infants) chips.push(['👥', cs3(patch.adults, 'osoba', 'osoby', 'osob')]);
    else if (patch.adults) chips.push(['👥', [cs3(patch.adults, 'dospělý', 'dospělí', 'dospělých'), patch.children ? cs3(patch.children, 'dítě', 'děti', 'dětí') : '', patch.infants ? cs3(patch.infants, 'miminko', 'miminka', 'miminek') : ''].filter(Boolean).join(' + ')]);
    if (withKids && !kids && !babies && !patch.adults) chips.push(['🧒', 's dětmi – kolik jich je, uprav v Cestujících']);
    if (patch.directOnly) chips.push(['✈️', 'jen přímé']);
    if (later.size) chips.push(['⚙️', `${[...later].join(', ')} – nastavíš ve Filtrech`]);
    if (patch.bags) chips.push(['🧳', { none: 'bez kufru', cabin: 'kabinový kufr', checked: 'kufr k odbavení' }[patch.bags]]);
    if (patch.trip === 'oneway') chips.push(['➡️', longStay ? 'jen tam (zpět hledej zvlášť)' : 'jen tam']);
    // „Praha → Řím → Barcelona → Praha“: dvě a víc šipek = cesta přes víc měst (odkud, pak místa v pořadí)
    const chain = arrows >= 2 && from.length === 1 && to.length >= 2 && !kind;
    return { chips: chips.map(([i, t]) => ({ icon: i, text: t })), patch, to, from, kind, items, ...(group ? { group } : {}), ...(chain ? { chain: true } : {}), ...(withKids && !kids && !babies && !patch.adults ? { askPax: true } : {}), ...(back.length === 1 && to.length === 1 && !kind && !chain ? { back: back[0] } : {}),
      // návrat z věty (ne dopočtený z délky) – Objevuj z něj vezme počet dní („Paříž 20.–23. 11.“ = 4 dny)
      ...(dates && dates.exact && dates.back ? { backSet: true } : {}) };
  }

  /**
   * Zkracování koncovek pro našeptávač („do Říma“ → Řím, „z Vídně“ → Víd): celé slovo, bez 1 a bez 2 znaků; tříznakové
   * koncovky množného čísla i celé („v Benátkách“ → Benátk, „na Kanárech“ → Kanár, „v Katovicích“ → Katovic) a vypadlé
   * „e“ zpět („z Lince“ → Linec, „z Liberce“ → Liberec – zkrácené „Linc“ by našlo Lincoln v USA).
   */
  function stems(phrase) {
    const w = String(phrase || '').trim();
    if (!w) return [];
    const out = [w], f = fold(w);
    for (const k of [1, 2, ...(/(ach|ech|ich|ami)$/.test(f) ? [3] : [])]) { const v = w.slice(0, -k); if (v.replace(/\s/g, '').length >= 3 && !/\s$/.test(v)) out.push(v); }
    if (/[^aeiouy\s]c[ei]$/.test(f) && w.length >= 5) out.push(w.slice(0, -2) + 'ec');
    // 2. pád na -y celý („do Malagy“ → Malaga – zkrácené „Mala“ by vybralo Malajsii, „do Ženevy“ → Ženeva)
    if (/[^aeiouy\s]y$/.test(f) && w.length >= 5) out.push(w.slice(0, -1) + 'a');
    return [...new Set(out)];
  }
  // pořadí druhů míst: země a oblasti před městy, náhodná místa z geokódování až nakonec
  const TYPE_RANK = { country: 0, region: 1, continent: 2, metro: 3, airport: 4, city: 5, place: 6 };
  /**
   * Nejlepší návrh pro frázi ze všech dotazů (list = [{ q, items, local }] pro tvary ze stems): jen návrhy, jejichž název
   * začíná hledaným tvarem (bez diakritiky), lepší druh a delší tvar dřív; geokódovaná místa (geo:) jen bez jiné shody.
   * local = návrhy jen z vlastních dat (remote=0): geo: tam jsou známá města (Liberec), ne náhodná místa z geokódování.
   * typos = true: i opravy překlepů ze serveru (fuzzy) – volající je zkouší až po všem ostatním.
   */
  function bestPlace(list, typos = false) {
    let best = null;
    // přesná shoda celého slova („Malaga“ = Málaga) má přednost před zkráceným tvarem („Mala…“ → Malajsie)
    const full = list[0] ? fold(list[0].q).replace(/\s+/g, ' ') : '';
    for (const { q, items, local } of list) {
      const fq = fold(q).replace(/\s+/g, ' ');
      for (const it of items || []) {
        const lab = fold(String(it.label || '')).replace(/\s*\(.*\)$/, '');
        // i jiný název místa ze serveru: anglický (en – „Rome“, „Tuscany“) nebo místní (aliases – „Roma“, „Toscana“)
        const alt = [...(it.aliases || []), ...(it.en ? [it.en] : [])].map(a => fold(a));
        const ok = lab.startsWith(fq) || lab.split(/[\s-]+/).some(p => p.startsWith(fq)) || alt.some(a => a.startsWith(fq));
        // typos: i místo, které server našel jako opravu překlepu (fuzzy)
        if (!ok && !(typos && it.fuzzy)) continue;
        const geo = /^geo:/.test(it.id || '') && !local;
        // přesně i tvar bez koncovky, který je celým názvem („Říma“ → Řím, „Liberce“ → Liberec), ne jen napsané slovo –
        // víc než rozdíl druhů: město přesně před zemí ze zkráceného tvaru („Liber…“ → Libérie)
        const exact = lab === full || alt.includes(full) || lab === fq;
        const score = (ok ? 0 : 500) + (geo ? 100 : 0) + (exact ? -60 : 0) + (TYPE_RANK[it.type] ?? 7) * 10 - fq.length / 100;
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
    if (/[^aeiouy]ni$/.test(f)) out.push(cut(2) + 'eň'); // ve Vídni → Vídeň, v Plzni → Plzeň (v Kodani → Kodan = Kodaň níž)
    if (/ach$/.test(f)) out.push(cut(3) + 'y'); // v Benátkách → Benátky, v Aténách → Atény
    if (/ich$/.test(f)) out.push(cut(3) + 'e'); // v Katovicích → Katovice, v Pardubicích → Pardubice
    if (/[^aeiouy]c[ei]$/.test(f)) out.push(cut(2) + 'ec'); // z Lince → Linec, v Liberci → Liberec (vypadlé „e“)
    if (/ě$/.test(w)) out.push(cut(1) + 'o'); // v Brně → Brno, v Mnichově → Mnichovo? (i Mnichov níž)
    if (/[aeiyu]$/.test(f)) out.push(cut(1)); // Lisabonu → Lisabon, Paříže → Paříž, Krakova → Krakov
    if (/a$/.test(f)) out.push(cut(1) + 'o'); // Brna → Brno, Ostravy? ne – Kolína nad Rýnem…
    if (/y$/.test(f)) out.push(cut(1) + 'a'); // Prahy → Praha, Barcelony → Barcelona
    if (/u$/.test(f)) out.push(cut(1) + 'a', cut(1) + 'o'); // Krétu → Kréta, po Toskánsku → Toskánsko
    if (/e$/.test(f) && !/ne$/.test(f)) out.push(cut(1) + 'a'); // Kréte? Olomouci ne – Bratislave → Bratislava
    if (/em$|ou$/.test(f)) out.push(cut(2), cut(2) + 'a'); // Brnem → Brno? (Brn) – Prahou → Praha
    if (/ich$|ech$/.test(f)) out.push(cut(3) + 'y'); // Benátkách? – Athénách → Athény (bez záruky)
    if (/ů$/.test(w)) out.push(cut(1) + 'y'); // Varů → Vary
    if (/ní$/.test(w)) out.push(cut(1) + 'ě'); // Lázní → Lázně
    return [...new Set(out.filter(x => x.length >= 3).map(x => head + x))];
  }
  /**
   * Dvouslovné jméno místa ve 2. pádě do 1. pádu i s přídavným jménem (pro geokódování, které tvary nezná):
   * „Kutné Hory“ → Kutná Hora, „Mariánských Lázní“ → Mariánské Lázně, „Nového Jičína“ → Nový Jičín, „Karlových Varů“
   * → Karlovy Vary, „v Českém Švýcarsku“ → České Švýcarsko, „k Máchovu jezeru“ → Máchovo jezero. Jen tvary, které se od
   * napsaného liší, napřed ty se shodou rodu (Český Krumlov, České Švýcarsko – Objevuj zkouší jen první dva); nejvýš 4.
   */
  function placeForms(phrase) {
    const w = String(phrase || '').trim().split(/\s+/);
    if (w.length !== 2) return [];
    const a = w[0], f = fold(a), cut = n => a.slice(0, -n);
    // přivlastňovací („Karlových“ → Karlovy) jinak než ostatní („Mariánských“ → Mariánské)
    // 6. pád („v Českém Švýcarsku“ → České, Český) i 3. pád („k Bledskému jezeru“), 4. pád ženského rodu („na Malou
    // Fatru“ → Malá), přivlastňovací „Máchovu / Máchova jezera“ → Máchovo
    // množné číslo: „-ých“ (2. a 6. pád) i „-ým“ (3. pád, „k Plitvickým jezerům“) → -é (hory, Karpaty) i -á (střední rod:
    // Plitvická jezera)
    const heads = /e(ho|mu)$/.test(f) ? [cut(3) + 'ý', cut(3) + 'é'] : /(ov|in)ych$/.test(f) ? [cut(3) + 'y'] : /ych$/.test(f) ? [cut(3) + 'é', cut(3) + 'á']
      : /ym$/.test(f) ? [cut(2) + 'é', cut(2) + 'á'] : /é$/.test(a) ? [cut(1) + 'á']
      : /em$/.test(f) ? [cut(2) + 'ý', cut(2) + 'é'] : /ou$/.test(f) ? [cut(2) + 'á'] : /(ov|in)[au]$/.test(f) ? [cut(1) + 'o'] : [];
    // podstatné jméno: zvláštní koncovky (Varů → Vary, Lázní → Lázně) první, pak tvary ze slovníku koncovek – u „-y“
    // ne useknuté („Hory“ → Hora, ne Hor), jinak i kratší (Jičína → Jičín, Boleslavi → Boleslav); 2. pád množného čísla
    // bez koncovky po „-ých“ s -y i -a („Bílých Karpat“ → Karpaty, „Krušných hor“ → hory, „Plitvických jezer“ → jezera);
    // 3. pád množného čísla („jezerům“ → jezera, „stěnám“ → stěny)
    const n = w[1], nf = fold(n);
    const nouns = [...new Set([...(/ym$/.test(f) && /um$/.test(nf) ? [n.slice(0, -2) + 'a', n.slice(0, -2) + 'y'] : []),
      ...(/ym$/.test(f) && /am$/.test(nf) ? [n.slice(0, -2) + 'y'] : []),
      ...(/ů$/.test(n) ? [n.slice(0, -1) + 'y'] : []), ...(/ní$/.test(n) ? [n.slice(0, -1) + 'ě'] : []),
      ...(/ych$/.test(f) && /[^aeiouy]$/.test(nf) && !/[aei]ch$/.test(nf) ? [n + 'y', n + 'a'] : []),
      ...nominatives(n).slice(1).filter(x => !(/y$/.test(nf) && x.length < n.length) && fold(x) !== nf)])];
    // shoda rodu: Český + souhláska (Krumlov, ráj), České + -o/-e/-y (Švýcarsko, Lázně, Tatry), Kutná + -a, Máchovo + -o,
    // Karlovy + -y; ostatní dvojice až za nimi (pořadí jinak zůstává)
    const agree = (h, x) => {
      const e = fold(h).slice(-1), z = fold(x).slice(-1);
      return e === 'y' ? (/ý$/.test(h) ? !/[aeiouy]/.test(z) : z === 'y') : e === 'e' ? /[oey]/.test(z) : e === z;
    };
    const out = [];
    for (const h of heads) for (const x of nouns) out.push([h, x, agree(h, x)]);
    return out.sort((p, q) => q[2] - p[2]).map(([h, x]) => `${h} ${x}`).slice(0, 4);
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
    take(new RegExp(`(?:pesky|pesi\\s+(?:vylet\\w*|okruh\\w*|tur\\w*)|tur[auy]|turistik\\w*|vyslap\\w*|hrebenovk\\w*|hike|hiking)${W}`), () => { mode = mode || 'hike'; });
    take(new RegExp(`(?:na\\s+)?(?:okruh\\w*|road\\s*trip\\w*|autem\\s+po\\s+okoli)${W}`), () => { mode = mode || 'loop'; });
    take(new RegExp(`(?:jednodenni\\s+)?(?:vylet\\w*|do\\s+okoli)${W}|(?:v\\s+)?okoli${W}`), () => { mode = mode || 'day'; });
    // „co vidět v Římě“, „Řím co navštívit“, „co dělat v Londýně“: slova otázky nejsou místo
    take(new RegExp(`(?:co|kam|jak)\\s+(?:videt|navstivit|delat|zazit|podniknout|stoji\\s+za\\s+to|jit|zajit)${W}|(?:zajimav\\w*|tipy|tip|doporuceni)${W}|(?:nejhezc\\w*|nejkrasn\\w*|nejzajimav\\w*|nejlepsi)(?:\\s+(?:mist\\w*|vec\\w*|tipy|zazitky))?${W}`), () => {});
    take(new RegExp(`(\\d{1,3})\\s*km${W}`), m => { km = +m[1]; });
    take(new RegExp(`(?:na\\s+)?(${NUM_RE})\\s*(?:den|dny|dni|dnu)${W}`), m => { const n = num(m[1]); if (!(n >= 1 && n <= 14)) return false; days = n; });
    // „na den“ = 1 den; „procházka po Budapešti“ – procházka není místo (místo je za „po“)
    // („na Den boje za svobodu“, „na Den vítězství“ je svátek, ne 1 den – dřív místo „Paříž boje“ a 1 den)
    take(new RegExp(`na\\s+(?:jeden\\s+)?den${W}(?!\\s+(?:boje|vitezstvi|osvobozeni|ceske))`), () => { days = days || 1; });
    take(new RegExp(`(?:na\\s+)?(?:prochazk\\w*|prochazet|projit\\s+se)${W}`), () => {});
    // víkend bez data („Porto na víkend“): od soboty nejbližšího víkendu (prodloužený od pátku), „příští víkend“ o týden dál
    let wk = null, nearLw = null;
    take(new RegExp(`(?:(?:na|o|pres)\\s+)?(?:(pristi|dalsi|tento|tenhle|nejblizsi)\\s+)?(?:prodlouzen\\w+\\s+)?vikend\\w*${W}`), m => {
      const long = /prodlouz/.test(m[0]);
      // „nejbližší prodloužený víkend“ se seznamem svátků: ten skutečný (první ze seznamu), ne nejbližší pátek
      if (long && /nejblizsi/.test(m[1] || '') && (o.holidays || []).length) { nearLw = o.holidays[0]; return; }
      days = days || (long ? 3 : 2);
      wk = { long, next: /pristi|dalsi/.test(m[1] || '') };
    });
    // „příští týden“ je kdy (začátek), ne délka – nechat pro parse()
    take(new RegExp(`(?:na\\s+)?(?:cely\\s+)?tyden${W}`), m => { if (/(?:pristi|dalsi|tento|tenhle)\s+$/.test(s.slice(0, m.index))) return false; days = days || 7; });
    take(new RegExp(`(?:s|se)\\s+(?:detmi|ditetem|ditkem|deckama)${W}|pro\\s+deti${W}`), () => { interests.push('kids'); });
    take(new RegExp(`(?:muze\\w*|galeri\\w*|umeni)${W}`), () => { interests.push('art'); });
    take(new RegExp(`(?:pamatk\\w*|histori\\w*|hrad\\w*|zamk\\w*|zamek)${W}`), () => { interests.push('history'); });
    take(new RegExp(`(?:prirod\\w*|vyhled\\w*|vyhlid\\w*)${W}`), () => { interests.push('nature'); });
    // „Barcelona pláže“ = příroda (váha pláží v Objevuj), „Vídeň zoo s dětmi“, „aquapark“ = s dětmi; kavárny, jídlo,
    // nákupy zájem nemají – jen nejsou místo (dřív „Vídeň zoo“, „Krakov kavárny“ jako místo); „Plaza Mayor“ zůstane
    take(new RegExp(`(?:plaz(?:e|i|ich|emi)?|koupani)${W}`), () => { interests.push('nature'); });
    take(new RegExp(`(?:zoo|zoologick\\w+\\s+zahrad\\w*|aquapark\\w*|akvapark\\w*|zabavni\\w*\\s+park\\w*)${W}`), () => { interests.push('kids'); });
    take(new RegExp(`(?:kavarn\\w*|restaurac\\w*|gastro\\w*|jidl\\w*|jidel|nakup\\w*|shopping)${W}`), () => {});
    // „výlet k jezeru“: jezero bez jména = příroda (místo zůstane domov / zbytek věty); „k Lipenskému jezeru“ dál místo
    take(new RegExp(`(?:k|ke|u|na)\\s+jezer\\w*${W}`), () => { interests.push('nature'); });
    const p = parse(blank.join(''), o), pt = p.patch;
    let start = pt.xOut || pt.dFrom || null;
    // „od pátku do neděle“: dny = noci + 1, začátek nejbližší ten den v týdnu (dnes, je-li to on)
    if (!days && pt.len === 'custom' && pt.nMin) days = Math.min(14, pt.nMin + 1);
    // „Paříž 20.–23. 11.“: dny z rozsahu dat (dřív jen začátek a program na výchozí počet dní)
    if (!days && p.backSet && pt.xOut && pt.xBack) { const n = Math.round((Date.parse(pt.xBack) - Date.parse(pt.xOut)) / 864e5) + 1; if (n >= 1 && n <= 14) days = n; }
    if (!start && pt.outDays && pt.outDays.length === 1) { const t = o.today || ymd(new Date()); start = addDays(t, (pt.outDays[0] - dow(t) + 7) % 7); }
    if (nearLw && !start) { start = nearLw.start; days = days || Math.min(14, (nearLw.nights || 2) + 1); }
    // svátek („o Vánocích“, „na Den boje za svobodu“): od prvního volného dne celý prodloužený víkend (noci + 1 den) –
    // dřív od večera před ním bez počtu dní
    if (pt.len === 'holiday' && pt.dTo) { start = pt.dTo; days = days || Math.min(14, (pt.nMin || 2) + 1); }
    // víkend z věty pro lety („na Mikuláše“ = víkend kolem 5. 12., „na prodloužený víkend“): jako „na víkend“ tady
    if (!wk && (pt.len === 'weekend' || pt.len === 'long')) { wk = { long: pt.len === 'long', next: false }; days = days || (wk.long ? 3 : 2); }
    // víkend v pružném termínu („o víkendu v prosinci“, „adventní trhy na víkend“): od první soboty v něm (prodloužený od
    // pátku) – dřív od 1. 12. (úterý)
    if (start && wk && !pt.xOut) { const sat = addDays(start, (6 - dow(start) + 7) % 7), s0 = wk.long ? addDays(sat, -1) : sat; if (!pt.dTo || s0 <= pt.dTo) start = s0 < start ? start : s0; }
    if (!start && wk) {
      // v neděli už ten příští (jako „tento víkend“ u letů); prodloužený v sobotu = od dneška
      const t = o.today || ymd(new Date()), sat = addDays(t, ((6 - dow(t) + 7) % 7) + (wk.next ? 7 : 0)), s0 = wk.long ? addDays(sat, -1) : sat;
      start = s0 < t ? t : s0;
    }
    const place = p.to[0] || p.from[0] || '';
    const chips = [];
    if (mode) chips.push(EX_MODE[mode]);
    if (days) chips.push(`📅 ${days} ${days === 1 ? 'den' : days < 5 ? 'dny' : 'dní'}`);
    if (start) chips.push(`🗓️ od ${dm(start)}`);
    if (km) chips.push(`📏 ${km} km`);
    for (const k of [...new Set(interests)]) chips.push(EX_INT[k]);
    return { place, mode, days, km, start, interests: [...new Set(interests)], chips };
  }

  window.Smart = { parse, stems, bestPlace, fold, nominatives, placeForms, parseExplore };
})();
