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
  // jen jiné sid nebo otisky verzí (ver / base / prev – nese je každý nový odkaz) = nic nového
  assert.match(fn, /const key = x => \{ const \{ checklist, sid, ver, base, prev, \.\.\.rest \} = PlanShare\.sanitize\(x\); return JSON\.stringify\(rest\); \};/);
  assert.match(fn, /if \(i < 0\) \{ const \{ sid, ver, base, prev, \.\.\.q \} = p;/);
  assert.match(fn, /const snap = PlanShare\.snapOf\(p\);/);
  // „Uložit si ji“ u plánu, který už mám: cesta jako objekt z otevření náhledu – index by po změně cest v jiném panelu
  // ukázal na cizí cestu (dostala by sid kamarádova plánu a jeho další verze by ji přepsaly)
  assert.match(fn, /sameT = same >= 0 \? S\.trips\[same\] : null;/);
  assert.match(fn, /let i = sameT \? S\.trips\.indexOf\(sameT\) : -1;\s*if \(i < 0\) i = S\.trips\.findIndex\(t => t && key\(t\) === key\(p\)\);/);
  assert.ok(!/S\.trips\[same\] \? same/.test(fn), 'žádný index z otevření náhledu');
});

test('sid a záznam toho, co odešlo, až odeslaným odkazem – otevření detailu ani zavřená nabídka je neuloží; existující záznam se nepřepíše', () => {
  const src = app.slice(app.indexOf('const pendSid = new WeakMap();'), app.indexOf('/** Odkaz na plán (zkomprimovaný'));
  let saves = 0;
  const [planJson, sharedOut] = new Function('PlanShare', 'save', 'window', `${src}; return [planJson, sharedOut];`)(PlanShare, () => saves++, { PlanShare });
  const t = plain({ ...v1, sid: undefined });
  const j1 = planJson(t), j2 = planJson(t), sid = JSON.parse(j1).sid;
  assert.match(sid, /^[a-z0-9]{10}$/); assert.equal(j1, j2, 'předpřipravený odkaz = odkaz po kliknutí (Safari)');
  assert.equal(t.sid, undefined); assert.equal(t.sharedSnap, undefined); assert.equal(saves, 0);
  sharedOut(t, j1);
  assert.equal(t.sid, sid); assert.equal(saves, 1);
  assert.deepEqual(plain(t.sharedSnap), { acts: ['Koloseum', 'Vatikán'], notes: 'sraz na letišti' });
  // další sdílení (s mými novými aktivitami) záznam nepřepíše – kamarád ho otevřít nemusí
  t.days['2026-12-11'] = ['Opera (moje)'];
  sharedOut(t, planJson(t));
  assert.deepEqual(plain(t.sharedSnap).acts, ['Koloseum', 'Vatikán']);
  // sharePlan: uložit až po odeslání (sdíleno, zkopírováno, ruční kopie), ne po zavřené nabídce
  const sp = app.slice(app.indexOf('function sharePlan(i)'), app.indexOf('/**', app.indexOf('function sharePlan(i)')));
  assert.match(sp, /if \(!r\.aborted && \(r\.shared \|\| r\.copied \|\| r\.url\)\) sharedOut\(t, j\);/);
  assert.match(app, /\$\('#tripShare'\)\.onpointerdown = \(\) => ShareLink\.short\('plan', planJson\(t\)\);/);
});

test('vlastní aktivity při současných úpravách zůstanou: odeslaný, ale neotevřený odkaz se nebere jako „kamarád smazal“', () => {
  // B má v1 (import), přidá „Trastevere (B)“ a poznámku; A mezitím pošle v2 (jiný let) – B aktualizuje
  const b = { ...plain(v1), sharedSnap: PlanShare.snapOf(v1) };
  b.days['2026-12-11'] = ['Trastevere (B)']; b.notes = 'sraz na letišti; B má klíče';
  const u = plain(PlanShare.merge(b, PlanShare.sanitize({ ...v1, flight: 'PRG→FCO' })));
  assert.deepEqual(u.days, { '2026-12-10': ['Koloseum'], '2026-12-11': ['Trastevere (B)'], '2026-12-12': ['Vatikán'] });
  assert.equal(u.notes, 'sraz na letišti; B má klíče');
});

