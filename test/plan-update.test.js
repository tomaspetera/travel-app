// Sdílený plán od kamaráda podruhé (novější verze): aktualizace uložené cesty místo kopie (planshare.js merge, app.js previewPlan).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const ctx = { window: {}, URLSearchParams, TextEncoder, TextDecoder, btoa, atob, crypto };
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL('../public/js/planshare.js', import.meta.url), 'utf8'), ctx);
const { PlanShare } = ctx.window;
const app = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
const plain = x => JSON.parse(JSON.stringify(x));

const v1 = { name: 'Řím s kámoši', dest: 'Řím', iso: 'IT', start: '2026-12-10', end: '2026-12-13', pax: '3', budget: '9000', flight: null,
  days: { '2026-12-10': ['Koloseum'], '2026-12-12': ['Vatikán'] }, checklist: [{ t: 'Pas', done: false }], notes: 'sraz na letišti', sid: 'abcde12345' };
const v2 = { ...v1, start: '2026-12-17', end: '2026-12-20', budget: '9500', flight: 'PRG→FCO 17.12.',
  days: { '2026-12-17': ['Koloseum'], '2026-12-18': ['Trastevere'] }, checklist: [{ t: 'Pas', done: false }, { t: 'Adaptér', done: false }], notes: 'sraz v 6:00' };

test('sid: stálé označení sdílené cesty projde odkazem i zálohou, nesmysl ne; nové je 10 znaků a–z0–9', () => {
  assert.equal(PlanShare.sanitize(v1).sid, 'abcde12345');
  assert.equal(JSON.parse(PlanShare.json(v1)).sid, 'abcde12345');
  for (const bad of ['ABCDE12345', 'abc', '<script>xx', 42]) assert.equal(PlanShare.sanitize({ ...v1, sid: bad }).sid, undefined);
  assert.ok(!('sid' in PlanShare.sanitize({ ...v1, sid: undefined })), 'bez sid pole chybí (starší odkazy beze změny)');
  const a = PlanShare.newSid(), b = PlanShare.newSid();
  assert.match(a, /^[a-z0-9]{10}$/); assert.notEqual(a, b);
});

test('aktualizace: termín, let, program a rozpočet od kamaráda; můj název, odškrtnutí, rezervace a vlastní aktivity zůstanou', () => {
  const own = { ...plain(v1), name: 'Řím 🍕', checklist: [{ t: 'Pas', done: true }, { t: 'Opalovací krém', done: false }],
    refs: [{ co: 'hotel', kod: 'ABC123', pozn: '' }], sharedSnap: plain({ days: v1.days, notes: v1.notes }) };
  own.days['2026-12-12'] = ['Vatikán', 'pizza u Gina'];
  const u = plain(PlanShare.merge(own, PlanShare.sanitize(v2)));
  assert.equal(u.name, 'Řím 🍕');
  assert.deepEqual([u.start, u.end, u.budget, u.flight], ['2026-12-17', '2026-12-20', '9500', 'PRG→FCO 17.12.']);
  // „Vatikán“ kamarád z programu vyhodil (byl v minulé verzi) – pryč; moje „pizza“ mimo nový termín → první den
  assert.deepEqual(u.days, { '2026-12-17': ['Koloseum', 'pizza u Gina'], '2026-12-18': ['Trastevere'] });
  assert.deepEqual(u.checklist.map(x => [x.t, x.done]), [['Pas', true], ['Opalovací krém', false], ['Adaptér', false]]);
  assert.deepEqual(u.refs, own.refs);
  assert.equal(u.notes, 'sraz v 6:00', 'poznámky jsem neměnil → kamarádovy');
  assert.equal(u.sid, 'abcde12345');
  // další aktualizace se řídí touto verzí
  assert.deepEqual(u.sharedSnap, { days: v2.days, notes: v2.notes });
});

test('aktualizace bez záznamu minulé verze (starší import, obnova ze zálohy): nic se nezahodí, jen přidá', () => {
  const own = { ...plain(v1), sid: undefined };
  const u = plain(PlanShare.merge(own, PlanShare.sanitize({ ...v2, sid: undefined })));
  assert.deepEqual(u.days, { '2026-12-17': ['Koloseum', 'Vatikán'], '2026-12-18': ['Trastevere'] });
});

