// ℹ️ O aplikaci a soukromí (public/js/about.js přes node:vm) a 💬 Napsat nám: feedback v /api/health jen
// s FEEDBACK_EMAIL. Hlídá i to, co okno slibuje o soukromí – žádné cookies ani sledovací skripty v kódu.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

process.env.ATLAS_MOCK = '1';
const { createServer } = await import('../server/index.js');
const { config, cleanEmail, cleanPayUrl, cleanOperator } = await import('../server/config.js');

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(read('public/js/about.js'), ctx, { filename: 'about.js' });
const A = ctx.About;

let server, base;
before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('/api/health: feedback jen s nastavenou FEEDBACK_EMAIL; žádné cookies', async () => {
  const prev = config.feedbackEmail;
  try {
    config.feedbackEmail = '';
    const r = await fetch(`${base}/api/health`);
    assert.equal(r.headers.get('set-cookie'), null, 'server nenastavuje cookies');
    assert.equal('feedback' in (await r.json()), false, 'bez adresy žádné feedback → tlačítko skryté');
    config.feedbackEmail = 'atlas@example.org';
    assert.deepEqual((await (await fetch(`${base}/api/health`)).json()).feedback, { email: 'atlas@example.org' });
  } finally {
    config.feedbackEmail = prev;
  }
});

test('FEEDBACK_EMAIL: jen jedna obyčejná adresa (nic, co by v mailto přidalo adresáty nebo hlavičky)', () => {
  assert.equal(cleanEmail(' atlas+zpetna@example.co.uk '), 'atlas+zpetna@example.co.uk');
  for (const bad of ['', undefined, 'atlas', 'a@b', 'a@b.cz,c@d.cz', 'a@b.cz?bcc=c@d.cz', 'a b@c.cz', 'a@b.cz\r\nBcc: x@y.cz', '<a@b.cz>']) {
    assert.equal(cleanEmail(bad), '', String(bad));
  }
});