test('opakovaná aktivita („Pláž“ každý den) – moje přidaná jiný den zůstane; texty s uvozovkami a apostrofem se nezdvojí', () => {
  const base = { ...v1, days: { '2026-12-10': ['Pláž'], '2026-12-12': ['Vatikán'] } };
  const own = { ...plain(base), sharedSnap: PlanShare.snapOf(PlanShare.sanitize(base)) };
  own.days['2026-12-11'] = ['Muzeum', 'Pláž'];
  const u = plain(PlanShare.merge(own, PlanShare.sanitize(base)));
  assert.deepEqual(u.days, { '2026-12-10': ['Pláž'], '2026-12-11': ['Muzeum', 'Pláž'], '2026-12-12': ['Vatikán'] });
  // kamarád „Pláž“ 10. 12. smazal: pryč, moje 11. 12. zůstane
  const u2 = plain(PlanShare.merge(own, PlanShare.sanitize({ ...base, days: { '2026-12-12': ['Vatikán'] } })));
  assert.deepEqual(u2.days, { '2026-12-11': ['Muzeum', 'Pláž'], '2026-12-12': ['Vatikán'] });
  // text, který odkaz upraví (uvozovky, apostrof): táž aktivita i poznámka
  const q = { ...v1, days: { '2026-12-10': ['Večeře v "Dishoom"', "Gail's"] }, notes: 'sraz u "hodin" v 6:00' };
  const mine = { ...plain(q), sharedSnap: PlanShare.snapOf(PlanShare.sanitize(q)) };
  const u3 = plain(PlanShare.merge(mine, PlanShare.sanitize(q)));
  assert.equal(u3.days['2026-12-10'].length, 2);
  assert.equal(u3.notes.includes('\n\n'), false);
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

test('střídavé úpravy: kamarádovo mazání, přesuny a poznámky platí (podle otisku verze, kterou viděl – ver / base)', () => {
  // A pošle v1 (sentSnaps[ver1]); B importuje, přidá Trastevere a Operu, upraví poznámky a pošle zpět (base = ver1)
  const A0 = plain(v1); const j1 = JSON.parse(PlanShare.json(A0));
  const A = { ...A0, sid: j1.sid, sharedSnap: PlanShare.snapOf(j1), sentSnaps: { [j1.ver]: PlanShare.snapOf(j1) } };
  const p1 = PlanShare.sanitize(j1);
  let B = { ...plain(p1), sharedSnap: PlanShare.snapOf(p1), gotVer: p1.ver };
  delete B.ver; delete B.base;
  B.days['2026-12-11'] = ['Trastevere', 'Opera']; B.notes = 'sraz na letišti v 6:00';
  const jb = JSON.parse(PlanShare.json(B)); B.sentSnaps = { [jb.ver]: PlanShare.snapOf(jb) };
  assert.equal(jb.base, p1.ver);
  // A aktualizuje, smaže Trastevere, přesune Operu na 13. 12., upraví poznámky a pošle zpět (base = ver B)
  let A2 = plain(PlanShare.merge(A, PlanShare.sanitize(jb)));
  assert.deepEqual(A2.days['2026-12-11'], ['Trastevere', 'Opera']);
  A2.days['2026-12-11'] = []; A2.days['2026-12-13'] = ['Opera']; A2.notes = 'sraz na letišti v 6:00, terminál 2';
  const ja = JSON.parse(PlanShare.json(A2));
  assert.equal(ja.base, jb.ver);
  // B aktualizuje: Trastevere pryč, Opera jen 13. 12., poznámky Ádiny (dřív Trastevere zůstalo, Opera dvakrát, poznámky dvakrát)
  const B2 = plain(PlanShare.merge(B, PlanShare.sanitize(ja)));
  assert.deepEqual(Object.fromEntries(Object.entries(B2.days).filter(([, v]) => v.length)), { '2026-12-10': ['Koloseum'], '2026-12-12': ['Vatikán'], '2026-12-13': ['Opera'] });
  assert.equal(B2.notes, 'sraz na letišti v 6:00, terminál 2');
  // odesílatel pošle novější verzi, kamarád v ní něco smaže a vrátí: smazání platí (dřív Opera zůstala)
  const A3 = { ...plain(v1), days: { ...v1.days, '2026-12-11': ['Opera'] } }, j3 = JSON.parse(PlanShare.json(A3));
  const A3s = { ...A3, sharedSnap: PlanShare.snapOf(PlanShare.sanitize(v1)), sentSnaps: { [j3.ver]: PlanShare.snapOf(j3) } };
  const back = PlanShare.sanitize({ ...v1, base: j3.ver });
  assert.equal(plain(PlanShare.merge(A3s, back)).days['2026-12-11'], undefined);
  // otisk je stejný pro stejný obsah (předpřipravený odkaz = odeslaný)
  assert.equal(PlanShare.verOf(A3), PlanShare.verOf(plain(A3)));
});

test('Safari: odkaz odeslaný až z hlášky „Odkaz je připravený“ se zaznamená (onShared)', () => {
  const sl = readFileSync(new URL('../public/js/sharelink.js', import.meta.url), 'utf8');
  assert.match(sl, /run: \(\) => navigator\.share\(\{ title, text, url \}\)\.then\(\(\) => \{ if \(onShared\) onShared\(url\); \}, \(\) => \{ \}\)/);
  assert.match(app, /onShared: \(\) => sharedOut\(t, j\) \}\)/);
});

