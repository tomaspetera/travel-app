// ℹ️ O aplikaci a soukromí (public/js/about.js přes node:vm) a 💬 Napsat nám: feedback v /api/health jen
// s FEEDBACK_EMAIL. Hlídá i to, co okno slibuje o soukromí – žádné cookies ani analytika v kódu.
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
  for (const s of ['Ryanair', 'Wizz Air', 'Kiwi.com', 'Travelpayouts / Aviasales', 'Xotelo', 'Open-Meteo', 'OpenFreeMap', 'OpenStreetMap', 'Mapy.com', 'Wikidata', 'Wikipedie', 'Wikivoyage', 'Unsplash', 'Pexels', 'Wikimedia', 'BRouter', 'RegioJet']) {
    assert.ok(html.includes(s), `zdroj ${s}`);
  }
  assert.match(html, /localStorage/);
  assert.match(html, /žádné cookies, analytika ani měření návštěvnosti/);
  assert.match(html, /žádná aerolinka ani partner si za lepší pozici neplatí/);
  assert.match(html, /vždy ji ověř u partnera/);
  assert.match(html, /id="abBk"/, '💾 Přenos a záloha');
  assert.match(html, /Verze 2026-10-22/);
  assert.doesNotMatch(html, /mailto:|abMail/, 'bez adresy žádné 💬 Napsat nám');
  assert.doesNotMatch(A.html({ version: 'x', backup: false }), /abBk/, 'bez backup.js bez tlačítka zálohy');
});

test('💬 Napsat nám: mailto s verzí a obrazovkou v předmětu, jen s platnou adresou', () => {
  const url = A.mailto('atlas@example.org', '2026-10-22', 'Cesta');
  assert.equal(url, `mailto:atlas@example.org?subject=${encodeURIComponent('ATLAS – zpětná vazba (verze 2026-10-22, obrazovka: Cesta)')}`);
  const html = A.html({ version: '2026-10-22', email: 'atlas@example.org', screen: 'Cesta' });
  assert.match(html, /id="abMail" href="mailto:atlas@example\.org\?subject=ATLAS%20%E2%80%93/);
  assert.match(html, /💬 Napsat nám/);
  for (const bad of ['a@b.cz?bcc=x@y.cz', '"><img src=x>@a.cz', null, 42]) {
    assert.equal(A.mailto(bad, 'v', 's'), null, String(bad));
    assert.doesNotMatch(A.html({ version: 'v', email: bad }), /mailto:/);
  }
  assert.match(A.html({ version: '<img src=x>' }), /Verze &lt;img src=x&gt;/, 'verze se escapuje');
});

test('soukromí podle kódu: v aplikaci žádné cookies, analytika ani měřicí skripty; e-mail nikde natvrdo', () => {
  const files = readdirSync(new URL('../public/js/', import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => `public/js/${f}`);
  for (const f of [...files, 'public/index.html']) {
    const src = read(f);
    assert.doesNotMatch(src, /document\.cookie|sendBeacon|gtag\(|google-analytics|googletagmanager|plausible|matomo|hotjar/i, f);
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

test('okno: 💛 Podpořit ATLAS a provozovatel jen s platnými údaji; text se escapuje', () => {
  const none = A.html({ version: 'v' });
  assert.doesNotMatch(none, /abSupport|Provozovatel|Příspěvek/);
  const html = A.html({ version: 'v', support: 'https://buy.stripe.com/test_7sI4hY0abc', operator: 'Jan Novák, IČO 12345678' });
  assert.match(html, /<a class="btn" id="abSupport" href="https:\/\/buy\.stripe\.com\/test_7sI4hY0abc" target="_blank" rel="noopener">💛 Podpořit ATLAS ↗<\/a>/);
  assert.match(html, /zaplatíš kartou na stránce Stripe/);
  assert.match(html, /<b>Příspěvek<\/b> \(💛 Podpořit ATLAS\): platíš na stránce Stripe/, 'v soukromí, kdo platbu zpracovává');
  assert.match(html, /<h4 class="ab-h">Provozovatel<\/h4><p style="font-size:14px" id="abOp">Jan Novák, IČO 12345678<\/p>/);
  for (const bad of ['https://evil.cz/x', 'javascript:alert(1)', 42, null]) {
    assert.equal(A.okPay(bad), false, String(bad));
    assert.doesNotMatch(A.html({ version: 'v', support: bad }), /abSupport/);
  }
  assert.match(A.html({ version: 'v', operator: '<img src=x onerror=alert(1)>' }), /id="abOp">&lt;img src=x onerror=alert\(1\)&gt;<\/p>/);
  // v kódu žádný platební odkaz natvrdo – jen z proměnné prostředí
  for (const f of ['public/js/about.js', 'public/js/trip.js', 'public/js/app.js', 'public/index.html']) {
    // (kontrola v about.js je regulární výraz se zpětnými lomítky – skutečná adresa by byla https://buy.stripe.com/xxx)
    assert.doesNotMatch(read(f), /https:\/\/buy\.stripe\.com\/[A-Za-z0-9]/, f);
  }
});

test('shrnutí cesty: věta 💛 Podpořit ATLAS jen s odkazem z /api/health (ověřeným About.okPay)', () => {
  const trip = read('public/js/trip.js');
  assert.match(trip, /<p class="faint sum-support" id="sumSupport" hidden><\/p>/);
  assert.match(trip, /if \(!el \|\| !About\.okPay\(url\)\) return;/);
  assert.match(trip, /<a href="\$\{esc\(url\)\}" target="_blank" rel="noopener">💛 Podpořit ATLAS ↗<\/a>/);
});