test('okno: zdroje dat, ukládání jen v prohlížeči, řazení, orientační ceny, záloha a verze', () => {
  const html = A.html({ version: '2026-10-22', screen: 'Lety' });
  // bez /api/health jen zdroje, které platí vždy (vypínatelné podle health – test/o-aplikaci-zdroje.test.js)
  for (const s of ['GeoNames (CC BY 4.0)', 'MET Norway', 'OpenFreeMap', 'OpenStreetMap', 'Wikidata', 'Wikipedie', 'Wikivoyage', 'Unsplash', 'Pexels', 'Wikimedia', 'BRouter', 'RegioJet']) {
    assert.ok(html.includes(s), `zdroj ${s}`);
  }
  assert.doesNotMatch(html, /Open-Meteo/, 'hledání míst z vlastního seznamu (GeoNames), ne Open-Meteo');
  // licence CC BY 4.0 chce u dat odkaz na licenci a na zdroj
  for (const u of ['https://creativecommons.org/licenses/by/4.0/', 'https://www.geonames.org/', 'https://www.met.no/']) assert.ok(html.includes(u), u);
  // ČSÚ a Oil Bulletin jsou CC BY 4.0 (ne CC0), letiště z OpenFlights ODbL, vlajky Twemoji CC BY 4.0, odkaz na Pexels
  assert.doesNotMatch(html, /CC0/);
  assert.match(html, /ČSÚ a Weekly Oil Bulletin EU \(CC BY 4\.0, upraveno\)/);
  assert.match(html, /© Evropská unie; upraveno/);
  assert.match(html, /OpenFlights \(ODbL\)/);
  for (const u of ['https://opendatacommons.org/licenses/odbl/1-0/', 'https://openflights.org/data', 'https://twitter.github.io/twemoji', 'https://www.pexels.com']) assert.ok(html.includes(u), u);
  assert.match(html, /Twemoji \(CC BY 4\.0\)/);
  assert.match(html, /Letsi není spojen s žádnou leteckou společností ani prodejcem; ceny a odkazy jsou z veřejných a partnerských zdrojů\./);
  assert.match(html, /localStorage/);
  assert.match(html, /<b>Žádné cookies ani sledování jednotlivců<\/b> – kromě záznamu návštěvy bez jména a IP adresy, pokud ho sám zapneš \(Pomáhat se zlepšováním – přepínač níž v tomhle okně\)\. Počítám jen souhrnné denní počty \(kolikrát se otevřela aplikace, kolik proběhlo hledání, kolik cest vzniklo, kde aplikace nic nenašla nebo selhala a které možnosti lidé volí v krátkých otázkách\) – bez osobních údajů a bez vazby na tebe nebo tvoje zařízení\./);
  assert.equal(html.match(/[Žž]ádná aerolinka ani partner si za lepší pozici neplatí/g).length, 1, 'věta jednou');
  assert.match(html, /vždy ji ověř u partnera/);
  // RateLimiter (server/lib/ratelimit.js) maže adresu nejpozději po okně; nejdelší okno je hodina (hlášení chyb, odkazy)
  assert.match(html, /IP adresu si kvůli limitům požadavků pamatuje nejdéle hodinu od posledního požadavku/);
  const windows = [...read('server/index.js').matchAll(/new RateLimiter\(\{[^}]*windowMs: ([\d. *e]+)/g)].map((m) => Number(eval(m[1])));
  assert.ok(windows.length && windows.every((w) => w <= 3600e3), `okna limitů ${windows}`);
  assert.match(html, /id="abBk"/, '💾 Přenos a záloha');
  assert.match(html, /Verze 2026-10-22<\/p>/, 'bez sestavení jen verze');
  // sestavení z <meta name="atlas-build"> (WN_ID se mění jen s novinkami), escapované
  assert.match(A.html({ version: '2026-10-22', build: '3f9a0c1b2d4e' }), /Verze 2026-10-22 · sestavení 3f9a0c1b2d4e<\/p>/);
  assert.match(A.html({ version: 'v', build: '<b>' }), /sestavení &lt;b&gt;/);
  assert.match(read('public/js/about.js'), /const buildNow = \(\) => \{ const m = document\.querySelector\('meta\[name="atlas-build"\]'\);/);
  // „Letsi není spojen…“ s mezerou pod drobným textem o licencích (odstavce v okně mají margin 0)
  assert.match(html, /<p style="font-size:14px;margin-top:10px">Letsi není spojen/);
  assert.doesNotMatch(html, /mailto:|abMail/, 'bez adresy žádné 💬 Napsat nám');
  assert.doesNotMatch(A.html({ version: 'x', backup: false }), /abBk/, 'bez backup.js bez tlačítka zálohy');
});

test('💬 Napsat nám: mailto s verzí a obrazovkou v předmětu, jen s platnou adresou', () => {
  const url = A.mailto('atlas@example.org', '2026-10-22', 'Cesta');
  assert.equal(url, `mailto:atlas@example.org?subject=${encodeURIComponent('Letsi – zpětná vazba (verze 2026-10-22, obrazovka: Cesta)')}`);
  const html = A.html({ version: '2026-10-22', email: 'atlas@example.org', screen: 'Cesta' });
  assert.match(html, /id="abMail" href="mailto:atlas@example\.org\?subject=Letsi%20%E2%80%93/);
  assert.match(html, /💬 Napsat nám/);
  for (const bad of ['a@b.cz?bcc=x@y.cz', '"><img src=x>@a.cz', null, 42]) {
    assert.equal(A.mailto(bad, 'v', 's'), null, String(bad));
    assert.doesNotMatch(A.html({ version: 'v', email: bad }), /mailto:/);
  }
  assert.match(A.html({ version: '<img src=x>' }), /Verze &lt;img src=x&gt;/, 'verze se escapuje');
});

test('soukromí podle kódu: v aplikaci žádné cookies ani cizí měřicí skripty; e-mail nikde natvrdo', () => {
  const files = readdirSync(new URL('../public/js/', import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => `public/js/${f}`);
  for (const f of [...files, 'public/index.html']) {
    const src = read(f);
    assert.doesNotMatch(src, /document\.cookie|gtag\(|google-analytics|googletagmanager|plausible|matomo|hotjar/i, f);
    // sendBeacon jen v count.js: posílá samotný název události k dennímu součtu (test/pocitadla.test.js)
    if (f !== 'public/js/count.js') assert.doesNotMatch(src, /sendBeacon/, f);
    assert.doesNotMatch(src, /mailto:[\w.+-]+@/i, `${f}: žádná adresa v kódu`);
  }
  assert.doesNotMatch(read('server/index.js'), /set-cookie/i, 'server cookies nenastavuje');
});

test('/api/health: 💛 odkaz na příspěvek a provozovatel jen s SUPPORT_URL a OPERATOR', async () => {
  const prev = [config.supportUrl, config.operator];
  try {
    config.supportUrl = ''; config.operator = '';
    const j = await (await fetch(`${base}/api/health`)).json();
    assert.equal('support' in j, false);
    assert.equal('operator' in j, false);
    config.supportUrl = 'https://buy.stripe.com/test_7sI4hY0abc'; config.operator = 'Jan Novák, IČO 12345678, Praha';
    const k = await (await fetch(`${base}/api/health`)).json();
    assert.deepEqual(k.support, { url: 'https://buy.stripe.com/test_7sI4hY0abc' });
    assert.equal(k.operator, 'Jan Novák, IČO 12345678, Praha');
  } finally {
    [config.supportUrl, config.operator] = prev;
  }
});

test('SUPPORT_URL jen platební odkaz Stripe; OPERATOR jeden řádek textu do 200 znaků', () => {
  assert.equal(cleanPayUrl(' https://buy.stripe.com/14k5ldAbC9xy '), 'https://buy.stripe.com/14k5ldAbC9xy');
  for (const bad of ['', undefined, 'http://buy.stripe.com/abcd', 'https://buy.stripe.com.evil.cz/abcd', 'https://evil.cz/buy.stripe.com/abcd', 'https://buy.stripe.com/abcd?x=1', 'https://buy.stripe.com/ab', 'javascript:alert(1)', 'https://buy.stripe.com/a"b<c']) {
    assert.equal(cleanPayUrl(bad), '', String(bad));
  }
  assert.equal(cleanOperator('  Jan  Novák,\r\nIČO 12345678\u202e '), 'Jan Novák, IČO 12345678');
  assert.equal(cleanOperator('x'.repeat(300)).length, 200);
  assert.equal(cleanOperator(undefined), '');
});

test('okno: 💛 Podpořit Letsi a provozovatel jen s platnými údaji; text se escapuje', () => {
  const none = A.html({ version: 'v' });
  assert.doesNotMatch(none, /abSupport|Provozovatel|Příspěvek/);
  const html = A.html({ version: 'v', support: 'https://buy.stripe.com/test_7sI4hY0abc', operator: 'Jan Novák, IČO 12345678' });
  assert.match(html, /<a class="btn" id="abSupport" href="https:\/\/buy\.stripe\.com\/test_7sI4hY0abc" target="_blank" rel="noopener">💛 Podpořit Letsi ↗<\/a>/);
  assert.match(html, /zaplatíš kartou na stránce Stripe/);
  assert.match(html, /<b>Příspěvek<\/b> \(💛 Podpořit Letsi\): platíš na stránce Stripe/, 'v soukromí, kdo platbu zpracovává');
  assert.match(html, /Správce osobních údajů: <b id="abOp">Jan Novák, IČO 12345678<\/b>\./);
  for (const bad of ['https://evil.cz/x', 'javascript:alert(1)', 42, null]) {
    assert.equal(A.okPay(bad), false, String(bad));
    assert.doesNotMatch(A.html({ version: 'v', support: bad }), /abSupport/);
  }
  assert.match(A.html({ version: 'v', operator: '<img src=x onerror=alert(1)>' }), /id="abOp">&lt;img src=x onerror=alert\(1\)&gt;<\/b>/);
  // v kódu žádný platební odkaz natvrdo – jen z proměnné prostředí
  for (const f of ['public/js/about.js', 'public/js/trip.js', 'public/js/app.js', 'public/index.html']) {
    // (kontrola v about.js je regulární výraz se zpětnými lomítky – skutečná adresa by byla https://buy.stripe.com/xxx)
    assert.doesNotMatch(read(f), /https:\/\/buy\.stripe\.com\/[A-Za-z0-9]/, f);
  }
});

test('shrnutí cesty: věta 💛 Podpořit Letsi jen s odkazem z /api/health (ověřeným About.okPay)', () => {
  const trip = read('public/js/trip.js');
  assert.match(trip, /<p class="faint sum-support" id="sumSupport" hidden><\/p>/);
  assert.match(trip, /if \(!el \|\| !About\.okPay\(url\)\) return;/);
  assert.match(trip, /<a href="\$\{esc\(url\)\}" target="_blank" rel="noopener">💛 Podpořit Letsi ↗<\/a>/);
});

test('okno: krátký odkaz s adresou letsi.cz, ceny „orientační“ jako štítek ve výsledcích (ne ⏱ z mezipaměti)', () => {
  const html = A.html({ version: 'v' });
  assert.match(html, /<b>Krátký odkaz na sdílenou cestu<\/b> \(letsi\.cz\/c\/…\)/);
  assert.doesNotMatch(html, /atlas…|⏱|z mezipaměti \(/);
  assert.match(html, /ceny označené jako orientační můžou být starší/);
});

test('zásady, bod 4: každý klíč atlas_… z aplikace je v zásadách (přesně, nebo předpona s „…“)', () => {
  const zasady = read('docs/pravni/zasady-ochrany-osobnich-udaju.md');
  const named = [...zasady.matchAll(/`(atlas_[\w]*)(…?)`/g)];
  const exact = new Set(named.filter((m) => !m[2]).map((m) => m[1]));
  const prefixes = named.filter((m) => m[2]).map((m) => m[1]);
  const files = readdirSync(new URL('../public/js/', import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => `public/js/${f}`);
  for (const f of [...files, 'public/index.html']) {
    for (const [, key] of read(f).matchAll(/['"`](atlas_\w+)['"`]/g)) {
      assert.ok(exact.has(key) || prefixes.some((p) => key.startsWith(p)), `${f}: klíč ${key} chybí v zásadách (bod 4)`);
    }
  }
  // Letsi Plus si pamatuje den poslední otázky na cenu – bod 3.6 to musí říct (jinak „v zařízení se nic neukládá“)
  assert.match(read('public/js/plus.js'), /ASK_KEY = 'atlas_price_q'/);
  assert.match(zasady, /jen nabídka Letsi Plus si pamatuje den, kdy se naposledy zeptala na\s+cenu \(`atlas_price_q`/);
});

test('zásady a podmínky podle kódu: IP se maže po okně, sdílená cesta bez kódů rezervací, ceny letů orientační', () => {
  const zasady = read('docs/pravni/zasady-ochrany-osobnich-udaju.md');
  // RateLimiter.sweep maže adresu po uplynutí okna – zásady už nesmí slibovat jen „do restartu“
  assert.match(read('server/lib/ratelimit.js'), /sweep\(now = Date\.now\(\)\)/);
  assert.match(zasady, /server z paměti sám smaže\s+nejpozději po uplynutí okna/);
  assert.doesNotMatch(zasady, /zmizí při dalším požadavku z ní/);
  // shareJson vynechává 🔖 kódy rezervací i kód jízdenky
  assert.match(read('public/js/trip.js'), /refs: undefined, rides: undefined, kod: undefined/);
  assert.match(zasady, /čas založení, 🔖 kódy rezervací a kód jízdenky/);
  assert.doesNotMatch(zasady, /výslovně se ale nevynechávají/);
  // podmínky: štítek ve výsledcích je „orientační – ověř“ (flights.js cacheTag), žádné „⏱ z cache“
  const podminky = read('docs/pravni/podminky-uzivani.md');
  assert.match(read('public/js/flights.js'), />orientační – ověř<\/span>/);
  assert.match(podminky, /označené \*\*orientační – ověř\*\*/);
  assert.match(podminky, /Ceny letů jsou orientační: pocházejí z vyhledávání jiných cestujících na\s+Aviasales \(Travelpayouts\)/);
  assert.doesNotMatch(podminky, /z cache|⏱/);
});

test('OPERATOR: pryč i C1 řídicí znaky a měkké rozdělení; zkrácení po znacích nerozpůlí emoji', () => {
  const c = String.fromCharCode;
  assert.equal(cleanOperator(`Jan${c(0x85)}Novák${c(0xad)}!`), 'Jan Novák !');
  const long = cleanOperator('x'.repeat(199) + String.fromCodePoint(0x1F600) + 'yyy');
  assert.equal(Array.from(long).length, 200);
  assert.equal(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(long), false, 'žádná osamocená půlka emoji');
});