// „💾 Uložit si ji“ u plánu, který už mám (previewPlan): převzetí sid a otisku přijaté verze
const usedSrc = app.match(/ {6}const adopt = [\s\S]*?if \(adopt \|\| got\) save\(\);/)[0];
const already = (t, p, trips = [t]) => { let saves = 0; new Function('t', 'p', 'S', 'snap', 'save', usedSrc)(t, p, { trips }, PlanShare.snapOf(p), () => saves++); return saves; };

test('„už máš“ nedá sid kopii, když ho má jiná cesta („Uložit jako novou“)', () => {
  const p = PlanShare.sanitize(JSON.parse(PlanShare.json(v1)));
  const orig = { ...plain(v1) }, copy = { ...plain(v1), sid: undefined };
  already(copy, p, [orig, copy]);
  assert.equal(copy.sid, undefined);
  assert.equal(copy.gotVer, undefined);
  const lone = { ...plain(v1), sid: undefined };
  already(lone, p);
  assert.deepEqual([lone.sid, lone.gotVer], ['abcde12345', p.ver], 'jediná cesta sid převezme i s otiskem verze');
});

// dvě zařízení: odeslání (planJson + sharedOut z app.js), „💾 Uložit si ji“ a „🔄 Aktualizovat“
const shareSrc = app.slice(app.indexOf('const pendSid = new WeakMap();'), app.indexOf('/** Odkaz na plán (zkomprimovaný'));
const [planJsonS, sharedOutS] = new Function('PlanShare', 'save', 'window', `${shareSrc}; return [planJson, sharedOut];`)(PlanShare, () => {}, { PlanShare });
const send = t => { const j = planJsonS(t); sharedOutS(t, j); return PlanShare.sanitize(JSON.parse(j)); };
const take = p => { const { sid, ver, base, prev, ...q } = plain(p); return { ...q, sid, sharedSnap: PlanShare.snapOf(p), ...(ver ? { gotVer: ver } : {}) }; };
const upd = (own, p) => plain(PlanShare.merge(own, p));
const prog = t => Object.fromEntries(Object.entries(t.days).filter(([, v]) => v.length));

test('kamarád pošle víc verzí po sobě: jeho mazání, přesuny i poznámky z dalších verzí platí (dřív zůstávaly a zdvojovaly se)', () => {
  let A = plain(v1); const B = take(send(A));
  B.days['2026-12-11'] = ['Trastevere']; B.days['2026-12-12'] = ['Vatikán', 'Pizza']; B.notes = 'sraz v 6:00';
  A = upd(A, send(B));
  assert.deepEqual(prog(A), prog(B));
  // B dál: Trastevere smaže, Pizzu přesune, poznámky upraví (base pořád moje první verze – nic dalšího ode mě nedostal)
  B.days['2026-12-11'] = []; B.days['2026-12-12'] = ['Vatikán']; B.days['2026-12-13'] = ['Pizza']; B.notes = 'sraz v 6:30';
  const y2 = send(B);
  assert.equal(y2.prev.length, 1, 'odkaz nese otisk dřív odeslané verze');
  A = upd(A, y2);
  assert.deepEqual(prog(A), prog(B));
  assert.equal(A.notes, 'sraz v 6:30');
  B.days['2026-12-11'] = ['Opera'];
  A = upd(A, send(B));
  assert.deepEqual([prog(A), A.notes], [prog(B), 'sraz v 6:30']);
  // moje poznámky s připojenými kamarádovými: připojené se nahradí jeho novými
  A.notes = 'beru deštník\n\nsraz v 6:30'; B.notes = 'sraz v 7:00';
  assert.equal(upd(A, send(B)).notes, 'beru deštník\n\nsraz v 7:00');
});

