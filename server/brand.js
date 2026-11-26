// Název, popis a adresa webu na jednom místě. Při přejmenování (nový název, logo, doména .cz) se mění tady: server je
// dosadí do <title> a popisu stránky, náhledu odkazu (Open Graph, Twitter Card), JSON-LD, manifestu aplikace na ploše,
// robots.txt, sitemap.xml a stránky 404 (server/lib/seo.js). Náhledový obrázek z nich vykreslí
// scripts/build-og-image.mjs (spustit znovu – test/seo.test.js pozná zastaralý obrázek). Co dál (ikony, texty
// v aplikaci): README → Přejmenování a doména.
// Ceny letů jsou jen orientační z mezipaměti: v textech značky žádná jména aerolinek, žádné „nejlevnější“ jako slib
// a žádné „živé“ ani „aktuální“ ceny.
export const BRAND = {
  // Název aplikace: pod ikonou na ploše (manifest name i short_name – Android ukáže ~12 znaků), v náhledu odkazu, 404.
  name: 'Letsi',
  // Titulek stránky: záložka, výsledek ve vyhledávači (Google ukáže ~60 znaků) a nadpis náhledu odkazu.
  title: 'Letsi · levné letenky a celá cesta krok za krokem',
  // Popis pro vyhledávače a náhled odkazu (Google ukáže ~155 znaků, Facebook a WhatsApp 1–2 řádky).
  description: 'Levné letenky ze všech letišť v okolí najednou a celá cesta krok za krokem – trasa, ubytování i program. Zdarma a bez registrace.',
  // Popis aplikace na ploše (manifest description – okno instalace v prohlížeči).
  appDescription: 'Levné letenky ze všech letišť v okolí najednou a celá cesta krok za krokem – trasa, ubytování, program. Uložené cesty a plány uvidíš i bez internetu.',
  // Slogan a tři body na náhledovém obrázku (scripts/build-og-image.mjs).
  tagline: 'Levné letenky a celá cesta krok za krokem',
  points: ['Všechna letiště v okolí najednou', 'Trasa, ubytování i program', 'Zdarma a bez registrace'],
  // Veřejná adresa webu (bez lomítka na konci): kanonická adresa, náhled odkazu, sitemap.xml. Na Renderu ji přepíše
  // proměnná prostředí PUBLIC_URL – tady jen výchozí, když není nastavená (stará atlas-letenky.onrender.com běží dál).
  url: 'https://letsi.cz',
  // Náhledový obrázek odkazu v public/ (scripts/build-og-image.mjs) a jeho popis pro čtečky obrazovky.
  image: { path: 'og-image.png', width: 1200, height: 630, alt: 'Letsi – levné letenky ze všech letišť v okolí a plán celé cesty krok za krokem' },
};
