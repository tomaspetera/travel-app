// Název, popis a adresa webu na jednom místě. Při přejmenování (nový název, logo, doména .cz) se mění tady: server je
// dosadí do <title> a popisu stránky, náhledu odkazu (Open Graph, Twitter Card), JSON-LD, manifestu aplikace na ploše,
// robots.txt, sitemap.xml a stránky 404 (server/lib/seo.js). Náhledový obrázek z nich vykreslí
// scripts/build-og-image.mjs (spustit znovu – test/seo.test.js pozná zastaralý obrázek). Co dál (ikony, texty
// v aplikaci): README → Přejmenování a doména.
export const BRAND = {
  // Název aplikace: pod ikonou na ploše (manifest name i short_name – Android ukáže ~12 znaků), v náhledu odkazu, 404.
  name: 'ATLAS',
  // Titulek stránky: záložka, výsledek ve vyhledávači (Google ukáže ~60 znaků) a nadpis náhledu odkazu.
  title: 'ATLAS · nejlevnější letenky odkudkoliv kamkoliv',
  // Popis pro vyhledávače a náhled odkazu (Google ukáže ~155 znaků, Facebook a WhatsApp 1–2 řádky).
  description: 'Nejlevnější letenky ze všech letišť v okolí najednou – Ryanair, Wizz Air i další aerolinky – a plánovač celé cesty. Zdarma, bez registrace.',
  // Popis aplikace na ploše (manifest description – okno instalace v prohlížeči).
  appDescription: 'Nejlevnější lety ze všech letišť v okolí najednou, celá cesta krok za krokem a plánovač cest. Uložené cesty a plány uvidíš i bez internetu.',
  // Slogan a tři body na náhledovém obrázku (scripts/build-og-image.mjs).
  tagline: 'Nejlevnější letenky odkudkoliv kamkoliv',
  points: ['Všechna letiště v okolí najednou', 'Celá cesta krok za krokem', 'Zdarma, bez registrace'],
  // Veřejná adresa webu (bez lomítka na konci): kanonická adresa, náhled odkazu, sitemap.xml. Na Renderu ji přepíše
  // proměnná prostředí PUBLIC_URL (např. https://atlas.cz) – tady jen výchozí, když není nastavená.
  url: 'https://atlas-letenky.onrender.com',
  // Náhledový obrázek odkazu v public/ (scripts/build-og-image.mjs) a jeho popis pro čtečky obrazovky.
  image: { path: 'og-image.png', width: 1200, height: 630, alt: 'ATLAS – nejlevnější letenky ze všech letišť v okolí najednou a plánovač celé cesty' },
};
