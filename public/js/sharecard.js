/* ATLAS – „Jede někdo se mnou?“: karta cesty na sociální sítě a odkaz #jed=… pro kamaráda.
   Lidé se rádi pochlubí, kam jedou – karta to spojí s otázkou, jestli nejede někdo s nimi, a na sítích se tak šíří i ATLAS.
   - Karta je obrázek, který kreslí telefon (canvas) v pevné velikosti podle doporučení Mety: Story 1080 × 1920,
     příspěvek 1080 × 1350 (4:5 – Facebook i Instagram ho ve feedu ukážou celý). Na každém telefonu vypadá stejně.
   - Na kartě je jen odkud, kam a měsíc (žádná cena, přesné datum ani ubytování) – termín uvidí kamarád až v odkazu.
   - Story nechává volné pruhy nahoře (~14 %, jméno profilu) a dole (~20 %, pole pro odpověď) – Instagram je překryje
     a na některých telefonech ořízne. Příspěvek má po stranách okraj na ořez v mřížce profilu (3:4).
   - Instagram v popisku příspěvku klikací odkaz nedovolí: karta pro Instagram zve „Napiš mi“, pro Facebook „v odkazu“.
   - Odkaz #jed=… nese cíl, termín a odkud (JSON zkomprimovaný – sharelink.js); u kamaráda otevře okno s termínem
     a hledáním letů z jeho letiště. Část za # prohlížeč na server neposílá, nic se neukládá.
   Data z odkazu jsou cizí vstup: sanitize() z nich postaví nový objekt jen se známými poli. */
