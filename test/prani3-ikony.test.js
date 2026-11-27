// Přání majitele P3: každá dlaždice Rychlého hledání má vlastní ikonu (Za teplem = slunce, Asie, Afrika, Amerika).
// Balík Letsi 2.1 slunce ani světadíly nemá – 4 ikony jsou nakreslené podle stylu sady, ať je majitel pozná a může nahradit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
const NOVE = ['slunce', 'asie', 'afrika', 'amerika'];

/** Ikony dlaždic z pole QF v renderQuick() (flights.js): první položka každého řádku. */
function qfIkony(src) {
  const i = src.indexOf('const QF = [');
  assert.ok(i >= 0, 'pole QF');
  return [...src.slice(i, src.indexOf('];', i)).matchAll(/^ {6}\['([a-z-]+)', '([^']+)'/gm)].map((m) => [m[2], m[1]]);
}

test('qfIkony(): vezme ikonu a název z řádků pole, nic jiného', () => {
  assert.deepEqual(qfIkony("x\n    const QF = [\n      ['kompas', 'Kamkoliv', { to: [] }],\n      // ['let', 'komentář'\n    ];\n      ['let', 'Za polem']"), [['Kamkoliv', 'kompas']]);
});

test('Rychlé hledání: 7 dlaždic, 7 různých ikon, světadíly a Za teplem mají svou, každá má soubor i masku', () => {
  const qf = qfIkony(read('js/flights.js'));
  assert.equal(qf.length, 7);
  assert.equal(new Set(qf.map(([, n]) => n)).size, 7, qf.join(' | '));
  const m = Object.fromEntries(qf);
  assert.deepEqual([m['Za teplem'], m.Asie, m.Afrika, m.Amerika], NOVE);
  const css = read('css/atlas.css');
  for (const [, n] of qf) {
    assert.ok(existsSync(new URL(`../public/vendor/letsi/ikony/${n}.svg`, import.meta.url)), n);
    assert.ok(css.includes(`\n.i-${n}{--ico:url(../vendor/letsi/ikony/${n}.svg)}`), `.i-${n}`);
  }
});

test('nové ikony ve stylu sady: stejná hlavička jako balík (24 px, tah 2, kulaté konce), bez výplní, okraj 3 px', () => {
  const head = read('vendor/letsi/ikony/jazyk.svg').match(/^<svg[^>]*>/)[0];
  for (const n of NOVE) {
    const s = read(`vendor/letsi/ikony/${n}.svg`);
    assert.ok(s.startsWith(head), `${n}: hlavička jako jazyk.svg`);
    assert.doesNotMatch(s, /fill="(?!none)|<(?:rect|circle|text|image)/, `${n}: jen tahy <path>`);
    // body cest drží okraj 3 px jako sada (oblouky A – poloměry a příznaky – se vynechají, kruh slunce je uvnitř)
    for (const d of s.matchAll(/ d="([^"]+)"/g)) {
      for (const v of d[1].replace(/A[\d. ]+/g, ' ').match(/\d+(?:\.\d+)?/g).map(Number)) assert.ok(v >= 3 && v <= 21, `${n}: ${v} mimo 3–21`);
    }
  }
  // README sady přiznává, že tyhle 4 nejsou z balíku
  const readme = read('vendor/letsi/README.md');
  assert.match(readme, /\*\*ne z balíku\*\*/);
  for (const n of NOVE) assert.ok(readme.includes(`${n}.svg`), `README: ${n}`);
});