test('tři lidé: verze kamaráda, který tu od druhého neviděl, jeho aktivity nesmaže', () => {
  let A = plain(v1); const x1 = send(A), B = take(x1), C = take(x1);
  B.days['2026-12-11'] = ['Trastevere']; A = upd(A, send(B));
  C.days['2026-12-12'] = []; A = upd(A, send(C));
  assert.deepEqual(prog(A), { '2026-12-10': ['Koloseum'], '2026-12-11': ['Trastevere'] });
});

test('střídavě: co smažu, pošlu a před odpovědí zase přidám, po odpovědi zůstane', () => {
  let A = plain(v1); let B = take(send(A));
  B.days['2026-12-12'] = [];
  A = upd(A, send(B));
  B.days['2026-12-12'] = ['Vatikán'];
  A.flight = 'PRG→FCO';
  B = upd(B, send(A));
  assert.deepEqual(prog(B), { '2026-12-10': ['Koloseum'], '2026-12-12': ['Vatikán'] });
  assert.equal(B.flight, 'PRG→FCO');
});

test('„už máš“ (kamarád vrátil plán beze změny): otisk jeho verze se převezme, starší odkaz ani můj vlastní ne', () => {
  let A = plain(v1); const B = take(send(A));
  B.days['2026-12-11'] = ['Trastevere']; A = upd(A, send(B));
  // A vrátí plán beze změny (týž obsah = týž otisk jako B odeslal – od vlastního odkazu nerozeznatelné, otisk zůstane);
  // B pak Trastevere smaže: u A taky (dřív zůstalo a „už máš“)
  const gotB = B.gotVer;
  assert.equal(already(B, send(A)), 0);
  B.days['2026-12-11'] = [];
  A = upd(A, send(B));
  assert.deepEqual(prog(A), { '2026-12-10': ['Koloseum'], '2026-12-12': ['Vatikán'] });
  // A si cestu jen přejmenuje (název zůstává každému svůj) a pošle: B ji má, otisk A převezme
  A.name = 'Řím 🍕';
  const x2 = send(A);
  assert.equal(JSON.stringify(prog(upd(B, x2))), JSON.stringify(prog(B)), 'aktualizace by nic nezměnila – „už máš“');
  assert.equal(already(B, x2), 1);
  assert.deepEqual([B.gotVer, plain(B.sharedSnap)], [x2.ver, plain(PlanShare.snapOf(x2))]);
  // starší odkaz (moje přijatá verze není mezi jeho dřív odeslanými): záznam se nevrací
  const b2 = { ...take(PlanShare.sanitize(JSON.parse(PlanShare.json(v1)))), gotVer: 'vnewer1' };
  assert.equal(already(b2, PlanShare.sanitize({ ...JSON.parse(PlanShare.json(v1)), prev: [gotB] })), 0);
  assert.equal(b2.gotVer, 'vnewer1');
  // můj vlastní odkaz: nic
  const a0 = plain(v1), mineLink = send(a0), snap0 = plain(a0.sharedSnap);
  assert.equal(already(a0, mineLink), 0);
  assert.deepEqual([a0.gotVer, plain(a0.sharedSnap)], [undefined, snap0]);
});

test('otisk verze: vždy začíná písmenem (jen číslice by JS v sentSnaps řadil první), posledních 5 odeslaných podle pořadí', () => {
  for (let i = 0; i < 3000; i++) assert.match(PlanShare.verOf({ ...v1, notes: `poznámka ${i}` }), /^v[a-z0-9]{1,7}$/);
  const t = plain(v1), sent = [];
  for (let i = 0; i < 7; i++) { t.notes = `verze ${i}`; sent.push(send(t).ver); }
  assert.deepEqual(Object.keys(t.sentSnaps), sent.slice(-5));
  // odkaz s ver / base / prev od starší verze aplikace bez písmene projde (párování se staršími záznamy)
  assert.deepEqual(plain(PlanShare.sanitize({ ...v1, ver: '1962059', base: 'k3j4h5', prev: ['1962059', 'BAD!', 7, 'k3j4h5'] }).prev), ['1962059', 'k3j4h5']);
});

test('odkaz starší verze aplikace (bez otisku): otisk přijaté verze se smaže – patřil k nahrazenému záznamu', () => {
  const own = { ...plain(v1), sharedSnap: PlanShare.snapOf(v1), gotVer: 'vstary1' };
  const u = upd(own, PlanShare.sanitize({ ...v2 }));
  assert.equal('gotVer' in u, false);
  assert.equal(JSON.parse(PlanShare.json(u)).base, undefined);
});
