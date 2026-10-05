/* Vlajky na Windows: Chrome a Edge tam emoji vlajek nemají (místo 🇨🇿 ukážou „CZ“). Když prohlížeč
   vlajky neumí, doplní je písmo Twemoji Country Flags – jen pro znaky vlajek (unicode-range), takže
   Inter i Sora převezmou vlajky beze změny ostatních stylů. Detekce převzatá z country-flag-emoji-polyfill
   (MIT, TalkJS); písmo z Twemoji (CC BY 4.0), viz vendor/flags/LICENSE.md. */
(function () {
  const EMOJI_FONTS = '"Twemoji Mozilla","Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji","EmojiOne Color","Android Emoji",sans-serif';
  // Barevné emoji vykreslí stejný pixel bílou i černou barvou písma, černobílý znak ne.
  function colored(text) {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.textBaseline = 'top';
    ctx.font = `100px ${EMOJI_FONTS}`;
    ctx.scale(0.01, 0.01);
    const px = color => { ctx.clearRect(0, 0, 100, 100); ctx.fillStyle = color; ctx.fillText(text, 0, 0); return ctx.getImageData(0, 0, 1, 1).data.join(','); };
    const white = px('#fff');
    const black = px('#000');
    return white === black && !black.startsWith('0,0,0,');
  }
  try {
    if (!colored('😊') || colored('🇨🇭')) return;
  } catch (e) {
    return;
  }
  const range = 'U+1F1E6-1F1FF, U+1F3F4, U+E0062-E0063, U+E0065, U+E0067, U+E006C, U+E006E, U+E0073-E0074, U+E0077, U+E007F';
  // Chrome skládá rodinu jen z řezů stejné váhy – vlajkový řez proto musí mít každá váha, kterou
  // načítá Google Fonts (index.html: Inter 400–800, Sora 600–800); rozsah „100 900“ nestačí.
  const faces = [['Inter', [400, 500, 600, 700, 800]], ['Sora', [600, 700, 800]], ['Twemoji Country Flags', [400]]];
  const style = document.createElement('style');
  style.textContent = faces.flatMap(([f, ws]) => ws.map(w => `@font-face{font-family:"${f}";unicode-range:${range};src:url("vendor/flags/TwemojiCountryFlags.woff2") format("woff2");font-weight:${w};font-display:swap}`)).join('\n');
  document.head.appendChild(style);
  document.documentElement.classList.add('flag-font');
})();
