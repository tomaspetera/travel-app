/* ATLAS – kratší sdílené odkazy (#trip=…, #plan=…): JSON zkomprimovaný v prohlížeči (deflate-raw, CompressionStream)
   v base64url se značkou „z“ na začátku. Cesta s trasou přes tři místa má místo ~18 100 znaků asi 4 900.
   Dřívější odkazy (base64url JSON – začínají vždy „ey“) fungují dál. Prohlížeč bez CompressionStream vytvoří odkaz
   po staru a zkomprimovaný rozbalí vlastním inflate (níže).
   Plán zůstává jen v odkazu: část adresy za # prohlížeč na server neposílá.
   Komprese je asynchronní, Safari ale dovolí zápis do schránky jen přímo v obsluze kliknutí – odkaz se proto připraví
   předem (prepare při vykreslení tlačítka) a kliknutí zkopíruje hotový. Když hotový není (plán se mezitím změnil),
   zkusí ClipboardItem s Promise (Safari), jinak writeText po dokončení komprese. */
(function () {
  const MAX_PAYLOAD = 200000; // znaků za # – víc žádná cesta ani plán nemá
  const MAX_JSON = 1 << 20;   // rozbalený JSON nejvýš 1 MB: cizí odkaz nesmí „kompresní bombou“ zahltit paměť
  const FORMAT = 'deflate-raw';

  const b64url = bytes => {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const unb64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  // Chrome 80–102 umí jen gzip a deflate (s hlavičkou) – deflate-raw je o 2–6 bajtů kratší a umí ho Chrome 103+,
  // Safari 16.4+ i Firefox 113+.
  const zipOk = () => {
    try { return typeof DecompressionStream === 'function' && !!new CompressionStream(FORMAT) && !!new DecompressionStream(FORMAT); } catch (e) { return false; }
  };

  /* Záloha pro prohlížeče bez DecompressionStream (Safari do 16.3 – iPhony, které skončily na iOS 15 –, Chrome do 102,
     Firefox do 112): rozbalení deflate-raw podle RFC 1951 (postup jako zlib contrib/puff). Výstup nejvýš max bajtů,
     poškozená data → výjimka; každý krok čte vstup, takže se nezacyklí. */
  const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  const ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
  const bad = () => { throw new Error('poškozený odkaz'); };
  /** Kanonický Huffmanův kód z délek: počty kódů podle délky a symboly seřazené podle kódu. */
  function huffman(lengths) {
    const count = new Uint16Array(16), offs = new Uint16Array(16), symbol = new Uint16Array(lengths.length);
    for (const l of lengths) count[l]++;
    let left = 1;
    for (let len = 1; len < 16; len++) { left = left * 2 - count[len]; if (left < 0) bad(); }
    for (let len = 1; len < 15; len++) offs[len + 1] = offs[len] + count[len];
    lengths.forEach((l, s) => { if (l) symbol[offs[l]++] = s; });
    return { count, symbol };
  }
  let fixed = null;
  function inflateRaw(src, max) {
    let pos = 0, buf = 0, cnt = 0, n = 0, out = new Uint8Array(Math.min(max, 4096));
    const bits = k => {
      let v = buf;
      while (cnt < k) { if (pos >= src.length) bad(); v |= src[pos++] << cnt; cnt += 8; }
      buf = v >>> k; cnt -= k;
      return v & ((1 << k) - 1);
    };
    const room = k => {
      if (n + k <= out.length) return;
      if (n + k > max) throw new Error('odkaz je příliš velký');
      const o = new Uint8Array(Math.min(max, Math.max(out.length * 2, n + k)));
      o.set(out.subarray(0, n));
      out = o;
    };
    const decode = h => {
      for (let len = 1, code = 0, first = 0, index = 0; len < 16; len++) {
        code |= bits(1);
        const c = h.count[len];
        if (code - c < first) return h.symbol[index + code - first];
        index += c; first = (first + c) << 1; code <<= 1;
      }
      return bad();
    };
    const codes = (lc, dc) => {
      for (;;) {
        let sym = decode(lc);
        if (sym < 256) { room(1); out[n++] = sym; continue; }
        if (sym === 256) return;
        sym -= 257;
        if (sym >= 29) bad();
        const len = LBASE[sym] + bits(LEXT[sym]), ds = decode(dc);
        if (ds >= 30) bad();
        const dist = DBASE[ds] + bits(DEXT[ds]);
        if (dist > n) bad();
        room(len);
        for (let i = 0; i < len; i++, n++) out[n] = out[n - dist];
      }
    };
    const dynamic = () => {
      const nlen = bits(5) + 257, ndist = bits(5) + 1, ncode = bits(4) + 4;
      if (nlen > 286 || ndist > 30) bad();
      const cl = new Uint8Array(19);
      for (let i = 0; i < ncode; i++) cl[ORDER[i]] = bits(3);
      const lc = huffman(cl), all = new Uint8Array(nlen + ndist);
      for (let i = 0; i < all.length;) {
        const sym = decode(lc);
        if (sym < 16) { all[i++] = sym; continue; }
        if (sym === 16 && !i) bad();
        const val = sym === 16 ? all[i - 1] : 0, rep = sym === 16 ? 3 + bits(2) : sym === 17 ? 3 + bits(3) : 11 + bits(7);
        if (i + rep > all.length) bad();
        all.fill(val, i, i + rep);
        i += rep;
      }
      if (!all[256]) bad(); // bez kódu konce bloku
      return [huffman(all.subarray(0, nlen)), huffman(all.subarray(nlen))];
    };
    for (let last = 0; !last;) {
      last = bits(1);
      const type = bits(2);
      if (type === 0) {
        buf = 0; cnt = 0; // nekomprimovaný blok začíná na celém bajtu
        if (pos + 4 > src.length) bad();
        const len = src[pos] | (src[pos + 1] << 8);
        if (len !== (~(src[pos + 2] | (src[pos + 3] << 8)) & 0xffff) || pos + 4 + len > src.length) bad();
        pos += 4;
        room(len);
        out.set(src.subarray(pos, pos + len), n);
        n += len; pos += len;
      } else if (type === 1) {
        if (!fixed) {
          const l = new Uint8Array(288);
          l.fill(8, 0, 144); l.fill(9, 144, 256); l.fill(7, 256, 280); l.fill(8, 280, 288);
          fixed = [huffman(l), huffman(new Uint8Array(30).fill(5))];
        }
        codes(...fixed);
      } else if (type === 2) codes(...dynamic());
      else bad();
    }
    return out.subarray(0, n);
  }

  /** Bajty přes kompresi / dekompresi; víc než max bajtů na výstupu → výjimka (zbytek se nečte). */
  async function through(bytes, stream, max) {
    const writer = stream.writable.getWriter();
    writer.write(bytes).catch(() => {});
    writer.close().catch(() => {});
    const reader = stream.readable.getReader(), parts = [];
    let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.length;
      if (n > max) { reader.cancel().catch(() => {}); throw new Error('odkaz je příliš velký'); }
      parts.push(value);
    }
    const out = new Uint8Array(n);
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
  }

  /** JSON → část odkazu za #trip= / #plan=: „z“ + base64url(deflate-raw), nebo base64url(JSON), když komprese chybí
   *  nebo by odkaz neprodloužila (krátký plán). */
  async function pack(json) {
    const raw = new TextEncoder().encode(json), plain = b64url(raw);
    if (!zipOk()) return plain;
    try {
      const z = 'z' + b64url(await through(raw, new CompressionStream(FORMAT), Infinity));
      return z.length < plain.length ? z : plain;
    } catch (e) {
      return plain;
    }
  }

  /** Část odkazu za # → JSON (nový tvar „z…“ i dřívější base64url JSON). Poškozený nebo příliš velký odkaz → výjimka. */
  async function unpack(payload) {
    if (typeof payload !== 'string' || !/^[A-Za-z0-9_-]+$/.test(payload) || payload.length > MAX_PAYLOAD) throw new Error('poškozený odkaz');
    let bytes;
    if (payload[0] === 'z') {
      const z = unb64url(payload.slice(1));
      bytes = zipOk() ? await through(z, new DecompressionStream(FORMAT), MAX_JSON) : inflateRaw(z, MAX_JSON);
    } else {
      bytes = unb64url(payload);
      if (bytes.length > MAX_JSON) throw new Error('odkaz je příliš velký');
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  }

  // Připravené odkazy podle obsahu (posledních pár) – kliknutí na „Sdílet“ pak najde hotový.
  const ready = new Map();
  /** Odkaz {url (až po kompresi), done: Promise<url>} pro #<kind>=…; kind '' = jen kód bez adresy (hlídání v mobilu).
   *  Volá se už při vykreslení tlačítka. */
  function prepare(kind, json) {
    const key = kind + '\n' + json;
    let e = ready.get(key);
    if (!e) {
      e = { url: null };
      e.done = pack(json).then(p => (e.url = kind ? `${location.origin}${location.pathname}#${kind}=${p}` : p));
      ready.set(key, e);
      if (ready.size > 4) ready.delete(ready.keys().next().value);
    }
    return e;
  }

  /**
   * Zkopíruje odkaz do schránky → Promise<{ url, copied }>. Hotový odkaz se zapíše hned (ještě v obsluze kliknutí),
   * jinak ClipboardItem s Promise (Safari počká na kompresi) a nakonec writeText. Nezkopírovaný odkaz (copied: false)
   * nabídne volající k ručnímu zkopírování.
   */
  async function copy(kind, json) {
    const e = prepare(kind, json), cb = navigator.clipboard;
    try {
      if (!cb) throw new Error('bez schránky');
      if (e.url) await cb.writeText(e.url);
      else if (typeof ClipboardItem === 'function' && typeof cb.write === 'function') {
        try {
          await cb.write([new ClipboardItem({ 'text/plain': e.done.then(u => new Blob([u], { type: 'text/plain' })) })]);
        } catch (err) {
          await cb.writeText(await e.done);
        }
      } else await cb.writeText(await e.done);
      return { url: await e.done, copied: true };
    } catch (err) {
      return { url: await e.done, copied: false };
    }
  }

  window.ShareLink = { pack, unpack, prepare, copy, MAX_JSON };
})();
