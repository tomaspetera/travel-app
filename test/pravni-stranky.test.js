// Zásady ochrany osobních údajů (/soukromi) a podmínky užívání (/podminky): server je vykreslí z docs/pravni/*.md
// (server/lib/pravni.js) bez interních částí pro vývoj a advokáta, provozovatel a e-mail jen z prostředí, vše
// escapované, CSP bez cizích zdrojů, ETag. Okno O aplikaci (public/js/about.js) na ně odkazuje vždy, i bez /api/health.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

process.env.ATLAS_MOCK = '1';
const { createServer } = await import('../server/index.js');
const { config } = await import('../server/config.js');
const { publicMarkdown, inline, mdToHtml, legalPage, LEGAL } = await import('../server/lib/pravni.js');
const { SECURITY_HEADERS } = await import('../server/lib/security.js');

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const DOCS = Object.values(LEGAL).map((f) => [f, read(`docs/pravni/${f}`)]);
const mainOf = (html) => html.split('<main>')[1].split('</main>')[0].trim();

let server, base;
before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('zveřejněný text: bez „Kde v kódu“, úvodní poznámky návrhu, Otázek pro advokáta a značek [ověřit …]', () => {
  for (const [f, md] of DOCS) {
    assert.match(md, /Otázky pro advokáta/, `${f}: zdroj interní části má (test by jinak nic nehlídal)`);
    const body = mainOf(legalPage(md, {}));
    assert.doesNotMatch(body, /Kde v kódu|Otázky pro advokáta|Návrh, ne platný|návrh pro advokáta|\[ověřit|\[doplnit|viz Otázky|<blockquote|&gt; /, f);
    // jediné hranaté závorky, které zůstanou, jsou v `kódu` (např. [e-mail] jako náhrada v hlášení chyb)
    assert.doesNotMatch(body.replace(/<code>[^<]*<\/code>/g, ''), /\[|\]/, f);
    assert.match(body, /^<h1>[^<]+ – Letsi<\/h1>/, `${f}: titulek bez „(návrh pro advokáta)“`);
  }
  const zasady = mainOf(legalPage(DOCS[0][1], {}));
  for (const s of ['1. Kdo údaje zpracovává', '3.7 Záznam průchodu návštěvou (jen se souhlasem)', '7. Tvoje práva', '8. Změny zásad']) assert.ok(zasady.includes(`>${s}</h`), s);
  assert.match(zasady, /Úřadu pro ochranu osobních údajů<\/b>, Pplk\. Sochora 27, 170 00 Praha 7, <a href="https:\/\/www\.uoou\.gov\.cz">www\.uoou\.gov\.cz<\/a>\./);
  assert.match(zasady, /<div class="table"><table><thead><tr><th>Klíč<\/th><th>Co obsahuje<\/th><\/tr><\/thead><tbody><tr><td><code>atlas_v1<\/code><\/td>/);
  // značka uvnitř `kódu` a přes konec řádku zmizí celá (STATS_KEY v bodě 3.6)
  assert.doesNotMatch(zasady, /jsou součty veřejné/);
  assert.match(zasady, /jsou za klíčem\.<\/li>/);
});

test('provozovatel a e-mail jen z prostředí: bez nich srozumitelný zástupný text, s nimi escapované; v md nejsou', () => {
  for (const [f, md] of DOCS) {
    // repozitář je veřejný – zdroj má jen zástupné značky
    assert.match(md, /^- \[jméno a příjmení\]$/m, f);
    assert.match(md, /^- e-mail: \[e-mail\]$/m, f);
    const none = mainOf(legalPage(md, {}));
    assert.match(none, /<li><span class="todo">jméno, IČO a adresu provozovatele doplníme<\/span><\/li><li>e-mail: <span class="todo">e-mail provozovatele doplníme<\/span><\/li>/, f);
    assert.doesNotMatch(none, /IČO: |adresa: /, `${f}: řádky IČO a adresa vynechané (OPERATOR je jeden řádek)`);
    const set = mainOf(legalPage(md, { operator: 'Jan <b>Novák</b>, IČO 12345678, Praha', email: 'pravni@example.org' }));
    assert.match(set, /<li>Jan &lt;b&gt;Novák&lt;\/b&gt;, IČO 12345678, Praha<\/li><li>e-mail: <a href="mailto:pravni@example\.org">pravni@example\.org<\/a><\/li>/, f);
    assert.doesNotMatch(set, /e-mail provozovatele doplníme/, f);
  }
  assert.match(mainOf(legalPage(DOCS[0][1], { email: 'a@b.cz' })), /Napiš na <a href="mailto:a@b\.cz">a@b\.cz<\/a>\./);
});

test('převod markdownu: escapování, odkazy jen http(s)/mailto/relativní, tučné, kód, seznamy, tabulky', () => {
  assert.equal(inline('<script>alert(1)</script> & "x"'), '&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;');
  assert.equal(inline('**tučně** a `<kód> **ne**`'), '<b>tučně</b> a <code>&lt;kód&gt; **ne**</code>');
  assert.equal(inline('[web](https://letsi.cz/a?b=1&c=2)'), '<a href="https://letsi.cz/a?b=1&amp;c=2">web</a>');
  assert.equal(inline('[pište](mailto:a@b.cz) [zpět](/) [podmínky](podminky)'), '<a href="mailto:a@b.cz">pište</a> <a href="/">zpět</a> <a href="podminky">podmínky</a>');
  for (const bad of ['javascript:alert%281%29', 'JavaScript:x', '//evil.cz/x', '/\\evil.cz', 'data:text/html,x', 'vbscript:x']) assert.equal(inline(`[klik](${bad})`), 'klik', bad);
  assert.equal(inline('Viz https://adr.coi.cz.'), 'Viz <a href="https://adr.coi.cz">https://adr.coi.cz</a>.');
  assert.equal(inline('Účinné od: [datum]'), 'Účinné od: <span class="todo">doplníme</span>');
  assert.equal(mdToHtml('# A\n\nodstavec\npokračuje\n\n- jedna\n  dál\n- dvě\n\n1. první\n\n| a | b |\n|---|---|\n| `x` | **y** |'),
    '<h1>A</h1>\n<p>odstavec pokračuje</p>\n<ul><li>jedna dál</li><li>dvě</li></ul>\n<ol><li>první</li></ol>\n'
    + '<div class="table"><table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td><code>x</code></td><td><b>y</b></td></tr></tbody></table></div>');
  // oddíl Otázek se vynechá až k dalšímu nadpisu stejné úrovně; citace a čáry pryč
  assert.equal(publicMarkdown('# T (návrh pro advokáta)\n> poznámka\n## A\ntext\n---\n## Otázky pro advokáta\n1. ?\n### pod\nx\n## B\ny'), '# T\n## A\ntext\n## B\ny');
});

test('GET /soukromi a /podminky: 200, česká stránka, CSP bez cizích zdrojů a skriptů, ETag a 304, HEAD; údaje z config', async () => {
  const prev = [config.operator, config.feedbackEmail];
  try {
    config.operator = ''; config.feedbackEmail = '';
    for (const [p, h1] of [['/soukromi', 'Zásady ochrany osobních údajů – Letsi'], ['/podminky', 'Podmínky užívání – Letsi']]) {
      const r = await fetch(`${base}${p}`);
      assert.equal(r.status, 200, p);
      assert.equal(r.headers.get('content-type'), 'text/html; charset=utf-8');
      assert.equal(r.headers.get('cache-control'), 'no-cache');
      const csp = r.headers.get('content-security-policy');
      assert.match(csp, /default-src 'none'/);
      assert.doesNotMatch(csp, /https?:|script-src|\*/, `${p}: nic cizího, žádné skripty`);
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (k.toLowerCase() !== 'content-security-policy') assert.equal(r.headers.get(k), v, `${p}: ${k}`);
      const html = await r.text();
      assert.match(html, new RegExp(`<title>${h1}</title>`));
      assert.match(html, /<html lang="cs">/);
      assert.match(html, /<a class="back" href="\/">Zpět do aplikace<\/a>/);
      assert.match(html, /url\(\/vendor\/fonts\/letsi\/onest-400\.woff2\)/);
      assert.doesNotMatch(html, /<script|fonts\.googleapis|src="https?:/, `${p}: bez skriptů a cizích zdrojů`);
      assert.match(html, /prefers-color-scheme:dark/);
      assert.match(html, /e-mail provozovatele doplníme/);
      const etag = r.headers.get('etag');
      assert.ok(etag);
      assert.equal((await fetch(`${base}${p}`, { headers: { 'If-None-Match': etag } })).status, 304);
      const head = await fetch(`${base}${p}`, { method: 'HEAD' });
      assert.deepEqual([head.status, await head.text()], [200, '']);
    }
    assert.match(await (await fetch(`${base}/soukromi`)).text(), /<a href="\/podminky">Podmínky užívání<\/a>/);
    config.operator = 'Jan Novák, IČO 12345678, Praha'; config.feedbackEmail = 'pravni@example.org';
    const html = await (await fetch(`${base}/podminky`)).text();
    assert.match(html, /<li>Jan Novák, IČO 12345678, Praha<\/li>/);
    assert.match(html, /Kontakt pro dotazy a stížnosti: <a href="mailto:pravni@example\.org">pravni@example\.org<\/a>\./);
    assert.equal((await fetch(`${base}/soukromi/neco`)).status, 404);
  } finally {
    [config.operator, config.feedbackEmail] = prev;
  }
});

test('O aplikaci: správce, kontakt, ÚOOÚ a odkazy na obě stránky vždy – i bez /api/health a bez OPERATOR', () => {
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('public/js/about.js'), ctx, { filename: 'about.js' });
  const none = ctx.About.html({ version: 'v' });
  assert.match(none, /<a class="btn ghost" id="abPrivacy" href="\/soukromi" [^>]*>Zásady ochrany osobních údajů ↗<\/a>/);
  assert.match(none, /<a class="btn ghost" id="abTerms" href="\/podminky" [^>]*>Podmínky užívání ↗<\/a>/);
  assert.match(none, /Správce osobních údajů: <b id="abOp">provozovatel Letsi<\/b> <span class="faint">\(jméno a IČO doplníme\)<\/span>\. Kontakt: <span class="faint">e-mail doplníme<\/span>\./);
  assert.match(none, /Stížnost můžeš podat u <a href="https:\/\/uoou\.gov\.cz\/"[^>]*>Úřadu pro ochranu osobních údajů<\/a>/);
  // nahoře: hned po úvodním odstavci, před „Jak to funguje“
  assert.ok(none.indexOf('abPrivacy') < none.indexOf('Jak to funguje'));
  const set = ctx.About.html({ version: 'v', operator: 'Jan Novák, IČO 12345678', email: 'pravni@example.org' });
  assert.match(set, /<b id="abOp">Jan Novák, IČO 12345678<\/b>\. Kontakt: <a id="abContact" href="mailto:pravni@example\.org">pravni@example\.org<\/a>\./);
  // neplatná adresa (vložené hlavičky mailto) se neukáže
  assert.match(ctx.About.html({ version: 'v', email: 'a@b.cz?bcc=x@y.cz' }), /Kontakt: <span class="faint">e-mail doplníme<\/span>/);
});
