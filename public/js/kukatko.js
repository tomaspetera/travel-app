/* Kukátko Letsi · živý průvodce aplikací (vzhled Letsi, krok 4) – jen za přepínačem ?vzhled=letsi
 * Knihovna je referenční implementace z balíku identity Letsi 2.1 (kukatko/kukatko.js) beze změny tvaru, časů a API;
 * úpravy pro ATLAS: (1) nic nedělá bez <html data-brand="letsi">, (2) mrkání se neplánuje kukátku mimo stránku,
 * (3) napojení na obrazovky ATLASu dole (část „Napojení na ATLAS“). Načte ho jen vložený skript na konci index.html,
 * a to jen se vzhledem Letsi – bez přepínače se nestáhne ani tenhle soubor, ani css/kukatko.css.
 * Geometrie (blok GEO) je vygenerovaná z masteru – ručně neměnit. Barvy nemá v kódu: dává je css/kukatko.css.
 * Šetří baterii: žádná smyčka requestAnimationFrame. Pohyb dělají CSS přechody, mrkání hlídá jeden setTimeout,
 * který se při skryté stránce, při omezeném pohybu a v klidu vůbec neplánuje.
 *
 *   var k = Kukatko.mount(el, {size: 80, probud: true, klid: tecka});
 *   k.look(x, y) | k.look(el) | k.look('ty') | k.look(null)  pohled: bod okna, prvek, na tebe, zpět ke klidu
 *   k.blink() | k.blink(true)       přirozené mrknutí oběma okénky (dvojité); to není Mrk
 *   k.state('koukam'|'hledam'|'chvilku'|'nic'|'noc'|'offline'|'klid', cil)   výraz clonou (+ kam se v něm dívá)
 *   k.mam(tecka)                    Mám to: dvě slunce → jedno + Mrk + slunce dosedne k ceně (vrací Promise)
 *   k.glance(el, ms)                krátký pohled na věc, která se změnila
 *   k.klid(el)                      kam se dívá, když nic neděláš (nejlevnější cena)
 *   Kukatko.omezPohyb(true|false|null)   přepíše prefers-reduced-motion (null = podle systému)
 */