test('poznámky změněné u obou: moje a pod nimi kamarádovy; vlak: čas od kamaráda, místo a kód jízdenky moje', () => {
  const ride = { date: '2026-12-17', from: 'Praha', to: 'Pardubice', kind: 'vlak', dep: '05:10', plat: '3' };
  const own = { ...plain(v1), notes: 'beru deštník', sharedSnap: { days: v1.days, notes: v1.notes },
    rides: [{ ...ride, date: '2026-12-10', dep: '06:00' }, { ...ride, dep: '04:50', seat: 'vůz 5, 61', kod: 'RJ999' }] };
  const p = PlanShare.sanitize({ ...v2, rides: [{ ...ride, dep: '05:10', plat: '4' }] });
  const u = plain(PlanShare.merge(own, p));
  assert.equal(u.notes, 'beru deštník\n\nsraz v 6:00');
  assert.deepEqual(u.rides.map(r => [r.date, r.dep, r.plat, r.seat, r.kod]), [['2026-12-17', '05:10', '4', 'vůz 5, 61', 'RJ999']], 'vlak mimo nový termín pryč');
  // kamarád poznámky neměnil → moje
  assert.equal(PlanShare.merge(own, PlanShare.sanitize({ ...v2, notes: v1.notes })).notes, 'beru deštník');
});

test('stejná cesta v Mých cestách: stejné sid; bez sid (starší odkaz nebo import) stejný název a cíl; cesta z průvodce ne', () => {
  const m = app.match(/const sharedMatch = \(trips, p\) => ([^\n]+);\n/);
  assert.ok(m, 'sharedMatch');
  const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const sharedMatch = new Function('norm', `return (trips, p) => ${m[1]};`)(norm);
  const a = { name: 'Řím s kámoši', dest: 'Řím', sid: 'abcde12345' };
  assert.equal(sharedMatch([{ name: 'X', dest: 'Y' }, a], { name: 'Jiný název', dest: 'Řím', sid: 'abcde12345' }), 1);
  assert.equal(sharedMatch([a], { name: 'Řím s kámoši', dest: 'Řím', sid: 'zzzzz99999' }), -1, 'jiné sid = jiná cesta');
  assert.equal(sharedMatch([{ name: 'Rim s kamosi', dest: 'Řím' }], { name: 'Řím s kámoši', dest: 'Řím', sid: 'abcde12345' }), 0, 'starší import bez sid');
  assert.equal(sharedMatch([{ ...a, sid: undefined }], { name: 'Řím s kámoši', dest: 'Řím' }), 0, 'starší odkaz bez sid');
  assert.equal(sharedMatch([{ ...a, wizard: {} }], { ...a }), -1, 'cestu z průvodce drží průvodce');
});

test('náhled odkazu: u novější verze 🔄 Aktualizovat moji cestu i Uložit jako novou; sdílení dá cestě sid', () => {
  const fn = app.slice(app.indexOf('function previewPlan(shared)'), app.indexOf('// úprava v okně cesty'));
  assert.match(fn, /<button class="btn primary" id="planUpdate">🔄 Aktualizovat moji cestu<\/button><button class="btn" id="planImport">Uložit jako novou<\/button>/);
  assert.match(fn, /S\.trips\[i\] = PlanShare\.merge\(mine, p\);/);
  // stejná verze znovu → „už máš“ (aktualizace by nic nezměnila)
  assert.match(fn, /if \(key\(u\) === key\(t\) && JSON\.stringify\(u\.checklist\) === JSON\.stringify\(t\.checklist\)\) \{ same = mi; mi = -1; \}/);
  // vlastní kopie záznamu verze (jinak sdílí pole dnů s cestou)
  assert.match(fn, /const snap = JSON\.parse\(JSON\.stringify\(\{ days: p\.days, notes: p\.notes \}\)\);/);
  assert.match(app, /const planJson = t => \{ if \(t && !t\.sid && window\.PlanShare && PlanShare\.newSid\) \{ t\.sid = PlanShare\.newSid\(\); save\(\); \} return PlanShare\.json\(t\); \};/);
  // sdílení a odkaz připravený při otevření detailu přes planJson (cesta dostane sid)
  assert.match(app, /return ShareLink\.send\('plan', planJson\(t\), \{/);
  assert.match(app, /\$\('#tripShare'\)\.onpointerdown = \(\) => ShareLink\.short\('plan', planJson\(t\)\);/);
  assert.match(app, /ShareLink\.prepare\('plan', planJson\(t\)\); \/\/ kliknutí pak jen zkopíruje hotový odkaz/);
});
