// Zásady ochrany osobních údajů (/soukromi) a podmínky užívání (/podminky): server je vykreslí z docs/pravni/*.md –
// jediný zdroj pravdy, žádná ruční kopie textu v HTML. Interní části pro vývoj a advokáta se vynechají (citace
// „Kde v kódu“ a úvodní poznámka návrhu, oddíl Otázky pro advokáta, značky [ověřit …]). Údaje o provozovateli
// (OPERATOR, FEEDBACK_EMAIL) se dosadí za běhu z config – repozitář je veřejný, v md ani v kódu nejsou; bez nich
// stránka srozumitelně řekne, že je doplníme. Vzhled Letsi jako stránka 404 v seo.js, bez skriptů a cizích zdrojů.
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { BRAND } from '../brand.js';
import { sendGenerated } from './seo.js';

/** Adresa stránky → zdroj v docs/pravni/ (krátké české adresy; seo.js je dává do sitemap.xml). */
export const LEGAL = {
  '/soukromi': 'zasady-ochrany-osobnich-udaju.md',
  '/podminky': 'podminky-uzivani.md',
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const todo = (t) => `<span class="todo">${t}</span>`;

/**
 * Markdown bez interních částí: citace (v těchto dokumentech jen poznámky pro vývoj – „Kde v kódu“ a úvodní
 * „Návrh, ne platný text“), oddíl Otázky pro advokáta až k dalšímu nadpisu stejné úrovně, vodorovné čáry,
 * „(návrh pro advokáta)“ v titulku a řádky IČO a adresa (OPERATOR je jeden řádek se jménem, IČO i adresou).
 */
export function publicMarkdown(md) {
  const out = [];
  let skip = 0; // úroveň nadpisu vynechaného oddílu, 0 = nic se nevynechává
  for (const line of String(md).replace(/\r/g, '').split('\n')) {
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h && skip && h[1].length <= skip) skip = 0;
    if (h && /otázky pro advokáta/i.test(h[2])) skip = h[1].length;
    if (skip || /^\s*>/.test(line) || /^\s*-{3,}\s*$/.test(line) || /^\s*- (IČO: \[IČO\]|adresa: \[adresa\])\s*$/.test(line)) continue;
    out.push(h && h[1] === '#' ? line.replace(/\s*\(návrh[^)]*\)/i, '') : line);
  }
  // [ověřit …] a poznámky s odkazem na Otázky jsou pro advokáta – i přes `kód` a konec řádku (proto tady, ne v inline)
  return out.join('\n').replace(/[ \t]*\[(?:ověřit|[^\]]*Otázky)[^\]]*\]/g, '');
}

/**
 * Značka v hranatých závorkách → HTML (text už je escapovaný): [jméno a příjmení] a [e-mail] = údaje z prostředí,
 * ostatní ([doplnit …], [datum]) „doplníme“ – majitel je doplní s advokátem v md.
 */
function mark(inner, ctx) {
  if (inner === 'jméno a příjmení') return ctx.operator ? esc(ctx.operator) : todo('jméno, IČO a adresu provozovatele doplníme');
  if (inner === 'e-mail') return ctx.email ? `<a href="mailto:${esc(ctx.email)}">${esc(ctx.email)}</a>` : todo('e-mail provozovatele doplníme');
  return todo('doplníme');
}

/** Bezpečný odkaz: jen http(s), mailto a relativní adresa na vlastním webu (bez schématu; // ani /\ prohlížeč bere
    jako cizí web); jinak null. */
const okHref = (u) => (/^(https?:\/\/|mailto:)/i.test(u) || !/^([a-z][\w+.-]*:|[\\/]{2})/i.test(u) ? u : null);