(function () {
  'use strict';
  // bez vzhledu Letsi nic: žádné posluchače, žádné prvky, nic se nestahuje (aplikace se nezmění ani o pixel)
  if (document.documentElement.getAttribute('data-brand') !== 'letsi') return;
  /*GEO*/var G = {"w":64,"h":100,"cx":48.0,"pr":20,"m":5,"rest":-8,"turn":6.0,"outer":"M-51.36 -87H-44.64Q-21.61 -87 -5.87 -78.18Q-3.13 -76.65 0 -76.65Q3.13 -76.65 5.87 -78.18Q21.61 -87 44.64 -87H51.36Q84.28 -87 102.14 -69.14Q120 -51.28 120 -18.36V18.36Q120 51.28 102.14 69.14Q84.28 87 51.36 87L44.64 87Q21.61 87 5.87 78.18Q3.13 76.65 0 76.65Q-3.13 76.65 -5.87 78.18Q-21.61 87 -44.64 87H-51.36Q-84.28 87 -102.14 69.14Q-120 51.28 -120 18.36V-18.36Q-120 -51.28 -102.14 -69.14Q-84.28 -87 -51.36 -87Z","ap":"M-2.56 -50H2.56C21.39 -50 32 -39.39 32 -20.56V20.56C32 39.39 21.39 50 2.56 50H-2.56C-21.39 50 -32 39.39 -32 20.56V-20.56C-32 -39.39 -21.39 -50 -2.56 -50Z"};
  var RAY = [7,7,7,7,7,7.1,7.1,7.1,7.1,7.1,7.1,7.2,7.2,7.2,7.2,7.3,7.3,7.3,7.4,7.4,7.5,7.5,7.6,7.6,7.7,7.8,7.8,7.9,8,8,8.1,8.2,8.3,8.4,8.5,8.6,8.7,8.8,8.9,9.1,9.2,9.3,9.5,9.6,9.8,9.9,10.1,10.3,10.5,10.7,10.9,11.2,11.4,11.7,12,12.3,12.6,12.9,13.3,13.7,14.1,14.5,14.9,15.4,15.9,16.3,16.8,17.2,17.6,17.8,17.8,17.7,17.7,17.6,17.6,17.5,17.5,17.4,17.4,17.3,17.3,17.2,17.2,17.2,17.1,17.1,17.1,17.1,17,17,17,17,17,17.1,17.1,17.1,17.1,17.2,17.2,17.2,17.3,17.3,17.4,17.4,17.5,17.5,17.6,17.6,17.7,17.7,17.8,17.8,17.6,17.2,16.8,16.3,15.9,15.4,14.9,14.5,14.1,13.7,13.3,12.9,12.6,12.3,12,11.7,11.4,11.2,10.9,10.7,10.5,10.3,10.1,9.9,9.8,9.6,9.5,9.3,9.2,9.1,8.9,8.8,8.7,8.6,8.5,8.4,8.3,8.2,8.1,8,8,7.9,7.8,7.8,7.7,7.6,7.6,7.5,7.5,7.4,7.4,7.3,7.3,7.3,7.2,7.2,7.2,7.2,7.1,7.1,7.1,7.1,7.1,7.1,7,7,7,7,7,7,7,7,7,7.1,7.1,7.1,7.1,7.1,7.1,7.2,7.2,7.2,7.2,7.3,7.3,7.3,7.4,7.4,7.5,7.5,7.6,7.6,7.7,7.8,7.8,7.9,8,8,8.1,8.2,8.3,8.4,8.5,8.6,8.7,8.8,8.9,9.1,9.2,9.3,9.5,9.6,9.8,9.9,10.1,10.3,10.5,10.7,10.9,11.2,11.4,11.7,12,12.3,12.6,12.9,13.3,13.7,14.1,14.5,15,15.5,16,16.6,17.3,18,18.8,19.6,20.6,21.6,22.8,24.1,25.5,27.2,29.1,31,32.5,33.2,33.3,33.3,33.2,33.2,33.2,33.1,33.1,33.1,33,33,33,33,33,33.1,33.1,33.1,33.2,33.2,33.2,33.3,33.3,33.2,32.5,31,29.1,27.2,25.5,24.1,22.8,21.6,20.6,19.6,18.8,18,17.3,16.6,16,15.5,15,14.5,14.1,13.7,13.3,12.9,12.6,12.3,12,11.7,11.4,11.2,10.9,10.7,10.5,10.3,10.1,9.9,9.8,9.6,9.5,9.3,9.2,9.1,8.9,8.8,8.7,8.6,8.5,8.4,8.3,8.2,8.1,8,8,7.9,7.8,7.8,7.7,7.6,7.6,7.5,7.5,7.4,7.4,7.3,7.3,7.3,7.2,7.2,7.2,7.2,7.1,7.1,7.1,7.1,7.1,7.1,7,7,7,7];
  var RAY_SUN = [4.6,4.6,4.6,4.6,4.6,4.7,4.7,4.7,4.7,4.7,4.7,4.7,4.7,4.8,4.8,4.8,4.8,4.8,4.9,4.9,4.9,5,5,5,5.1,5.1,5.2,5.2,5.2,5.3,5.3,5.4,5.5,5.5,5.6,5.7,5.7,5.8,5.9,6,6,6.1,6.2,6.3,6.4,6.5,6.7,6.8,6.9,7.1,7.2,7.4,7.5,7.7,7.9,8.1,8.3,8.5,8.7,9,9.3,9.6,9.9,10.2,10.6,10.9,11.4,11.8,12.4,12.9,13.5,14.2,14.8,15.2,15.1,15.1,15,15,14.9,14.9,14.8,14.8,14.8,14.7,14.7,14.7,14.7,14.7,14.6,14.6,14.6,14.6,14.6,14.7,14.7,14.7,14.7,14.7,14.8,14.8,14.8,14.9,14.9,15,15,15.1,15.1,15.2,14.8,14.2,13.5,12.9,12.4,11.8,11.4,10.9,10.6,10.2,9.9,9.6,9.3,9,8.7,8.5,8.3,8.1,7.9,7.7,7.5,7.4,7.2,7.1,6.9,6.8,6.7,6.5,6.4,6.3,6.2,6.1,6,6,5.9,5.8,5.7,5.7,5.6,5.5,5.5,5.4,5.3,5.3,5.2,5.2,5.2,5.1,5.1,5,5,5,4.9,4.9,4.9,4.8,4.8,4.8,4.8,4.8,4.7,4.7,4.7,4.7,4.7,4.7,4.7,4.7,4.6,4.6,4.6,4.6,4.6,4.6,4.6,4.6,4.6,4.7,4.7,4.7,4.7,4.7,4.7,4.7,4.7,4.8,4.8,4.8,4.8,4.8,4.9,4.9,4.9,5,5,5,5.1,5.1,5.2,5.2,5.2,5.3,5.3,5.4,5.5,5.5,5.6,5.7,5.7,5.8,5.9,6,6,6.1,6.2,6.3,6.4,6.5,6.7,6.8,6.9,7.1,7.2,7.4,7.5,7.7,7.9,8.1,8.3,8.5,8.7,9,9.3,9.6,9.9,10.2,10.6,10.9,11.4,11.8,12.4,12.9,13.5,14.2,15,15.8,16.8,17.9,19.1,20.6,22.3,24.3,26.7,29.5,30.8,30.8,30.8,30.7,30.7,30.7,30.6,30.6,30.6,30.6,30.6,30.7,30.7,30.7,30.8,30.8,30.8,29.5,26.7,24.3,22.3,20.6,19.1,17.9,16.8,15.8,15,14.2,13.5,12.9,12.4,11.8,11.4,10.9,10.6,10.2,9.9,9.6,9.3,9,8.7,8.5,8.3,8.1,7.9,7.7,7.5,7.4,7.2,7.1,6.9,6.8,6.7,6.5,6.4,6.3,6.2,6.1,6,6,5.9,5.8,5.7,5.7,5.6,5.5,5.5,5.4,5.3,5.3,5.2,5.2,5.2,5.1,5.1,5,5,5,4.9,4.9,4.9,4.8,4.8,4.8,4.8,4.8,4.7,4.7,4.7,4.7,4.7,4.7,4.7,4.7,4.6,4.6,4.6,4.6];/*/GEO*/

  var NS = 'http://www.w3.org/2000/svg', VB = [-122, -89, 244, 178];   // celý znak 240 × 174 + okraj 2 (hrana se neořízne)
  var ZAVRENO = 0.84, LID_Y = -G.h / 2 - 6, LID_H = G.h + 6;
  // výrazy (master vyrazy.svg): clony [levá, pravá] jako podíl výšky průhledu, u = pohled (° / 'ty' / 'nizko'),
  // sleduje = jde za prstem a kurzorem, mrka = 1 přirozeně, 2 pomalu (Chvilku, offline), 0 vůbec,
  // h: 0 = hlava se neotáčí, dívají se jen zorničky (master: Nic, Chvilku a Noc mají turn 0, nod 0)
  var STAVY = {
    koukam:  { c: [0, 0], sleduje: 1, mrka: 1 },
    hledam:  { c: [0, 0], sleduje: 0, mrka: 1, u: 172 },
    chvilku: { c: [0.40, 0.40], sleduje: 0, mrka: 2, u: 'nizko' },
    mam:     { c: [0, 0], sleduje: 0, mrka: 0 },
    nic:     { c: [0.16, 0.16], sleduje: 1, mrka: 1, u: 270, h: 0 },
    offline: { c: [0.50, 0.50], sleduje: 0, mrka: 2, u: 270, h: 0 },
    noc:     { c: [ZAVRENO, ZAVRENO], sleduje: 0, mrka: 0, h: 0 },
    klid:    { c: [0, 0], sleduje: 0, mrka: 0, u: 38 }      // platba a osobní údaje: jen Koukám, žádný pohyb
  };
  var mq = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null, vynuceno = null;
  function omezeny() { return vynuceno !== null ? vynuceno : !!(mq && mq.matches); }
  var zive = [], pocet = 0, platno = null;

  function uzel(tag, at, rodic) {
    var e = document.createElementNS(NS, tag);
    for (var k in at) e.setAttribute(k, at[k]);
    if (rodic) rodic.appendChild(e);
    return e;
  }
  function f(v) { return Math.round(v * 100) / 100; }
  function stred(x) { var r = x.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }
  // vzdálenost zorničky od klidového bodu po paprsku (tabulka z core.pupil_ray po 1°, mezi stupni lineárně)
  function paprsek(tab, a) { a = ((a % 360) + 360) % 360; var i = Math.floor(a), q = a - i; return tab[i] + (tab[(i + 1) % 360] - tab[i]) * q; }

  function Kuk(host, o) {
    o = o || {};
    var s = this, id = 'kuk' + (++pocet);
    this.size = o.size || 64; this.ziv = o.ziv !== false; this.male = this.size < 24;   // pod 24 px jen mrkání
    this.stav = o.stav || 'koukam'; this.cil = null; this.fokus = null; this.klidCil = o.klid || null; this.usinaZa = o.usinaZa || 0; this.naStav = o.naStav || null;
    this.ang = 38; this.clony = STAVY[this.stav].c.slice(); this.sl = [0, 0];
    this._t = []; this.pise = 0; this.klep = 0; this.vzhuru = 0;
    var svg = this.svg = uzel('svg', { viewBox: VB.join(' '), width: this.size, height: f(this.size * VB[3] / VB[2]),
      'class': 'kukatko', role: 'img', 'aria-label': o.label || 'Kukátko Letsi', focusable: 'false' });
    var cp = uzel('clipPath', { id: id }, uzel('defs', {}, svg));
    [-1, 1].forEach(function (sx) { uzel('path', { d: G.ap, transform: 'translate(' + sx * G.cx + ' 0)' }, cp); });
    uzel('path', { d: G.outer, 'class': 'k-ram' }, svg);
    var hl = this.hlava = uzel('g', { 'class': 'k-hlava' }, svg);      // průhledy se v rámu posouvají = otočení hlavy
    [-1, 1].forEach(function (sx) { uzel('path', { d: G.ap, transform: 'translate(' + sx * G.cx + ' 0)', 'class': 'k-okno' }, hl); });
    var zg = uzel('g', { 'clip-path': 'url(#' + id + ')' }, hl);
    this.zor = [0, 1].map(function () { return uzel('circle', { r: G.pr, 'class': 'k-zor' }, zg); });
    // clona = roleta okénka shora: obdélník o kus širší a vyšší než průhled; co přečnívá, leží na rámu stejné barvy,
    // takže na hraně není šev. Stahuje se přes scaleY od horní hrany.
    this.cl = [-1, 1].map(function (sx) {
      var g = uzel('g', { transform: 'translate(' + sx * G.cx + ' ' + LID_Y + ')' }, hl);
      return uzel('rect', { x: -G.w / 2 - 8, y: 0, width: G.w + 16, height: LID_H, 'class': 'k-clona' }, g);
    });
    host.appendChild(svg);
    svg.addEventListener('click', function () { s._klepni(); });
    var bud = o.probud && this.ziv && !omezeny() && this.stav === 'koukam';
    if (bud) this.clony = [ZAVRENO, ZAVRENO];                           // probuzení: start se zavřenými clonami
    this._ticho(true); this._zpet(); svg.getBoundingClientRect(); this._ticho();
    if (bud) this._pozdeji(function () { s.stav = 'noc'; s.state('koukam'); }, 150);
    else this._planuj();
  }
  var P = Kuk.prototype;

  P._pozdeji = function (fn, ms) {
    var s = this, id = setTimeout(function () { s._t.splice(s._t.indexOf(id), 1); fn(); }, ms);
    this._t.push(id);
  };
  P._stop = function () {
    this._t.forEach(clearTimeout); this._t = [];
    clearTimeout(this.tm); clearTimeout(this.tz); clearTimeout(this.tu); this.mrka = 0; this.drzi = 0;
  };
  // bez přechodů: omezený pohyb, klid (platba) a první vykreslení
  P._ticho = function (vzdy) { this.svg.classList.toggle('k-ticho', !!vzdy || omezeny() || this.stav === 'klid'); };
  P._cas = function (pohled, clona, krivka) {
    var st = this.svg.style;
    if (pohled != null) st.setProperty('--k-tp', pohled + 'ms');
    if (clona != null) st.setProperty('--k-tc', clona + 'ms');
    st.setProperty('--k-ec', krivka || 'cubic-bezier(.4,0,.2,1)');
  };
  P._clona = function (j, sh) { this.cl[j].style.transform = 'scaleY(' + (6 + G.h * sh) / LID_H + ')'; };

  // vykreslí aktuální stav: hlava (posun průhledů), zorničky po paprsku, clony. Animaci dělá CSS.
  P._kresli = function () {
    var a = this.male ? 38 : this.ang, ty = a === 'ty' || a === 'nizko', r = ty ? 0 : a * Math.PI / 180;
    var bez = ty || STAVY[this.stav].h === 0, tx = bez ? 0 : G.turn * Math.cos(r), ny = bez ? 0 : -G.turn * 0.35 * Math.sin(r);
    this.hlava.style.transform = 'translate(' + f(tx) + 'px,' + f(ny) + 'px)';
    for (var j = 0; j < 2; j++) {
      var sh = this.clony[j], sun = this.sl[j], d = ty ? 0 : paprsek(sun ? RAY_SUN : RAY, a);
      var x = Math.cos(r) * d, y = ty ? (a === 'nizko' ? 14 : G.rest) : G.rest - Math.sin(r) * d;
      if (sh > 0 && sh < 0.7) y = Math.max(y, -G.h / 2 + G.h * sh + G.pr * (sun ? 1.12 : 1) + G.m / 2);  // zornička nesmí pod clonu
      var z = this.zor[j];
      z.style.transform = 'translate(' + f((j ? G.cx : -G.cx) + x) + 'px,' + f(y) + 'px)' + (sun ? ' scale(1.12)' : '');
      z.style.opacity = sh >= 0.7 ? 0 : 1;                                   // zavřené okénko: jen štěrbina (master)
      z.classList.toggle('k-sl', !!sun);
      this._clona(j, sh);
    }
  };

  // pohled: look(el), look(x, y) v souřadnicích okna, look('ty') = na tebe, look(null) = zpět ke klidovému cíli
  P.look = function (x, y) {
    if (x == null) return this._zpet();
    if (omezeny() || /chvilku|noc|klid|mam/.test(this.stav)) return this;   // bez pohybu a v těchto výrazech drží pohled
    if (this.stav === 'hledam') this._cas(140);                              // přeskok po letištích: rychlá sakáda
    return this._look(x, y);
  };
  P._look = function (x, y) {
    if (this.male) return this;
    if (x === 'ty') { this.ang = 'ty'; this._kresli(); return this; }
    var t = x.getBoundingClientRect ? stred(x) : [x, y];
    var b = this.svg.getBoundingClientRect(), k = b.width / VB[2];
    var dx = (t[0] - b.left) / k + VB[0], dy = (t[1] - b.top) / k + VB[1];
    // cíl na kukátku = dívá se na tebe; jinak rovnoběžný pohled ze středu znaku (sbíhavé paprsky by šilhaly)
    this.ang = Math.abs(dx) < 120 && Math.abs(dy) < 87 ? 'ty' : Math.atan2(-dy, dx) * 180 / Math.PI;
    this._kresli();
    return this;
  };
  P._zpet = function () {
    var st = STAVY[this.stav], u = st.u, c = (st.sleduje && this.fokus) || this.cil;
    if (c && c.isConnected) return this._look(c);
    if (u == null && this.klidCil && this.klidCil.isConnected && this.klidCil.getClientRects().length) return this._look(this.klidCil);
    this.ang = u == null ? 38 : u;          // bez cíle v záběru: nahoru doprava 38° (master)
    this._kresli();
    return this;
  };
  P.klid = function (el) { this.klidCil = el; if (!this.drzi) { this._cas(260); this._zpet(); } return this; };

  P.state = function (n, cil) {
    var s = this, z = this.stav, st = STAVY[n];
    if (!st) return this;
    this._stop();
    this.stav = n; this.cil = cil || null; this.sl = [0, 0]; this.clony = st.c.slice();
    if (z === 'noc' && n !== 'noc') this.vzhuru = Date.now();
    this._ticho();
    // usínání pomalu (400 ms), probuzení 360 ms s doběhem, ostatní výrazy 260 ms
    this._cas(200, n === 'noc' ? 400 : z === 'noc' ? 360 : 260, n === 'noc' ? 'cubic-bezier(.45,0,.55,1)' : 'cubic-bezier(.2,.8,.2,1)');
    this._zpet();
    if (n === 'hledam') this._pozdeji(function () { if (s.stav === 'hledam') s.state('chvilku'); }, 4000);   // Chvilku od 4 s
    this._planuj(); this._usinani();
    if (this.naStav && n !== z) this.naStav(n, z);
    return this;
  };

  // přirozené mrknutí oběma okénky: 60 ms dolů, 30 ms zavřeno, 70 ms nahoru (160 ms); pomalé 170 + 60 + 170
  P.blink = function (druh) {
    var s = this, pom = druh === 'pomalu';
    if (this.mrka || omezeny() || /noc|klid|mam/.test(this.stav)) return this;
    var dolu = pom ? 170 : 60, nah = pom ? 170 : 70;
    this.mrka = 1; this._cas(null, dolu, 'cubic-bezier(.5,0,1,1)'); this._clona(0, 1); this._clona(1, 1);
    this._pozdeji(function () {
      s._cas(null, nah, 'cubic-bezier(0,0,.3,1)'); s._clona(0, s.clony[0]); s._clona(1, s.clony[1]);
      s._pozdeji(function () { s.mrka = 0; if (druh === true) s._pozdeji(function () { s.blink(); }, 90); }, nah);
    }, dolu + (pom ? 60 : 30));
    return this;
  };
  // jediný časovač: náhodně 3–8 s (Chvilku a offline 2,2–3,6 s pomalu); při psaní nemrká, soustředí se
  P._planuj = function () {
    var s = this, st = STAVY[this.stav];
    clearTimeout(this.tm);
    if (!this.ziv || !st.mrka || omezeny() || document.hidden || !this.svg.isConnected) return;
    this.tm = setTimeout(function () {
      if (Date.now() - s.pise > 1500) s.blink(st.mrka === 2 ? 'pomalu' : Math.random() < 0.18);
      s._planuj();
    }, st.mrka === 2 ? 2200 + Math.random() * 1400 : 3000 + Math.random() * 5000);
  };
  // ve tmě (tmavý režim, 22–5 h) po chvíli klidu usne: clony dolů, žádné časovače, dokud se ho nedotkneš
  P._usinani = function () {
    var s = this;
    clearTimeout(this.tu);
    if (!this.ziv || !this.usinaZa || this.stav !== 'koukam' || !Kukatko.jeNoc()) return;
    this.tu = setTimeout(function () { if (s.stav === 'koukam' && !s.drzi) s.state('noc'); }, this.usinaZa);
  };

  // jde za prstem a kurzorem; po 2,5 s klidu (po dotyku 1,2 s) se vrátí ke svému cíli
  P._ukaz = function (x, y, dotyk) {
    var s = this;
    if (!this.ziv || this.male || !STAVY[this.stav].sleduje || omezeny() || this.drzi || Date.now() - this.pise < 1500) return;
    this._cas(140); this._look(x, y);
    clearTimeout(this.tz); this.tz = setTimeout(function () { s._cas(260); s._zpet(); }, dotyk ? 1200 : 2500);
  };
  P._pozor = function (t) {                         // pole, do kterého píšeš: dívá se na něj, dokud je aktivní
    if (!this.ziv || this.male || !STAVY[this.stav].sleduje || omezeny()) return;
    clearTimeout(this.tz); this.fokus = t; this._cas(180); this._look(t);
  };
  P._pustit = function (t) {
    if (this.fokus !== t) return;
    this.fokus = null; this._cas(260); this._zpet();
  };
  // čte při psaní: zorničky jedou s textem (k pozici kurzoru v poli)
  P._cti = function (inp) {
    if (!this.ziv || this.male || !STAVY[this.stav].sleduje || omezeny()) return;
    this.pise = Date.now();
    var r = inp.getBoundingClientRect(), cs = getComputedStyle(inp), c = (platno = platno || document.createElement('canvas').getContext('2d'));
    c.font = cs.font || (cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily);
    var konec = inp.selectionEnd == null ? inp.value.length : inp.selectionEnd;
    var x = r.left + parseFloat(cs.paddingLeft) + c.measureText(inp.value.slice(0, konec)).width - inp.scrollLeft;
    this.fokus = inp; this._cas(120); this._look(Math.min(x, r.right - parseFloat(cs.paddingRight)), r.top + r.height / 2);
  };
  P.glance = function (t, ms) {
    var s = this;
    if (this.male || omezeny() || /noc|klid|mam/.test(this.stav)) return this;
    this.drzi = 1; clearTimeout(this.tz); this._cas(180); this._look(t);
    this._pozdeji(function () { s.drzi = 0; s._cas(260); s._zpet(); }, ms || 900);
    return this;
  };
  // klepnutí: zamrká; po 3. klepnutí se podívá na tebe a dál už nereaguje (žádná hra navíc)
  P._klepni = function () {
    var s = this;
    if (!this.ziv || this.stav === 'klid' || this.klep >= 3 || Date.now() - this.vzhuru < 500) return;
    if (this.stav === 'noc') return this.state('koukam');
    if (++this.klep < 3) return this.blink();
    this.drzi = 1; this._cas(200); this._look('ty');
    this._pozdeji(function () { s.drzi = 0; s._cas(260); s._zpet(); }, 1400);
  };

  // Mám to: obě zorničky slunce (200 ms, jediný okamžik se dvěma slunci) → Mrk levým okénkem, v pravém jedno slunce
  // (300 ms) → slunce vyletí z oka a dosedne jako tečka před cenu (380 ms, pružina); kukátko se pak dívá na cenu
  P.mam = function (tecka) {
    var s = this;
    return new Promise(function (hotovo) {
      function konec() {
        if (tecka) { tecka.classList.add('k-sviti'); s.klidCil = tecka; }
        s.stav = 'koukam'; s.sl = [0, 0]; s.clony = [0, 0]; s.cil = null;
        s._ticho(); s._cas(220, 160); s._zpet(); s._planuj(); s._usinani(); hotovo();
      }
      s._stop(); s.stav = 'mam'; s.cil = null;
      if (omezeny() || s.male || !tecka || !s.ziv) return konec();       // bez pohybu rovnou poslední stav
      s.ang = 38; s.sl = [1, 1]; s.clony = [0, 0]; s._cas(120, 120); s._kresli();
      s._pozdeji(function () {
        s.sl = [0, 1]; s.clony = [ZAVRENO, 0]; s._kresli();
        s._pozdeji(function () {
          var a = s.zor[1].getBoundingClientRect(), b = tecka.getBoundingClientRect(), d = document.createElement('i');
          d.className = 'k-letici-slunce'; d.setAttribute('aria-hidden', 'true');
          d.style.cssText = 'left:' + (b.left + scrollX) + 'px;top:' + (b.top + scrollY) + 'px;width:' + b.width + 'px;height:' + b.height + 'px';
          document.body.appendChild(d);
          var dx = a.left + a.width / 2 - b.left - b.width / 2, dy = a.top + a.height / 2 - b.top - b.height / 2;
          s.sl = [0, 0]; s.clony = [0, 0]; s._cas(220, 160); s._look(tecka);
          d.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + a.width / b.width + ')' }, { transform: 'none' }],
            { duration: 380, easing: 'cubic-bezier(.34,1.45,.64,1)' }).onfinish = function () { d.remove(); konec(); };
        }, 300);
      }, 200);
    });
  };
  P.destroy = function () { this._stop(); zive.splice(zive.indexOf(this), 1); this.svg.remove(); };

  // ---- společné posluchače (jeden pro všechna kukátka; žádná smyčka, jen při skutečné události)
  function vsem(fn) { zive.slice().forEach(fn); }
  function pole(t) { return t && t.matches && t.matches('input:not([type=checkbox]):not([type=radio]),textarea'); }
  var ceka = 0, posl = null;
  document.addEventListener('pointermove', function (e) {
    posl = e;
    if (!ceka) ceka = requestAnimationFrame(function () { ceka = 0; vsem(function (k) { k._ukaz(posl.clientX, posl.clientY, posl.pointerType === 'touch'); }); });
  }, { passive: true });
  document.addEventListener('pointerdown', function (e) {
    vsem(function (k) {
      if (k.stav === 'noc' && k.usinaZa) k.state('koukam');              // klepnutí kamkoli ho probudí
      k._usinani(); k._ukaz(e.clientX, e.clientY, e.pointerType !== 'mouse');
    });
  }, { passive: true });
  document.addEventListener('keydown', function () { vsem(function (k) { if (k.stav === 'noc' && k.usinaZa) k.state('koukam'); k._usinani(); }); });
  document.addEventListener('focusin', function (e) { if (pole(e.target)) vsem(function (k) { k._pozor(e.target); }); });
  document.addEventListener('focusout', function (e) { vsem(function (k) { k._pustit(e.target); }); });
  ['input', 'keyup', 'click'].forEach(function (ev) {
    document.addEventListener(ev, function (e) { if (pole(e.target) && e.target === document.activeElement) vsem(function (k) { k._cti(e.target); }); });
  });
  var skryto = 0;     // návrat do aplikace po víc než 5 min: znovu otevře clony (probuzení)
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) skryto = Date.now();
    vsem(function (k) {
      if (document.hidden) return clearTimeout(k.tm);
      if (skryto && Date.now() - skryto > 300000 && k.stav === 'koukam' && !omezeny()) { k.stav = 'noc'; k.clony = STAVY.noc.c.slice(); k._ticho(true); k._kresli(); k.svg.getBoundingClientRect(); k.state('koukam'); }
      else k._planuj();
    });
  });
  if (mq && mq.addEventListener) mq.addEventListener('change', function () { Kukatko.omezPohyb(vynuceno); });

  window.Kukatko = {
    mount: function (el, o) { var k = new Kuk(el, o); if (k.ziv) zive.push(k); return k; },
    omezPohyb: function (v) { vynuceno = v; vsem(function (k) { k._ticho(); k._zpet(); k._planuj(); }); },
    jeNoc: function () {
      var t = document.documentElement.getAttribute('data-theme'), h = new Date().getHours();
      return t === 'dark' || (t !== 'light' && !!window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) || h >= 22 || h < 5;
    }
  };

  // ================= Napojení na ATLAS =================
  // Stavy aplikace kukátko nezjišťuje z cizích modulů, jen pozoruje stránku (MutationObserver). Spolehlivé signály
  // v DOM (flights.js je kreslí celé přes innerHTML, takže stačí sledovat přidané a odebrané uzly):
  // - sekce: <section class="view active" id="view-…"> (app.js přepíná třídu active) – Přehled view-dashboard, Lety view-flights;
  // - hledá se: v #progress je .progress-card bez .done (renderProgress: div.progress-card při startu, details.progress-card.part
  //   s průběžnými výsledky); po dohledání details.progress-card.done;
  // - chyba hledání: #progress .note.bad (výpadek zdroje, server neodpovídá; i s průběžnými výsledky);
  // - prázdný výsledek: #results .empty-res („Nic jsem nenašel“ i „Filtrům nic neodpovídá“ – v obou není co ukázat);
  // - nalezené nabídky: v hlavičce výsledků „nejlevněji <b class="good">2 238 Kč</b>“ (#results .res-head b.good) –
  //   to je nejlevnější cena celého hledání bez ohledu na řazení a filtry, proto k ní patří slunce.
  var CENA = '#results .res-head b.good';
  var HLEDAM_OD = 300;   // Hledám jen při skutečném načítání od 300 ms (chovani.md 6)

  /** Popis stránky z DOM → { sekce, hleda, chyba, prazdno, cena } (doc = document; v testu napodobený). */
  function popis(doc) {
    var v = doc.querySelector('.view.active');
    return {
      sekce: v ? String(v.id).replace(/^view-/, '') : '',
      hleda: !!doc.querySelector('#progress .progress-card:not(.done)'),
      chyba: !!doc.querySelector('#progress .note.bad'),
      prazdno: !!doc.querySelector('#results .empty-res'),
      cena: !!doc.querySelector(CENA)
    };
  }
  /** Fáze hledání (nezávisle na sekci): 'hleda' | 'chyba' | 'nic' | 'cena' | '' (nic není). Chyba má přednost před
   *  nálezem: s chybou slunce zhasne (balík 2.1), i když jsou vidět průběžné výsledky. */
  function faze(p) { return p.hleda ? 'hleda' : p.chyba ? 'chyba' : p.prazdno ? 'nic' : p.cena ? 'cena' : ''; }
  /** Další stav sledování hledání: nove = od posledního startu hledání ještě nebylo Mám to, mam = slunce u ceny smí
   *  svítit, hrat = přehrát Mám to (jednou na hledání: drží, dokud ho sync nespotřebuje; překreslení, řazení ani návrat
   *  na výsledky ho nespustí, protože před nimi nebylo hledání). */
  function dalsi(t, fa) {
    if (fa === 'hleda') return { nove: true, mam: false, hrat: false };
    if (fa === 'cena') return { nove: false, mam: t.mam || t.nove, hrat: t.hrat || t.nove };
    return { nove: false, mam: false, hrat: false };
  }
  /** Kde kukátko bydlí a jaký má výraz: { kde: 'prehled' | 'lety' | null, vyraz, cil }. hledaMs = jak dlouho se hledá. */
  function stav(p, hledaMs) {
    if (p.sekce === 'dashboard') return { kde: 'prehled', vyraz: 'koukam' };
    var fa = faze(p);
    if (p.sekce !== 'flights' || !fa || (fa === 'hleda' && hledaMs < HLEDAM_OD)) return { kde: null, vyraz: null };
    return { kde: 'lety', vyraz: { hleda: 'hledam', chyba: 'offline', nic: 'nic', cena: 'koukam' }[fa] };
  }
  /** Jediné slunce na stránce: tečka těsně před nejlevnější cenou (svitit), jinak žádná. Tečky z dřívějška (překreslení
   *  výsledků je zahodí samo, ale chyba nebo prázdný výsledek ne) zmizí. hned = rovnou svítí (bez letu z oka). */
  function slunce(doc, svitit, hned) {
    var cena = svitit ? doc.querySelector(CENA) : null, tecky = doc.querySelectorAll('.k-slunce-cil'), tecka = null;
    for (var i = 0; i < tecky.length; i++) {
      if (cena && !tecka && tecky[i].nextSibling === cena) tecka = tecky[i]; else tecky[i].remove();
    }
    if (cena && !tecka) {
      tecka = doc.createElement('i');
      tecka.className = 'k-slunce-cil';
      tecka.setAttribute('data-slunce', '');
      tecka.setAttribute('aria-hidden', 'true');
      cena.parentNode.insertBefore(tecka, cena);
    }
    if (tecka && hned) tecka.classList.add('k-sviti');
    return tecka;
  }
  // hlas „si“ jen při hledání a nálezu (chovani.md 4), krátce; u Nic a chyby mluví aplikace sama
  var HLAS = { hledam: 'Projdu si letiště v okolí…', chvilku: 'Ještě chvilku…' };

  window.Kukatko.popis = popis; window.Kukatko.faze = faze; window.Kukatko.dalsi = dalsi;
  window.Kukatko.stav = stav; window.Kukatko.slunce = slunce;

  var k = null, kde = null, vyraz = null, rada = null, sled = { nove: false, mam: false }, hledaOd = 0, animuje = false,
    prvni = true, snimek = 0, odklad = 0;   // snimek: vlastní, ne „ceka“ knihovny (pohyb prstu)

  function prvek(tag, cls) { var e = document.createElement(tag); e.className = cls; e.setAttribute('aria-hidden', 'true'); return e; }
  // Přehled: vlevo od titulku „Kam poletíme?“ (chovani.md 6) na Pistácii hlavičky → pozitiv (.k-znacka) i v tmavém režimu
  function hostPrehled() {
    var h = document.getElementById('heroGreet');
    if (!h) return null;
    var e = h.querySelector('.kuk-host');
    if (!e) { e = prvek('span', 'kuk-host k-znacka'); h.classList.add('kuk-s'); h.insertBefore(e, h.firstChild); }
    return e;
  }
  // Lety: vlastní řádek mezi průběhem hledání a výsledky, hned nad titulkem výsledků – do #progress a #results nesahá
  // (flights.js je přepisuje celé). Ne nad průběhem: hledání posune stránku na začátek #progress a kukátko by bylo mimo.
  function hostLety() {
    if (!rada) {
      var pr = document.getElementById('progress');
      if (!pr) return null;
      rada = prvek('div', 'kuk-rada');
      rada.innerHTML = '<span class="kuk-host"></span><span class="kuk-hlas"></span>';
      pr.parentNode.insertBefore(rada, pr.nextSibling);
    }
    rada.hidden = false;
    return rada.firstChild;
  }
  function hlas(n) {
    if (!rada) return;
    var e = rada.lastChild, mam = n === 'mam';
    e.textContent = mam ? 'Mám to – mrkni si.' : HLAS[n] || '';
    e.classList.toggle('kuk-mam', mam);   // štítek „Mám to“ v plné Pistácii s Nocí
  }

  // každá dávka změn DOM: fáze hledání se nesmí přeskočit – hledání z mezipaměti trvá i jen pár desítek ms, klidně
  // mezi dvěma snímky; kreslí se až v sync (jednou na snímek)
  function sleduj() {
    var fa = faze(popis(document));
    hledaOd = fa !== 'hleda' ? 0 : hledaOd || Date.now();
    sled = dalsi(sled, fa);
    planuj();
  }
  function sync() {
    snimek = 0;
    var p = popis(document), fa = faze(p);
    var ms = hledaOd ? Date.now() - hledaOd : 0, s = stav(p, ms);
    clearTimeout(odklad);
    if (fa === 'hleda' && ms < HLEDAM_OD) odklad = setTimeout(planuj, HLEDAM_OD - ms);   // krátké hledání Hledám neukáže
    if (s.kde !== kde) {
      if (k) { k.destroy(); k = null; animuje = false; }
      if (rada) rada.hidden = s.kde !== 'lety';
      kde = s.kde; vyraz = null;
      var host = kde === 'prehled' ? hostPrehled() : kde === 'lety' ? hostLety() : null;
      if (host) {
        // probuzení (clony nahoru) jen při otevření aplikace na Přehledu, ne při přechodu mezi obrazovkami
        k = window.Kukatko.mount(host, { size: kde === 'prehled' ? 64 : 48, probud: prvni && kde === 'prehled', naStav: hlas });
        vyraz = 'koukam';
      } else kde = null;
      prvni = false;
    }
    var lety = kde === 'lety' && fa === 'cena', hrat = sled.hrat;
    sled.hrat = false;   // jednou na hledání; mimo Lety se nepřehraje vůbec (slunce u ceny pak svítí rovnou)
    if (k && lety && hrat) {
      animuje = true; vyraz = 'koukam';
      k.mam(slunce(document, true, false)).then(function () { animuje = false; planuj(); });
    } else if (k && s.vyraz !== vyraz) {
      vyraz = s.vyraz;
      k.state(vyraz, vyraz === 'hledam' ? document.getElementById('progress') : null);
    }
    var tecka = slunce(document, lety && sled.mam, !animuje);
    var cil = lety ? tecka || document.querySelector(CENA) : null;
    if (k && cil && !animuje && k.klidCil !== cil) k.klid(cil);   // v klidu se dívá na nejlevnější cenu
    if (kde === 'lety') hlas(lety && sled.mam ? 'mam' : k ? k.stav : '');
  }
  // změny DOM chodí v dávkách (překreslení výsledků = stovky uzlů) → jedno vyhodnocení na snímek; ve skryté stránce
  // requestAnimationFrame nečeká nic, takže se nic nepočítá
  function planuj() { if (!snimek) snimek = requestAnimationFrame(sync); }

  function start() {
    var mo = new MutationObserver(sleduj);
    ['progress', 'results'].forEach(function (id) {
      var e = document.getElementById(id);
      if (e) mo.observe(e, { childList: true, subtree: true });
    });
    var v = document.querySelectorAll('.view');
    for (var i = 0; i < v.length; i++) mo.observe(v[i], { attributes: true, attributeFilter: ['class'] });
    sleduj();
  }
  // styly až se vzhledem; kukátko se ukáže až s nimi (bez stylů by bliklo neobarvené)
  var css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = 'css/kukatko.css';
  css.onload = function () { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start(); };
  document.head.appendChild(css);
})();
