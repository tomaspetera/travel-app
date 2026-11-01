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
    refs: [{ co: 'hotel', kod: 'ABC123', pozn: '' }], sharedSnap: PlanShare.snapOf(v1) };
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
  assert.deepEqual(u.sharedSnap, { acts: ['Koloseum', 'Trastevere'], notes: 'sraz v 6:00' });
});

test('aktualizace bez záznamu minulé verze (starší import, obnova ze zálohy): nic se nezahodí, jen přidá', () => {
  const own = { ...plain(v1), sid: undefined };
  const u = plain(PlanShare.merge(own, PlanShare.sanitize({ ...v2, sid: undefined })));
  assert.deepEqual(u.days, { '2026-12-17': ['Koloseum', 'Vatikán'], '2026-12-18': ['Trastevere'] });
});

test('poznámky změněné u obou: moje a pod nimi kamarádovy; vlak: čas od kamaráda, místo a kód jízdenky moje', () => {
  const ride = { date: '2026-12-17', from: 'Praha', to: 'Pardubice', kind: 'vlak', dep: '05:10', plat: '3' };
  const own = { ...plain(v1), notes: 'beru deštník', sharedSnap: PlanShare.snapOf(v1),
    rides: [{ ...ride, date: '2026-12-10', dep: '06:00' }, { ...ride, dep: '04:50', seat: 'vůz 5, 61', kod: 'RJ999' }] };
  const p = PlanShare.sanitize({ ...v2, rides: [{ ...ride, dep: '05:10', plat: '4' }] });
  const u = plain(PlanShare.merge(own, p));
  assert.equal(u.notes, 'beru deštník\n\nsraz v 6:00');
  assert.deepEqual(u.rides.map(r => [r.date, r.dep, r.plat, r.seat, r.kod]), [['2026-12-17', '05:10', '4', 'vůz 5, 61', 'RJ999']], 'vlak mimo nový termín pryč');
  // kamarád poznámky neměnil → moje
  assert.equal(PlanShare.merge(own, PlanShare.sanitize({ ...v2, notes: v1.notes })).notes, 'beru deštník');
});

test('stejná cesta v Mých cestách: stejné sid; bez sid (starší odkaz nebo import) stejný název, cíl a termín do 45 dní; cesta z průvodce ne', () => {
  const src = app.slice(app.indexOf('const nearStart = '), app.indexOf('/** Náhled plánu z odkazu'));
  const okYmd = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));
  const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const sharedMatch = new Function('norm', 'okYmd', `${src}; return sharedMatch;`)(norm, okYmd);
  const a = { name: 'Řím s kámoši', dest: 'Řím', sid: 'abcde12345', start: '2026-12-10' };
  assert.deepEqual(sharedMatch([{ name: 'X', dest: 'Y' }, a], { name: 'Jiný název', dest: 'Řím', sid: 'abcde12345' }), { i: 1, byName: false });
  assert.equal(sharedMatch([a], { name: 'Řím s kámoši', dest: 'Řím', sid: 'zzzzz99999', start: '2026-12-10' }).i, -1, 'jiné sid = jiná cesta');
  assert.deepEqual(sharedMatch([{ name: 'Rim s kamosi', dest: 'Řím', start: '2026-12-10' }], { name: 'Řím s kámoši', dest: 'Řím', sid: 'abcde12345', start: '2026-12-17' }), { i: 0, byName: true }, 'starší import bez sid');
  assert.equal(sharedMatch([{ ...a, sid: undefined }], { name: 'Řím s kámoši', dest: 'Řím', start: '2026-12-10' }).i, 0, 'starší odkaz bez sid');
  assert.equal(sharedMatch([{ ...a, wizard: {} }], { ...a }).i, -1, 'cestu z průvodce drží průvodce');
  // výchozí název „Cesta: Řím“ – dubnová cesta není prosincová (dřív ji 🔄 přepsalo)
  assert.equal(sharedMatch([{ name: 'Cesta: Řím', dest: 'Řím', start: '2027-04-02' }], { name: 'Cesta: Řím', dest: 'Řím', start: '2026-12-10' }).i, -1);
  assert.equal(sharedMatch([{ name: 'Cesta: Řím', dest: 'Řím', start: '' }], { name: 'Cesta: Řím', dest: 'Řím', start: '2026-12-10' }).i, 0, 'bez data se nerozliší');
});

