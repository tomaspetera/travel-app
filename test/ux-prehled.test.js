// Přehled při první a další návštěvě (UX kontrola před spuštěním): na Odkud se ptá jedno místo (čipy měst pod Odkud
// nahoře, bez skoku stránky), karta souhlasu s měřením je krátká a nepotká se s tipem 💡, Přehled neopakuje vstupy
// (karta 🧳 Naplánuj celou dovolenou, dlaždice Tip na měsíc, tip Kamkoliv vedle Kam letět levně).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
const APP = read('js/app.js'), FL = read('js/flights.js'), HTML = read('index.html');
const fn = (src, name) => src.match(new RegExp(`^ {2}function ${name}\\([^\\n]*\\) \\{\\n[\\s\\S]*?^ {2}\\}$`, 'm'))[0];

/* ---------- U2: Odkud jen jednou ---------- */
// zástupný DOM pro paintHomeAsk: kontejner čipů a tlačítka z innerHTML
function homeAsk(home) {
  const el = { hidden: true, firstChild: null, btns: [] };
  Object.defineProperty(el, 'innerHTML', { set(h) { el.btns = [...h.matchAll(/data-hh="([^"]+)">([^<]+)</g)].map(([, v, t]) => ({ dataset: { hh: v }, text: t, disabled: false })); el.firstChild = el.btns[0] || null; } });
  const calls = [];
  const c = vm.createContext({
    S: { home }, SearchHelp: { HOME_CITIES: [['Praha'], ['Brno'], ['Ostrava'], ['Vídeň'], ['Bratislava']] },
    esc: (s) => String(s), $: (s) => (s === '#heroHomeAsk' ? el : null), $$: (s, r) => (r === el ? el.btns : []),
    homeFromChip: (chip, done) => { calls.push(chip); c.lastDone = done; },
  });
  vm.runInContext(`${fn(FL, 'paintHomeAsk')}; this.paint = paintHomeAsk;`, c);
  return { el, calls, c };
}

test('U2: bez domova čipy měst a 📍 Moje poloha pod Odkud nahoře; s domovem schované', () => {
  const t = homeAsk(null);
  t.c.paint();
  assert.equal(t.el.hidden, false);
  assert.deepEqual(t.el.btns.map((b) => b.text), ['Praha', 'Brno', 'Ostrava', 'Vídeň', 'Bratislava', '📍 Moje poloha']);
  // klepnutí = domov jako dřív z uvítání (homeFromChip); během zjišťování čipy vypnuté, bez polohy zase zapnuté
  t.el.btns[0].onclick();
  assert.deepEqual(t.calls, ['Praha']);
  assert.ok(t.el.btns.every((b) => b.disabled));
  t.c.lastDone(false);
  assert.ok(t.el.btns.every((b) => !b.disabled));
  t.el.btns[5].onclick();
  assert.deepEqual(t.calls, ['Praha', 'geo']);
  // domov nastavený (applyHome → updateHomeChip → paintHomeAsk): čipy pryč
  t.c.S.home = { from: [{ id: 'ap:PRG' }] };
  t.c.paint();
  assert.equal(t.el.hidden, true);
  const h = homeAsk({ from: [{ id: 'ap:PRG' }] });
  h.c.paint();
  assert.equal(h.el.hidden, true);
  assert.equal(h.el.btns.length, 0, 'vracející se uživatel s domovem čipy nedostane');
  const e = homeAsk({ from: [] });
  e.c.paint();
  assert.equal(e.el.hidden, false, 'prázdný domov = bez domova');
});

test('U2: čipy jsou v poli Odkud nahoře, napojené na změnu domova; uvítání se na Odkud neptá', () => {
  const field = HTML.slice(HTML.indexOf('<span class="hs-lab">Odkud</span>'), HTML.indexOf('<span class="hs-lab">Kam'));
  assert.match(field, /id="heroFrom"[\s\S]*<div class="wc-chips hs-home" id="heroHomeAsk" role="group" aria-label="[^"]+" hidden><\/div><\/div>/);
  assert.match(fn(FL, 'updateHomeChip'), /\n {4}paintHomeAsk\(\);\n/);
  assert.match(read('css/atlas.css'), /\.wc-chips\[hidden\]\{display:none\}/);
  const wn = APP.slice(APP.indexOf('function renderWhatsNew()'), APP.indexOf('function helpCard('));
  assert.doesNotMatch(wn, /Odkud letíš\?|wcFrom|data-wch|PlaceInput/);
});

test('U2: po výběru domova stránka neskočí dolů; Kam letět levně se do výběru domova schová celé', () => {
  assert.doesNotMatch(fn(FL, 'homeFromChip'), /scrollIntoView/);
  // radarSetup bez domova: nadpis oddílu skrytý, žádný prázdný řádek; s domovem se zase ukáže (renderRadar)
  const host = { innerHTML: 'x' }, head = { hidden: false }, ask = {};
  let painted = 0;
  const c = vm.createContext({
    $: (s) => ({ '#radar': host, '#radarHead': head, '#heroHomeAsk': ask, '#radarModes': {}, '#radarLw': {}, '#radarSub': {}, '#radarReload': { style: {} } })[s] ?? null,
    S: { home: null }, paintHomeAsk: () => { painted++; },
  });
  vm.runInContext(`let radarWant, radarLast; ${fn(FL, 'radarSetup').replace(/\n {4}const rad = [\s\S]*$/, '\n}')}; radarSetup();`, c);
  assert.deepEqual([head.hidden, host.innerHTML, painted], [true, '', 1]);
});

/* ---------- U15: karta souhlasu ---------- */
function help() {
  const el = { hidden: true, innerHTML: '', classList: { remove() {} } };
  const btn = () => ({});
  const c = vm.createContext({ localStorage: { getItem: () => null }, wnFirst: false, window: { Count: {} }, Count: { consent() {} }, $: () => btn(), $$: () => [] });
  vm.runInContext(`${APP.match(/^function helpCard\(el\) \{[\s\S]*?^\}$/m)[0]}; helpCard(el);`, Object.assign(c, { el }));
  return el;
}

test('U15: karta souhlasu – nadpis jako text karty (ne Unbounded), 1–2 věty, Podrobnosti, obě volby stejně výrazné', () => {
  const el = help();
  assert.equal(el.hidden, false);
  assert.match(el.innerHTML, /<h3 class="help-h">Pomůžeš mi aplikaci vylepšit\?<\/h3>/);
  const p = el.innerHTML.match(/<p class="help-t">([^<]*)<\/p>/)[1];
  assert.ok(p.split(/[.!?](\s|$)/).filter((x) => x && x.trim()).length <= 2 && p.length < 260, `krátký text: ${p.length} znaků`);
  // informovaný souhlas: co se zaznamená, co ne, jak dlouho a jak vypnout
  for (const k of [/obrazovky/, /nikdy co píšeš/, /31 dnů/, /nevypneš v Další nebo v O aplikaci a soukromí/]) assert.match(p, k);
  assert.match(el.innerHTML, /<button type="button" class="btn" data-help="1">Zapnout<\/button><button type="button" class="btn" data-help="0">Ne, díky<\/button><button type="button" class="linkbtn" id="helpMore">Podrobnosti<\/button>/);
  // plné znění v O aplikaci a soukromí (Podrobnosti tam skočí)
  assert.match(read('js/about.js'), /Záznam obrazovek a hlavních akcí při návštěvě s náhodným číslem návštěvy, bez textu, míst, cen, jména a IP adresy; smaže se do 31 dnů/);
  assert.match(read('css/letsi.css'), /:root\[data-brand="letsi"\] #whatsNew \.help-h\{font-family:var\(--letsi-pismo-text\);[^}]*font-weight:700\}/);
  assert.match(read('css/atlas.css'), /#whatsNew \.help-h\{[^}]*font-size:16px;[^}]*font-weight:700\}/);
  const desk = read('css/desktop-flights.css');
  assert.ok(desk.indexOf('#whatsNew .help-t{max-width:68ch}') > desk.indexOf('@media (min-width:1024px){'), 'počítač: nejvýš ~68 znaků na řádek');
});

/* ---------- 💡 tip: ne s kartou souhlasu, Kamkoliv ne vedle Kam letět levně ---------- */
const a = APP.indexOf('const tipNext = '), b = APP.indexOf('function renderDashTip('), d = APP.indexOf('function renderDash()');
function dashTip(whatsNewVisible) {
  const els = { '#whatsNew': { hidden: !whatsNewVisible, innerHTML: '' } };
  const $ = (s) => (els[s] ||= { hidden: false, innerHTML: '' });
  const S = { home: { from: [{ id: 'ap:PRG' }] }, recent: [{ form: { to: [{ id: 'ap:BCN' }] } }], watch: [], pins: [], trips: [], trip: null, navUse: {} };
  const x = vm.createContext({ localStorage: { getItem: () => null, setItem() {} }, S, esc: String, todayLocal: () => '2026-11-27', $, wnFirst: false });
  vm.runInContext(APP.slice(a, d) + '\nrenderDashTip();', x);
  return $('#dashTip');
}

test('U15: když je vidět karta souhlasu, tip 💡 Věděl jsi? se neukáže (dvě prosby naráz ne)', () => {
  const on = dashTip(true);
  assert.equal(on.hidden, true);
  assert.equal(on.innerHTML, '');
  const off = dashTip(false);
  assert.equal(off.hidden, false);
  assert.match(off.innerHTML, /💡 Věděl jsi\?/);
});

test('U4: tip 🌍 Kamkoliv ne, když je na Přehledu vidět Kam letět levně (s domovem vždy)', () => {
  const c = vm.createContext({});
  vm.runInContext(APP.slice(a, b) + '\nthis.tipPick = tipPick;', c);
  const s = { home: { from: [{ id: 'ap:PRG' }] }, recent: [{ form: { to: [{ id: 'ap:BCN' }] } }], watch: [], pins: [], trips: [], trip: null, navUse: {} };
  assert.equal(c.tipPick(s, {}, null, '2026-11-27').id, 'any');
  assert.equal(c.tipPick(s, { radar: true }, null, '2026-11-27').id, 'watch');
  assert.match(dashTip(false).innerHTML, /Hlídání ceny/, 'renderDashTip předá radar podle domova');
});

test('U4: Přehled bez karty 🧳 Naplánuj celou dovolenou a bez dlaždice Tip na měsíc; tlačítko v heru, Tipy a Rychlé hledání zůstávají', () => {
  assert.doesNotMatch(HTML, /id="planCard"/);
  assert.doesNotMatch(APP, /renderPlanCard|planCardOn|data-tipiso|'Tip na '/);
  assert.match(HTML, /id="heroPlan"/);
  assert.match(HTML, /<h2 id="dashRecsH">/);
  assert.match(HTML, /<h2>Rychlé hledání<\/h2>/);
  assert.match(APP, /\$\('#dashRecsH'\)\.textContent = 'Tipy na ' \+ MNS_FULL\[m - 1\];/);
});