/** Řádek textu → HTML: `kód`, **tučně**, [text](odkaz), holé adresy jako odkaz, značky [ … ]. Vše escapované. */
export function inline(text, ctx = {}) {
  return String(text).split('`').map((part, i) => {
    if (i % 2) return `<code>${esc(part)}</code>`;
    return esc(part)
      // holá adresa (ne uvnitř [text](adresa)); tečka či čárka na konci patří větě
      .replace(/(?<![(\w./"=])(https?:\/\/|www\.)[^\s<()]*[^\s<().,;:]/g, (u) => `<a href="${u.startsWith('www.') ? 'https://' : ''}${u}">${u}</a>`)
      .replace(/\s?\[([^\]\n]+)\](?:\(([^)\s]+)\))?/g, (all, inner, href) => {
        const sp = all.startsWith(' ') ? ' ' : '';
        if (href === undefined) return sp + mark(inner, ctx);
        const u = okHref(href.replace(/&amp;/g, '&'));
        return sp + (u ? `<a href="${esc(u)}">${inner}</a>` : inner);
      })
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  }).join('');
}

const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
const LIST = /^\s*([-*]|\d+\.)\s+/;

/**
 * Markdown → HTML: nadpisy, odstavce, seznamy (pokračovací řádky odsazené), tabulky. Jen to, co docs/pravni používá.
 * shortcut: vnořené seznamy se zploští do jednoho – ve zveřejněných částech žádné nejsou; kdyby přibyly, doplnit.
 */
export function mdToHtml(md, ctx = {}) {
  const lines = String(md).split('\n'), out = [];
  for (let i = 0; i < lines.length;) {
    const l = lines[i];
    let m;
    if (!l.trim()) { i++; continue; }
    if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) {
      out.push(`<h${m[1].length}>${inline(m[2], ctx)}</h${m[1].length}>`);
      i++;
    } else if (l.trim().startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++]);
      const body = rows.filter((r, k) => !(k === 1 && /^[\s|:-]+$/.test(r)));
      const [head, ...rest] = body.map(cells);
      // posouvá se do strany jen tabulka sama, ne stránka (div.table s overflow-x)
      out.push(`<div class="table"><table><thead><tr>${head.map((c) => `<th>${inline(c, ctx)}</th>`).join('')}</tr></thead><tbody>${rest.map((r) => `<tr>${r.map((c) => `<td>${inline(c, ctx)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
    } else if ((m = LIST.exec(l))) {
      const tag = /\d/.test(m[1]) ? 'ol' : 'ul', items = [];
      while (i < lines.length && lines[i].trim()) {
        if (LIST.test(lines[i])) items.push(lines[i].replace(LIST, ''));
        else items[items.length - 1] += ` ${lines[i].trim()}`;
        i++;
      }
      out.push(`<${tag}>${items.map((t) => `<li>${inline(t, ctx)}</li>`).join('')}</${tag}>`);
    } else {
      const par = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*\|)/.test(lines[i]) && !LIST.test(lines[i])) par.push(lines[i++].trim());
      out.push(`<p>${inline(par.join(' '), ctx)}</p>`);
    }
  }
  return out.join('\n');
}

/** Celá stránka: titulek z nadpisu #, odkaz zpět do aplikace a na druhý dokument. ctx = { operator, email }. */
export function legalPage(md, ctx = {}, other = null, brand = BRAND) {
  const pub = publicMarkdown(md);
  const title = (/^#\s+(.*)$/m.exec(pub) || [, brand.name])[1].trim();
  const name = esc(brand.name);
  return `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="theme-color" content="#F3F4F0" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#14161F" media="(prefers-color-scheme: dark)">
<style>
@font-face{font-family:'Onest';font-style:normal;font-weight:400;font-display:swap;src:url(/vendor/fonts/letsi/onest-400.woff2) format('woff2')}
@font-face{font-family:'Onest';font-style:normal;font-weight:700 900;font-display:swap;src:url(/vendor/fonts/letsi/onest-700.woff2) format('woff2')}
:root{color-scheme:light;--bg:#F3F4F0;--card:#FFFFFF;--text:#14161F;--muted:#585D56;--border:#DFE2DA;--code:#ECEEE8}
@media (prefers-color-scheme:dark){:root{color-scheme:dark;--bg:#14161F;--card:#1D2029;--text:#F3F4F0;--muted:#A6ACB6;--border:#2A2E3A;--code:#262A35}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 Onest,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow-wrap:break-word}
header,main,footer{max-width:760px;margin:0 auto;padding:0 16px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:16px;padding-bottom:8px}
header img{display:block;width:117px;height:26px}
main{padding-top:8px;padding-bottom:24px}
h1{font-size:26px;line-height:1.25;margin:16px 0 20px}
h2{font-size:20px;line-height:1.3;margin:32px 0 10px}
h3{font-size:17px;line-height:1.35;margin:24px 0 8px}
p,ul,ol{margin:0 0 12px}
ul,ol{padding-left:22px}
li{margin-bottom:6px}
a{color:inherit;text-decoration-thickness:1px;text-underline-offset:2px}
a:focus-visible{outline:3px solid var(--text);outline-offset:2px;border-radius:4px}
code{font-size:.88em;padding:1px 5px;border-radius:5px;background:var(--code);overflow-wrap:anywhere}
.todo{padding:0 5px;border-radius:5px;border:1px dashed var(--muted);color:var(--muted);font-size:.92em}
.table{overflow-x:auto;margin:0 0 16px;border:1px solid var(--border);border-radius:12px;background:var(--card)}
table{width:100%;border-collapse:collapse;font-size:14.5px;line-height:1.45}
th,td{padding:8px 12px;text-align:left;vertical-align:top;border-bottom:1px solid var(--border)}
tr:last-child td{border-bottom:0}
th{font-weight:700}
/* klíč v tabulce nerozdělit uprostřed – radši se posune tabulka (ta jediná, ne stránka) */
td code{white-space:nowrap;overflow-wrap:normal}
/* Pistácie jen jako plná plocha pod textem Noc – v obou režimech stejně */
.back{display:inline-flex;align-items:center;min-height:44px;padding:10px 16px;border-radius:12px;background:#D6DE82;color:#14161F;font-weight:700;text-decoration:none;white-space:nowrap}
footer{display:flex;flex-wrap:wrap;gap:12px 20px;align-items:center;padding-top:20px;padding-bottom:32px;border-top:1px solid var(--border);color:var(--muted)}
</style>
</head>
<body>
<header>
<a href="/" aria-label="${name}"><picture><source srcset="/vendor/letsi/letsi-logo-negativ.svg" media="(prefers-color-scheme: dark)"><img src="/vendor/letsi/letsi-logo-hlavni.svg" alt="${name}" width="117" height="26"></picture></a>
<a class="back" href="/">Zpět do aplikace</a>
</header>
<main>
${mdToHtml(pub, ctx)}
</main>
<footer>
<a class="back" href="/">Zpět do aplikace</a>
${other ? `<a href="${esc(other.href)}">${esc(other.label)}</a>` : ''}
</footer>
</body>
</html>
`;
}

/** CSP: nic cizího a žádné skripty – jen vložené styly, logo a písmo z vlastního serveru (jako stránka 404). */
export const LEGAL_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const OTHER = { '/soukromi': { href: '/podminky', label: 'Podmínky užívání' }, '/podminky': { href: '/soukromi', label: 'Zásady ochrany osobních údajů' } };
const memo = new Map();
/** GET/HEAD /soukromi a /podminky: vykreslí md (paměť podle souboru a údajů provozovatele), ETag → levné 304. */
export function serveLegal(req, res, p, docsDir, { operator = '', email = '' } = {}) {
  const file = path.join(docsDir, LEGAL[p]);
  let st;
  try { st = statSync(file); } catch { return false; }
  const key = `${st.size}|${st.mtimeMs}|${operator}|${email}`;
  let m = memo.get(p);
  if (!m || m.key !== key) memo.set(p, m = { key, body: legalPage(readFileSync(file, 'utf8'), { operator, email }, OTHER[p]) });
  // no-cache: text se mění s nasazením, ověření přes ETag je levné
  sendGenerated(req, res, 200, m.body, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'Content-Security-Policy': LEGAL_CSP });
  return true;
}