test('náhled odkazu: 🔄 Aktualizovat i Uložit jako novou (u shody jen podle názvu je jistější nová cesta); shrnutí z výsledku aktualizace', () => {
  const fn = app.slice(app.indexOf('function previewPlan(shared)'), app.indexOf('// úprava v okně cesty'));
  assert.match(fn, /'<button class="btn primary" id="planUpdate">🔄 Aktualizovat moji cestu<\/button><button class="btn" id="planImport">Uložit jako novou<\/button>'/);
  assert.match(fn, /\? '<button class="btn primary" id="planImport">Uložit jako novou<\/button><button class="btn" id="planUpdate">🔄 Aktualizovat moji cestu<\/button>'/);
  assert.match(fn, /let upd = m\.i >= 0 \? PlanShare\.merge\(S\.trips\[m\.i\], p\) : null;/);
  assert.match(fn, /`program \$\{nActs\(mine\)\} → <b>\$\{nActs\(upd\)\}<\/b>/, 'počet aktivit po aktualizaci, ne kamarádových');
  assert.match(fn, /S\.trips\[i\] = upd;/);
  // jen jiné sid = nic nového
  assert.match(fn, /const key = x => \{ const \{ checklist, sid, \.\.\.rest \} = PlanShare\.sanitize\(x\); return JSON\.stringify\(rest\); \};/);
  assert.match(fn, /const snap = PlanShare\.snapOf\(p\);/);
});

test('sid a záznam toho, co odešlo, až skutečným sdílením – samo otevření detailu je neuloží', () => {
  const src = app.slice(app.indexOf('const pendSid = new WeakMap();'), app.indexOf('/** Odkaz na plán (zkomprimovaný'));
  let saves = 0;
  const planJson = new Function('PlanShare', 'save', 'window', `${src}; return planJson;`)(PlanShare, () => saves++, { PlanShare });
  const t = plain({ ...v1, sid: undefined });
  const j1 = JSON.parse(planJson(t)), j2 = JSON.parse(planJson(t));
  assert.match(j1.sid, /^[a-z0-9]{10}$/); assert.equal(j1.sid, j2.sid, 'předpřipravený odkaz = odkaz po kliknutí (Safari)');
  assert.equal(t.sid, undefined); assert.equal(t.sharedSnap, undefined); assert.equal(saves, 0);
  const j3 = JSON.parse(planJson(t, true));
  assert.equal(j3.sid, j1.sid); assert.equal(t.sid, j1.sid); assert.equal(saves, 1);
  assert.deepEqual(plain(t.sharedSnap), { acts: ['Koloseum', 'Vatikán'], notes: 'sraz na letišti' });
  assert.match(app, /return ShareLink\.send\('plan', planJson\(t, true\), \{/);
  assert.match(app, /\$\('#tripShare'\)\.onpointerdown = \(\) => ShareLink\.short\('plan', planJson\(t\)\);/);
});

test('kdo sdílel první: kamarádova upravená verze nezdvojí aktivity ani poznámky (dřív bez záznamu toho, co odešlo)', () => {
  // A sdílí (záznam), B posune termín o týden, „Vatikán“ přesune, pozmění poznámky a pošle zpět
  const a = { ...plain(v1), sharedSnap: PlanShare.snapOf(v1) };
  const b = PlanShare.sanitize({ ...v1, start: '2026-12-17', end: '2026-12-20', days: { '2026-12-17': ['Koloseum'], '2026-12-19': ['Vatikán'] }, notes: 'sraz v 6:00 u brány' });
  const u = plain(PlanShare.merge(a, b));
  assert.deepEqual(u.days, { '2026-12-17': ['Koloseum'], '2026-12-19': ['Vatikán'] });
  assert.equal(u.notes, 'sraz v 6:00 u brány');
  // moje vlastní aktivita (po sdílení) zůstane
  const a2 = { ...a, days: { ...a.days, '2026-12-11': ['pizza'] } };
  assert.deepEqual(plain(PlanShare.merge(a2, b)).days, { '2026-12-17': ['Koloseum', 'pizza'], '2026-12-19': ['Vatikán'] });
  // dřívější tvar záznamu ({ days }) se přečte taky
  assert.deepEqual(plain(PlanShare.merge({ ...a, sharedSnap: { days: v1.days, notes: v1.notes } }, b)).days, u.days);
});

test('poznámky se při dalších verzích nehromadí – minule připojené kamarádovy se nahradí', () => {
  let own = { ...plain(v1), notes: 'beru deštník', sharedSnap: PlanShare.snapOf(v1) };
  for (const n of ['sraz v 6:00', 'sraz v 6:30', 'sraz v 7:00']) own = plain(PlanShare.merge(own, PlanShare.sanitize({ ...v1, notes: n })));
  assert.equal(own.notes, 'beru deštník\n\nsraz v 7:00');
});