(function () {
  const MONTHS = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
  const MONTHS_IN = ['v lednu', 'v únoru', 'v březnu', 'v dubnu', 'v květnu', 'v červnu', 'v červenci', 'v srpnu', 'v září', 'v říjnu', 'v listopadu', 'v prosinci'];
  const HAND = 'třeba ty?'; // ručně „dopsané“ políčko Vedle mě
  const MAX_HASH = 2000;
  const obj = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
  const isYmd = s => {
    if (typeof s !== 'string' || !/^(19|20|21)\d\d-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(s + 'T00:00:00Z');
    return !isNaN(d) && d.toISOString().slice(0, 10) === s;
  };
  const days = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
  // text bez znaků pro vložení HTML/JS a řídicích znaků (vypisuje se i přes esc() – tohle je druhá pojistka)
  const txt = (v, n) => (typeof v === 'string' ? v.replace(/[<>"'`]/g, '').replace(/[\x00-\x1f\x7f‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');

  /**
   * Bezpečná kopie dat karty (z cesty i z cizího odkazu): cíl (dest, cc, id pro hledání), letiště cíle (a), odlet (o),
   * návrat (b, nejvýš 60 dní po odletu) a odkud (f). Bez cíle nebo data odletu → výjimka.
   */
  function sanitize(raw) {
    if (!obj(raw) || (raw.v != null && raw.v !== 1)) throw new Error('neznámý formát');
    const dest = txt(raw.d, 60), o = isYmd(raw.o) ? raw.o : null;
    if (!dest || !o) throw new Error('neplatná cesta');
    const b = isYmd(raw.b) && raw.b >= raw.o && days(raw.o, raw.b) <= 60 ? raw.b : null;
    const a = typeof raw.a === 'string' && /^[A-Z]{3}$/.test(raw.a) ? raw.a : null;
    const id = typeof raw.id === 'string' && /^(ap|metro):[A-Z0-9]{3}$/.test(raw.id) ? raw.id : a ? 'ap:' + a : null;
    return { dest, cc: typeof raw.cc === 'string' && /^[A-Z]{2}$/.test(raw.cc) ? raw.cc : '', id, a, o, b, f: txt(raw.f, 40) };
  }
  /**
   * Odkaz pro kamaráda /j/<data> místo /#jed=<data>: data jsou v adrese stejná, jen je vidí server – WhatsApp, Messenger
   * i Facebook pak ukážou náhled s otázkou, cílem a fotkou (server/lib/shortlinks.js invitePage) a server pošle
   * prohlížeč do aplikace na /#jed=<data>. Starší odkazy #jed= fungují dál.
   */
  const pathUrl = u => (u ? u.replace(/\/[^/#]*#jed=/, '/j/') : u);
  /** JSON do odkazu #jed= (pročištěný stejně jako při načtení). */
  const json = d => { const s = sanitize(d); return JSON.stringify({ v: 1, d: s.dest, cc: s.cc, id: s.id, a: s.a, o: s.o, b: s.b, f: s.f }); };
  /** Data karty z adresy (#jed=…) → Promise; null, když adresa žádnou kartu nenese; poškozený odkaz → zamítnutí. */
  async function fromHash(hash) {
    const m = String(hash || '').match(/^#jed=(.*)$/);
    if (!m) return null;
    if (!/^[A-Za-z0-9_-]+$/.test(m[1]) || m[1].length > MAX_HASH) throw new Error('poškozený odkaz');
    return sanitize(JSON.parse(await ShareLink.unpack(m[1])));
  }

  const monthOf = d => +d.o.slice(5, 7);
  const nightsTxt = n => `${n} ${n === 1 ? 'noc' : n >= 2 && n <= 4 ? 'noci' : 'nocí'}`;
  /** Velikost písma cíle na letence: krátký název velký, delší menší (dlouhý se zalomí do dvou řádků). */
  const kamSize = (label, base) => { const n = [...String(label)].length; return n <= 9 ? base : n <= 13 ? Math.round(base * 0.8) : Math.round(base * 0.6); };

  /**
   * Do schránky ke sdílení: ke Story jen odkaz (Instagram ho vloží nálepkou „Odkaz“), k příspěvku text s odkazem – na
   * Facebooku je odkaz klikací, na Instagramu ne (proto i „Napiš do komentářů“). Bez přesného data – to je až v odkazu.
   * Název se neskloňuje („Madeira v listopadu“).
   */
  function caption(d, kind, url = '') {
    if (kind === 'story') return url;
    return `${d.dest} ${MONTHS_IN[monthOf(d) - 1]} – jede někdo se mnou? ✈️\nNapiš do komentářů. Termín a lety z tvého letiště: ${url}`;
  }

  /* ---------- kreslení karet (canvas) ---------- */
  const INK = '#0f1830', MUTED = '#56638a', BLUE = '#1d4ed8', VIOLET = '#6d28d9';
  const PLANE = 'M21 15.5v-1.7l-7.5-4.6V4a1.5 1.5 0 0 0-3 0v5.2L3 13.8v1.7l7.5-2.3V18l-2 1.4V21l3.5-1 3.5 1v-1.6l-2-1.4v-4.8z';
  const LOGO = 'M22 2L11 13M22 2l-7 20-4-9-9-4z';
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // Písma: Inter a Sora má stránka, Caveat („třeba ty?“) jen pro kartu a jen s těmi pár písmeny (text=, ~3 kB).
  // Nenačtené písmo (bez sítě) nevadí – rozměry se měří (measureText), karta jen bude v náhradním písmu.
  let fontsP = null;
  function fonts() {
    if (fontsP) return fontsP;
    const css = new Promise(r => {
      if (document.querySelector('link[data-hand]')) return r();
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.dataset.hand = '1'; l.onload = r; l.onerror = r;
      l.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@700&display=swap&text=' + encodeURIComponent(HAND);
      document.head.appendChild(l);
    });
    // písma aplikace platí až po stažení jejich stylu (index.html: media print → all) – do té doby by fonts.load nic nenačetl;
    // styl, který se stáhnout nepovedlo (data-err), už nepřijde – nečekat
    const app = new Promise(r => {
      const l = document.getElementById('fontCss');
      if (!l || l.media === 'all' || l.hasAttribute('data-err')) return r();
      l.addEventListener('load', () => setTimeout(r, 0)); l.addEventListener('error', r);
    });
    const load = (f, s) => (document.fonts && document.fonts.load ? document.fonts.load(f, s).catch(() => { }) : null);
    const all = Promise.all([css, app]).then(() => Promise.all([load('800 100px Sora', 'Jede někdo se mnou?'), load('700 50px Sora', 'Praha'), load('800 30px Inter', 'HLEDÁM PARŤÁKA'),
      load('700 30px Inter', 'klikni'), load('600 22px Inter', 'foto'), load('700 70px Caveat', HAND)]));
    fontsP = Promise.race([all, wait(8000)]); // pomalá síť: karta se kreslí, zatímco okno ukazuje „Chystám obrázky…“
    return fontsP;
  }

  // Fotka cíle (api/photos – Pexels / Unsplash s klíčem, jinak Wikimedia) v potřebném výřezu. Obrázek z jiného serveru
  // musí přijít s CORS (crossOrigin), jinak by plátno nešlo uložit – pak karta bez fotky (barevné pozadí).
  const SRC = { 'images.pexels.com': 'Pexels', 'images.unsplash.com': 'Unsplash' };
  function img(u) {
    return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = u; });
  }
  const photoInfo = {};
  async function photo(label, w, h) {
    try {
      if (!photoInfo[label]) photoInfo[label] = fetch('api/photos?v=3&t=' + encodeURIComponent(label)).then(r => r.json());
      const j = await photoInfo[label], u = String((j.photos || {})[label] || '');
      if (!/^https:\/\//.test(u)) return null;
      const host = (/^https:\/\/([^/]+)\//.exec(u) || [])[1];
      const sized = SRC[host] ? u.replace(/w=960&h=1200/, `w=${w}&h=${h}`) : u.replace('/960px-', '/1280px-');
      const by = txt(String((j.by || {})[label] || ''), 40);
      return { img: await img(sized), credit: SRC[host] ? `foto: ${by ? by + ' / ' : ''}${SRC[host]}` : `foto: ${by || 'Wikimedia Commons'}` };
    } catch (e) {
      return null;
    }
  }

  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function rr(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
  function cover(x, im, X, Y, w, h) {
    const s = Math.max(w / im.width, h / im.height), sw = w / s, sh = h / s;
    x.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, X, Y, w, h);
  }
  function vgrad(x, Y0, Y1, stops) {
    const g = x.createLinearGradient(0, Y0, 0, Y1);
    stops.forEach(([p, c]) => g.addColorStop(p, c));
    x.fillStyle = g; x.fillRect(0, Y0, x.canvas.width, Y1 - Y0);
  }
  // pozadí bez fotky: tmavý přechod v barvách ATLASu
  function noPhoto(x, w, h) {
    const g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#0e7490'); g.addColorStop(0.5, '#1e3a8a'); g.addColorStop(1, '#5b21b6');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  }
  /** Text s prostrkáním (štítky „ODKUD“, „HLEDÁM PARŤÁKA…“) → šířka. align 'right' kreslí doleva od X. */
  function spaced(x, s, X, Y, sp, align = 'left', draw = true) {
    const chars = [...s], w = chars.reduce((a, ch) => a + x.measureText(ch).width, 0) + sp * (chars.length - 1);
    if (!draw) return w;
    let cx = align === 'right' ? X - w : X;
    x.textAlign = 'left';
    for (const ch of chars) { x.fillText(ch, cx, Y); cx += x.measureText(ch).width + sp; }
    return w;
  }
  /** Největší velikost písma (font se značkou {s}) do maxW, nejméně min. */
  function fit(x, s, font, size, maxW, min = Math.round(size * 0.55)) {
    let z = size;
    for (; z > min; z -= 2) { x.font = font.replace('{s}', z); if (x.measureText(s).width <= maxW) break; }
    x.font = font.replace('{s}', z);
    return z;
  }
  /** Zalomení do řádků podle slov (nejvýš n řádků; poslední se případně zmenší přes fit u volajícího). */
  function wrap(x, s, maxW, n = 2) {
    const words = s.split(' '), lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (cur && x.measureText(t).width > maxW && lines.length < n - 1) { lines.push(cur); cur = w; } else cur = t;
    }
    lines.push(cur);
    return lines;
  }
  function plane(x, cx, cy, size, color) {
    x.save(); x.translate(cx, cy); x.rotate(Math.PI / 2); x.scale(size / 24, size / 24); x.translate(-12, -12);
    x.fillStyle = color; x.fill(new Path2D(PLANE)); x.restore();
  }
  function dashed(x, X0, Y0, X1, Y1, wdt, color, dash = [14, 11]) {
    x.save(); x.setLineDash(dash); x.lineWidth = wdt; x.strokeStyle = color; x.beginPath(); x.moveTo(X0, Y0); x.lineTo(X1, Y1); x.stroke(); x.restore();
  }
  function barcode(x, X, Y, w, h) {
    x.fillStyle = INK;
    const pat = [5, 4, 2, 6, 3, 4, 5, 3, 2, 5, 4, 2, 3, 6];
    for (let cx = X, i = 0; cx < X + w; i++) { const bw = pat[i % pat.length] * (i % 2 ? 0 : 1); if (bw) x.fillRect(cx, Y, Math.min(bw, X + w - cx), h); cx += pat[i % pat.length]; }
  }
  // značka ATLAS: zaoblený čtverec v barvách aplikace s papírovou vlaštovkou + název
  function mark(x, X, Y, size, label, color, align = 'left') {
    x.font = `700 ${Math.round(size * 0.8)}px Inter, sans-serif`;
    const tw = spaced(x, label, 0, 0, 2, 'left', false), total = size + 10 + tw, X0 = align === 'right' ? X - total : X;
    const g = x.createLinearGradient(X0, Y, X0 + size, Y + size);
    g.addColorStop(0, '#22d3ee'); g.addColorStop(0.45, '#5b8cff'); g.addColorStop(1, '#a855f7');
    x.fillStyle = g; rr(x, X0, Y, size, size, size * 0.3); x.fill();
    x.save(); x.translate(X0 + size * 0.2, Y + size * 0.2); x.scale(size * 0.6 / 24, size * 0.6 / 24);
    x.strokeStyle = '#fff'; x.lineWidth = 2.6; x.lineCap = 'round'; x.lineJoin = 'round'; x.stroke(new Path2D(LOGO)); x.restore();
    x.fillStyle = color; x.textBaseline = 'middle';
    spaced(x, label, X0 + size + 10, Y + size / 2 + 1, 2);
    x.textBaseline = 'alphabetic';
  }
  function pill(x, s, X, Y, size) {
    x.font = `800 ${size}px Inter, sans-serif`;
    const sp = size * 0.17, w = spaced(x, s, 0, 0, sp, 'left', false), h = size + size * 0.95, padX = size;
    x.fillStyle = 'rgba(255,255,255,.16)'; rr(x, X, Y, w + padX * 2, h, h / 2); x.fill();
    x.lineWidth = 2; x.strokeStyle = 'rgba(255,255,255,.42)'; x.stroke();
    x.fillStyle = '#fff'; x.textBaseline = 'middle';
    spaced(x, s, X + padX, Y + h / 2 + 1, sp);
    x.textBaseline = 'alphabetic';
    return h;
  }
  // nadpis s měkkým stínem (čitelný na světlé i tmavé fotce)
  function shadowed(x, fn, blur = 40, dy = 6) {
    x.save(); x.shadowColor = 'rgba(0,0,0,.5)'; x.shadowBlur = blur; x.shadowOffsetY = dy; fn(); x.restore();
  }
  function label(x, s, X, Y, size, align = 'left') {
    x.font = `800 ${size}px Inter, sans-serif`; x.fillStyle = MUTED;
    spaced(x, s, X, Y, size * 0.17, align);
  }
  // „třeba ty?“ jako dopsané propiskou: fialově, mírně šikmo
  function hand(x, X, Y, size, maxW) {
    x.save(); x.translate(X, Y); x.rotate(-4 * Math.PI / 180);
    fit(x, HAND, '700 {s}px Caveat, "Segoe Print", "Bradley Hand", cursive', size, maxW); x.fillStyle = VIOLET; x.textAlign = 'left';
    x.fillText(HAND, 0, 0); x.restore();
  }

  /**
   * Trasa na letence: ODKUD vlevo, KAM vpravo (dlouhý cíl menší a na dva řádky), mezi nimi čárkovaná dráha s letadlem.
   * bottom = účaří posledního řádku cíle.
   */
  function route(x, d, L, R, bottom, s) {
    x.textBaseline = 'alphabetic';
    // KAM
    const kz = kamSize(d.dest, s.kam);
    x.font = `800 ${kz}px Sora, Inter, sans-serif`;
    let lines = wrap(x, d.dest, s.kamMax);
    const last = lines.length - 1;
    if (x.measureText(lines[last]).width > s.kamMax) fit(x, lines[last], '800 {s}px Sora, Inter, sans-serif', kz, s.kamMax);
    x.fillStyle = INK; x.textAlign = 'right';
    lines.forEach((ln, i) => x.fillText(ln, R, bottom - (last - i) * kz * 0.98));
    const kw = Math.max(...lines.map(ln => x.measureText(ln).width));
    x.textAlign = 'left';
    label(x, 'KAM', R, bottom - last * kz * 0.98 - kz * 0.8 - s.gap, s.lbl, 'right');
    // ODKUD
    const from = d.f || '';
    const fz = from ? fit(x, from, '700 {s}px Sora, Inter, sans-serif', s.from, Math.max(120, R - L - kw - s.mid)) : 0;
    const fw = from ? x.measureText(from).width : 0; // před label() – ten přepne písmo
    if (from) {
      x.fillStyle = INK; x.fillText(from, L, bottom - 4);
      label(x, 'ODKUD', L, bottom - 4 - fz * 0.82 - s.gap, s.lbl);
    }
    // dráha s letadlem
    const a = L + fw + s.pad, b = R - kw - s.pad, cy = bottom - s.from * 0.42;
    if (b - a > s.plane * 2) {
      const m = (a + b) / 2;
      dashed(x, a, cy, m - s.plane * 0.7, cy, s.dash, '#c3cbe0');
      dashed(x, m + s.plane * 0.7, cy, b, cy, s.dash, '#c3cbe0');
      plane(x, m, cy, s.plane, '#2563eb');
    }
    return lines.length;
  }
  /** Počet řádků cíle na letence (dlouhý název se zalomí) – podle něj výška horní části letenky. */
  function kamLines(x, dest, base, maxW) { x.font = `800 ${kamSize(dest, base)}px Sora, Inter, sans-serif`; return wrap(x, dest, maxW).length; }
  /** Pole letenky (KDY / POČASÍ / VEDLE MĚ): štítek a hodnota, šířka sloupce col. */
  function field(x, lbl, val, X, Y, col, s) {
    label(x, lbl, X, Y - s.val - s.gap, s.lbl);
    x.fillStyle = INK;
    fit(x, val, '700 {s}px Sora, Inter, sans-serif', s.val, col);
    x.fillText(val, X, Y);
  }
  const fieldsOf = d => [['KDY', MONTHS[monthOf(d) - 1]], d.temp != null ? ['POČASÍ', `~${d.temp} °C`] : d.b ? ['DÉLKA', nightsTxt(days(d.o, d.b))] : null].filter(Boolean);

  /** Story 1080 × 1920: fotka, „Jede někdo se mnou?“ nahoře, letenka dole – obojí mimo pruhy, které Instagram překryje. */
  function story(d, ph) {
    const W = 1080, H = 1920, c = canvas(W, H), x = c.getContext('2d');
    if (ph) cover(x, ph.img, 0, 0, W, H); else noPhoto(x, W, H);
    vgrad(x, 0, 960, [[0, 'rgba(8,12,26,.68)'], [0.48, 'rgba(8,12,26,.34)'], [1, 'rgba(8,12,26,0)']]);
    vgrad(x, 840, H, [[0, 'rgba(8,12,26,0)'], [0.55, 'rgba(8,12,26,.46)'], [1, 'rgba(8,12,26,.82)']]);
    const ph1 = pill(x, 'HLEDÁM PARŤÁKA NA CESTU', 84, 292, 30);
    shadowed(x, () => {
      x.fillStyle = '#fff';
      const z = Math.min(fit(x, 'Jede někdo', '800 {s}px Sora, Inter, sans-serif', 162, 912), fit(x, 'se mnou?', '800 {s}px Sora, Inter, sans-serif', 162, 912));
      x.font = `800 ${z}px Sora, Inter, sans-serif`;
      const y1 = 292 + ph1 + 30 + z * 0.8;
      x.fillText('Jede někdo', 84, y1); x.fillText('se mnou?', 84, y1 + z * 0.95);
    }, 44, 8);
    // letenka 936 × 557: trasa | čárkovaný předěl s výřezy | pole | výzva s čárovým kódem
    const tw = 936, t = canvas(tw, 557), y = t.getContext('2d');
    const A = kamLines(y, d.dest, 96, 560) > 1 ? 236 : 196, th = A + 321; // předěl pod trasou, letenka pod ním 321 px
    y.fillStyle = '#fff'; rr(y, 0, 0, tw, th, 44); y.fill();
    route(y, d, 56, tw - 56, A - 36, { kam: 96, kamMax: 560, from: 56, lbl: 24, gap: 10, pad: 26, plane: 54, mid: 140, dash: 4 });
    dashed(y, 56, A, tw - 56, A, 4, '#d3d9e8', [16, 12]);
    const col = (tw - 112 - 48) / 3, fs = fieldsOf(d), fy = A + 120;
    fs.forEach(([l, v], i) => field(y, l, v, 56 + i * (col + 24), fy, col, { lbl: 24, val: 50, gap: 22 }));
    const hx = 56 + fs.length * (col + 24);
    label(y, 'VEDLE MĚ', hx, fy - 50 - 22, 24);
    hand(y, hx, fy + 16, 74, tw - 40 - hx);
    y.fillStyle = '#eef2fb'; y.fillRect(0, A + 172, tw, 3);
    y.fillStyle = INK; fit(y, 'Termín a lety z tvého letiště', '800 {s}px Inter, sans-serif', 36, tw - 112 - 200);
    y.fillText('Termín a lety z tvého letiště', 56, A + 230);
    y.fillStyle = BLUE; y.font = '700 30px Inter, sans-serif'; y.fillText('↓  klikni na odkaz', 56, A + 276);
    barcode(y, tw - 56 - 176, A + 198, 176, 62);
    mark(y, tw - 56, A + 272, 26, 'ATLAS', MUTED, 'right');
    // výřezy po stranách předělu
    y.globalCompositeOperation = 'destination-out';
    [0, tw].forEach(cx => { y.beginPath(); y.arc(cx, A, 30, 0, Math.PI * 2); y.fill(); });
    y.globalCompositeOperation = 'source-over';
    x.save(); x.shadowColor = 'rgba(0,0,0,.5)'; x.shadowBlur = 46; x.shadowOffsetY = 30; x.drawImage(t, 0, 0, tw, th, 72, H - 392 - th, tw, th); x.restore();
    if (ph) { x.font = '400 22px Inter, sans-serif'; x.fillStyle = 'rgba(255,255,255,.8)'; x.textAlign = 'right'; x.fillText(ph.credit, W - 84, H - 336); x.textAlign = 'left'; }
    return c;
  }

  /** Příspěvek 1080 × 1350 (4:5): fotka s „Jede někdo se mnou?“ a letenka s ústřižkem „Napiš mi“ – platí pro Facebook
   *  i Instagram (tam odkaz v popisku klikací není). */
  function post(d, ph) {
    const W = 1080, H = 1350, P = 880, c = canvas(W, H), x = c.getContext('2d');
    x.fillStyle = '#eef2fb'; x.fillRect(0, 0, W, H);
    x.save(); x.beginPath(); x.rect(0, 0, W, P); x.clip();
    if (ph) cover(x, ph.img, 0, 0, W, P); else noPhoto(x, W, P);
    vgrad(x, P * 0.28, P, [[0, 'rgba(8,12,26,0)'], [0.42, 'rgba(8,12,26,.4)'], [1, 'rgba(8,12,26,.84)']]);
    x.restore();
    if (ph) shadowed(x, () => { x.font = '400 18px Inter, sans-serif'; x.fillStyle = '#fff'; x.textAlign = 'right'; x.fillText(ph.credit, W - 48, 44); x.textAlign = 'left'; }, 6, 1);
    const z = Math.min(fit(x, 'Jede někdo', '800 {s}px Sora, Inter, sans-serif', 112, 950), fit(x, 'se mnou?', '800 {s}px Sora, Inter, sans-serif', 112, 950));
    const y2 = P - 64, y1 = y2 - z * 0.96;
    shadowed(x, () => {
      x.fillStyle = '#fff'; x.font = `800 ${z}px Sora, Inter, sans-serif`;
      x.fillText('Jede někdo', 64, y1); x.fillText('se mnou?', 64, y2);
    }, 30, 6);
    pill(x, 'HLEDÁM PARŤÁKA NA CESTU', 64, y1 - z * 0.8 - 22 - 48, 24);
    // letenka 984 × 378: hlavní část 700 (trasa | předěl | pole) | perforace s výřezy | ústřižek s výzvou
    const tw = 984, th = 378, M = 700, t = canvas(tw, th), y = t.getContext('2d');
    y.fillStyle = '#fff'; rr(y, 0, 0, tw, th, 36); y.fill();
    const two = kamLines(y, d.dest, 72, 380) > 1, ry = two ? 160 : 138;
    route(y, d, 44, M - 44, ry, { kam: 72, kamMax: 380, from: 44, lbl: 20, gap: 8, pad: 20, plane: 40, mid: 110, dash: 3 });
    dashed(y, 44, ry + 38, M - 44, ry + 38, 3, '#e3e8f3', [12, 10]);
    const col = (M - 88 - 36) / 3, fs = fieldsOf(d);
    fs.forEach(([l, v], i) => field(y, l, v, 44 + i * (col + 18), 330, col, { lbl: 20, val: 40, gap: 16 }));
    const hx = 44 + fs.length * (col + 18);
    label(y, 'VEDLE MĚ', hx, 330 - 40 - 16, 20);
    hand(y, hx, 344, 60, M - 16 - hx);
    dashed(y, M + 2, 30, M + 2, th - 30, 4, '#d3d9e8', [14, 11]);
    const sx = M + 36, sw = tw - sx - 30;
    const [l1, l2] = ['Chceš jet? Napiš mi', 'pošlu ti termín →'];
    y.fillStyle = INK; y.font = '800 30px Inter, sans-serif';
    const ls = wrap(y, l1, sw, 3);
    ls.forEach((ln, i) => y.fillText(ln, sx, 74 + i * 36));
    y.fillStyle = BLUE; y.font = '700 25px Inter, sans-serif';
    wrap(y, l2, sw, 2).forEach((ln, i) => y.fillText(ln, sx, 74 + ls.length * 36 + 12 + i * 31));
    barcode(y, sx, th - 34 - 30 - 18 - 52, sw, 52);
    mark(y, sx, th - 34 - 30, 30, 'ATLAS', MUTED);
    y.globalCompositeOperation = 'destination-out';
    [0, th].forEach(cy => { y.beginPath(); y.arc(M + 2, cy, 26, 0, Math.PI * 2); y.fill(); });
    y.globalCompositeOperation = 'source-over';
    x.save(); x.shadowColor = 'rgba(15,24,48,.18)'; x.shadowBlur = 30; x.shadowOffsetY = 18; x.drawImage(t, 48, P + 44); x.restore();
    return c;
  }

  const blobOf = c => new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('obrázek se nevytvořil'))), 'image/jpeg', 0.92));
  /**
   * Obrázky karet → Promise<{ story, post }> (každý { canvas, file }). Fotka z jiného serveru bez CORS by plátno
   * „zašpinila“ (toBlob → SecurityError) – pak se karty nakreslí znovu bez fotky.
   */
  async function render(d) {
    await fonts();
    const [p1, p2] = await Promise.all([photo(d.dest, 1080, 1920), photo(d.dest, 1080, 830)]);
    const make = async (a, b) => {
      const cs = { story: story(d, a), post: post(d, b) }, out = {};
      for (const [k, cv] of Object.entries(cs)) out[k] = { canvas: cv, file: new File([await blobOf(cv)], `atlas-${k === 'story' ? 'story' : 'prispevek'}.jpg`, { type: 'image/jpeg' }) };
      return out;
    };
    try { return await make(p1, p2); } catch (e) {
      if (e && e.name === 'SecurityError') return make(null, null);
      throw e;
    }
  }

  /* ---------- okno Sdílet cestu (Shrnutí průvodce, plánovač) ---------- */
  const canFiles = f => { try { return typeof navigator.canShare === 'function' && navigator.canShare({ files: [f] }); } catch (e) { return false; } };
  function save(file) {
    const a = document.createElement('a'), u = URL.createObjectURL(file);
    a.href = u; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 60000);
  }
  // schránka bez čekání (Safari dovolí zápis jen v obsluze klepnutí – nabídka sdílení hned po něm)
  const clip = s => { try { const p = navigator.clipboard && navigator.clipboard.writeText(s); if (p) p.catch(() => { }); return Boolean(p); } catch (e) { return false; } };

  // Instagram ani Facebook nedovolí aplikaci přidat k obrázku klikací odkaz – zkopíruje se a nápověda řekne, kam ho vložit
  const HINT = {
    story: 'Odkaz na cestu se zkopíruje. V Instagramu přidej nálepku „Odkaz“ a vlož ho – kdo klepne, uvidí termín.',
    post: 'Text s odkazem se zkopíruje – vlož ho do popisku. Na Facebooku bude odkaz klikací, na Instagramu se ti lidi ozvou v komentářích.',
  };
  const SVG = (d, w = 22) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const I_CHAT = '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>';
  const I_ADD = '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3 2.9-4.8 5.5-4.8s4.9 1.8 5.5 4.8"/><path d="M17 7.5v5M14.5 10h5"/>';
  const I_SHARE = '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>';
  const I_DOWN = '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M5 20h14"/>';
  const I_LOCK = '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>';

  /**
   * Okno „Sdílet cestu“: Poslat kamarádům (o.send – celá cesta odkazem, jako dřív) a Jede někdo se mnou? – miniatury
   * Story a příspěvku (klepnutím se vybere) a jedno tlačítko Sdílet. Karty se nakreslí hned po otevření okna, klepnutí
   * je pak jen pošle (nabídka sdílení i schránka chtějí běžet ještě v obsluze klepnutí).
   */
  function open(d0, o = {}) {
    let d;
    try { d = sanitize(d0); } catch (e) { if (o.send) o.send(); return; }
    const past = d.o < fmtYMD(new Date());
    const link = ShareLink.prepare('jed', json(d0));
    const cardTxt = `${d.f ? `${esc(d.f)} → ` : ''}${esc(d.dest)} · ${MONTHS[monthOf(d) - 1]}`;
    // „bez ubytování“ platí jen pro kartu na sítě – Poslat kamarádům posílá celou cestu i s ubytováním (proto zámek jen
    // u karty; pod celým oknem by tvrdil opak toho, co je o řádek výš, u proběhlé cesty dokonce jen pod Poslat kamarádům)
    const thumb = (k, n, on) => `<div class="jed-tw"><button type="button" class="jed-th ${k}${on ? ' on' : ''}" data-kind="${k}" aria-pressed="${on}" aria-label="Karta: ${n}"><span class="jed-ph"></span></button><span>${n}</span></div>`;
    modalOpen(`<div class="modal-body jed-sheet">
      <div class="jed-top"><h3>Sdílet cestu</h3><button type="button" class="jed-x" data-close aria-label="Zavřít">${SVG('<path d="M6 6l12 12M18 6L6 18"/>', 18)}</button></div>
      <button type="button" class="jed-opt" id="jedSend"><span class="jed-ic">${SVG(I_CHAT)}</span><span class="jed-t"><span class="jed-n"><b>Poslat kamarádům</b><small class="jed-tag">soukromě</small></span><span class="jed-d">Celá cesta – lety, ubytování a program po dnech. Do WhatsAppu, Messengeru nebo e-mailu.</span></span>${SVG('<path d="M9 6l6 6-6 6"/>', 18)}</button>
      ${past ? '' : `<div class="jed-pub">
        <div class="jed-opt plain"><span class="jed-ic pub">${SVG(I_ADD)}</span><span class="jed-t"><span class="jed-n"><b>Jede někdo se mnou?</b><small class="jed-tag pub">na sítě</small></span><span class="jed-d">Veřejná otázka pro tvoje sledující. Na kartě jen místo a měsíc – přesný termín uvidí až po kliknutí.</span></span></div>
        <div class="jed-row">${thumb('story', 'Story', true)}${thumb('post', 'Příspěvek', false)}
          <div class="jed-on"><span>Na kartě:</span><b>${cardTxt}</b><span>bez ceny, bez ubytování</span></div></div>
        <button type="button" class="jed-go2" id="jedShare" disabled>${SVG(I_SHARE, 18)}<span>Chystám obrázky…</span></button>
        <div class="jed-hint" id="jedHint">${HINT.story}</div>
        <button type="button" class="jed-msg" id="jedMsg">${SVG(I_CHAT, 18)}<span>Pozvat zprávou (WhatsApp…)</span></button>
      </div>`}
      ${past ? '' : `<div class="jed-lock">${SVG(I_LOCK, 16)}Bez účtu. Karta pro sítě nikdy neukáže ubytování ani adresu.</div>`}
    </div>`);
    $$('#modal [data-close]').forEach(b => { b.onclick = () => modalClose(); });
    // krátký odkaz na celou cestu (sharelink.js short) se začne ukládat už při dotyku – až když ji opravdu posílá
    $('#jedSend').onpointerdown = () => { if (o.prime) o.prime(); };
    $('#jedSend').onclick = () => { modalClose(); if (o.send) o.send(); };
    if (past) return;
    let cards = null, kind = 'story';
    const btn = $('#jedShare'), label = () => (cards && !canFiles(cards[kind].file) ? 'Stáhnout obrázek' : 'Sdílet na Instagram, Facebook…');
    $$('#modal .jed-th').forEach(b => {
      b.onclick = () => {
        kind = b.dataset.kind;
        $('#jedHint').textContent = HINT[kind];
        $$('#modal .jed-th').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
      };
    });
    // pole Počasí: dlouhodobý průměr v měsíci odletu (bez dat pole Délka)
    temp(d).then(t => { d.temp = t; return render(d); }).then(r => {
      cards = r;
      if (!btn.isConnected) return;
      for (const k of ['story', 'post']) { const ph = $(`#modal .jed-th.${k} .jed-ph`); if (ph) ph.replaceWith(r[k].canvas); }
      btn.disabled = false;
      btn.innerHTML = `${SVG(canFiles(r.story.file) ? I_SHARE : I_DOWN, 18)}<span>${label()}</span>`;
    }).catch(() => { if (btn.isConnected) btn.querySelector('span').textContent = 'Obrázky se nepodařilo připravit'; });
    // pozvánka do zprávy: text a odkaz /j/ – náhled ve WhatsAppu a Messengeru s fotkou cíle a otázkou
    $('#jedMsg').onclick = async () => {
      const url = pathUrl(link.url);
      if (!url) { toast('Odkaz se ještě chystá – klepni znovu za chvilku'); return; }
      const text = `${d.dest} ${MONTHS_IN[monthOf(d) - 1]} – jede někdo se mnou? ✈️`;
      if (navigator.share) {
        try { await navigator.share({ text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
      }
      if (clip(`${text}\n${url}`)) toast('Pozvánka je zkopírovaná – vlož ji do zprávy');
      else prompt('Zkopíruj pozvánku:', url);
    };
    btn.onclick = async () => {
      if (!cards) return;
      const file = cards[kind].file, url = pathUrl(link.url);
      if (!url) { toast('Odkaz se ještě chystá – klepni znovu za chvilku'); return; }
      const text = caption(d, kind, url);
      const copied = clip(text);
      // co je ve schránce a kam to vložit (ve Story odkaz přes nálepku – jinak klikací není)
      const hint = kind === 'story' ? 'odkaz je zkopírovaný – v Instagramu ho vlož nálepkou „Odkaz“' : 'text s odkazem je zkopírovaný – vlož ho do popisku';
      if (canFiles(file)) {
        try {
          await navigator.share({ files: [file], ...(kind === 'post' ? { text } : {}) });
          if (copied) toast(hint[0].toUpperCase() + hint.slice(1), '', 6000);
        } catch (e) {
          if (!(e && e.name === 'AbortError')) { save(file); toast('Sdílení se nepovedlo – obrázek je stažený', 'err'); }
        }
      } else {
        save(file);
        toast(copied ? `Obrázek je stažený, ${hint}` : 'Obrázek je stažený', '', 6000);
      }
    };
  }

  /* ---------- okno pro kamaráda z odkazu #jed= ---------- */
  const DOW = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];
  const dmy = s => `${+s.slice(8, 10)}. ${+s.slice(5, 7)}.`;
  const dow = s => DOW[new Date(s + 'T12:00:00Z').getUTCDay()];
  function termTxt(d) {
    if (!d.b) return { main: `od ${dmy(d.o)} ${d.o.slice(0, 4)}`, sub: `${dow(d.o)}` };
    const n = days(d.o, d.b);
    return { main: `${dmy(d.o)} – ${dmy(d.b)} ${d.b.slice(0, 4)}`, sub: `${nightsTxt(n)} · ${dow(d.o)} až ${dow(d.b)}` };
  }
  /** Okno pro kamaráda: kam a kdy, počasí v tom měsíci a hledání letů na stejný termín z jeho letiště (Flights.searchTo). */
  function landing(d) {
    const past = d.o < fmtYMD(new Date()), tm = termTxt(d), home = S.home && S.home.from && S.home.from[0];
    const item = { id: d.id || '', label: d.dest, flag: flag(d.cc) };
    modalOpen(`<div class="jed-land">
      <div class="jed-hero" data-photo="${esc(d.dest)}">
        <button type="button" class="modal-close" data-close aria-label="Zavřít">${ico('M18 6L6 18M6 6l12 12')}</button>
        <div class="jed-hero-in"><div class="jed-kick">🙋 Kamarád se ptá: jedeš taky?</div><h2>${flag(d.cc)} ${esc(d.dest)}</h2>${d.f ? `<div class="jed-from">odkud: ${esc(d.f)}</div>` : ''}</div>
      </div>
      <div class="modal-body">
        <div class="card jed-term"><span class="jed-ic">🗓️</span><div><div class="faint">Termín</div><b>${esc(tm.main)}</b><div class="faint">${esc(tm.sub)}</div></div></div>
        <div class="card jed-term" id="jedWx" hidden></div>
        ${past ? '<div class="note warn">⚠️ <div><b>Tenhle termín už proběhl.</b> Lety do stejného místa najdeš i na jiný termín.</div></div>' : ''}
        ${d.id ? `<button type="button" class="btn primary jed-go" id="jedGo">✈️ ${past ? 'Najít lety – ' + esc(d.dest) : 'Najít lety na tenhle termín'}</button>
        <div class="faint jed-home">${home ? `Hledám z tvého letiště: <b>${esc(home.label)}</b> – můžeš ho změnit ve formuláři.` : 'Zeptám se, odkud letíš – Praha, Brno, Vídeň…'}</div>` : ''}
        <div class="note info jed-dm">💬 <div><b>Chceš jet?</b> Napiš kamarádovi tam, kde jsi to viděl – do komentářů nebo do zpráv.</div></div>
        <div class="faint jed-foot">ATLAS – levné letenky a plánování cest. Zdarma, bez registrace. Odkaz nese jen cíl a termín.</div>
      </div>
    </div>`);
    $$('#modal [data-close]').forEach(b => { b.onclick = () => modalClose(); });
    if (window.Photos) Photos.paint($('#modal'));
    const go = $('#jedGo');
    if (go) go.onclick = () => { modalClose(); Flights.searchTo([item], past ? {} : { xOut: d.o, xBack: d.b || '' }); };
    // počasí v měsíci cesty (dlouhodobý průměr u letiště cíle)
    if (d.a) fetch('api/climate?iata=' + d.a).then(r => (r.ok ? r.json() : null)).then(j => {
      const m = monthOf(d), hi = j && Array.isArray(j.hi) ? j.hi[m - 1] : null, el = $('#jedWx');
      if (!el || !Number.isFinite(hi)) return;
      el.innerHTML = `<span class="jed-ic">🌡️</span><div><div class="faint">Počasí ${MONTHS_IN[m - 1]}</div><b>~${Math.round(hi)} °C přes den</b><div class="faint">dlouhodobý průměr, ne předpověď</div></div>`;
      el.hidden = false;
    }).catch(() => { });
  }

  /** Průměrná denní maxima v měsíci odletu u letiště cíle (api/climate) → Promise<číslo | null> – pole Počasí na kartě. */
  async function temp(d) {
    if (!d || !/^[A-Z]{3}$/.test(d.a || '') || !isYmd(d.o)) return null;
    try {
      const j = await (await fetch('api/climate?iata=' + d.a)).json(), hi = Array.isArray(j.hi) ? j.hi[+d.o.slice(5, 7) - 1] : null;
      return Number.isFinite(hi) ? Math.round(hi) : null;
    } catch (e) { return null; }
  }

  window.ShareCard = { sanitize, json, fromHash, caption, kamSize, monthsIn: MONTHS_IN, pathUrl, open, landing, temp, render };
})();
