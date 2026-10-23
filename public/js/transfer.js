/* ATLAS – 📲 Přenést do jiného zařízení (⋯ Další, na počítači postranní panel): všechno, co je jen v localStorage
   tohoto prohlížeče, v jednom odkazu #sync=… a jako QR kód (qr.js) – nový telefon, nebo telefon a počítač bez účtu.
   Odkaz nese totéž co 💾 soubor zálohy (backup.js: cesty, hlídané ceny, 📌 odložené nabídky, ⭐ / 🙈 města, navštívené
   země, domov radaru, 🏠 vlastní ceny, odškrtnutí „Před cestou“) ve stejném formátu s verzí (app, v, at, data) –
   druhé zařízení ho tedy čistí a slučuje tímtéž kódem (Backup.parse, diff, merge) a odkaz z novější verze odmítne
   s „obnov stránku“. Uložené výsledky hledání, radar, fotky, paměť cen ani motiv se nepřenášejí.
   JSON je zkomprimovaný (deflate-raw, base64url – sharelink.js) v části adresy za #: tu prohlížeč na server neposílá,
   hlášení chyb ji vynechává (errlog.js) a aplikace ji po otevření hned smaže z adresy (history.replaceState) – data
   nezůstanou v historii ani v záložce. Druhé zařízení ukáže, co přibude, a nechá vybrat Sloučit nebo Nahradit
   (s potvrzením a Vrátit) – nikdy nic nepřepíše potichu.
   QR kód: bajtový režim, oprava M, a když se nevejde, L; verze 1–40 podle délky – tedy odkaz nejvýš 2 331 bajtů s M,
   2 953 s L. Větší data jen odkazem (sdílení, schránka; nejvýš MAX_LINK znaků jako ShareLink) nebo souborem zálohy. */
(function () {
  const KIND = 'sync';
  const MAX_LINK = 200000; // ShareLink.unpack víc nepřijme
  const QR_MAX = 440; // CSS px – na počítači dost velký pro fotoaparát telefonu, na telefonu celá šířka okna
  const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Část za #sync= z adresy nebo z vloženého textu („Moje data: https://…#sync=z…“) → payload, jinak null. */
  function payloadOf(text) {
    const m = /#sync=([A-Za-z0-9_-]+)/.exec(String(text || ''));
    return m ? m[1] : null;
  }

  /**
   * Co s odkazem jde: { qr: QR kód (null = nevejde se ani do verze 40-L), link: false = moc dlouhý i na odkaz }.
   * Krátký odkaz → malá verze kódu (snadno se čte i z displeje telefonu).
   */
  function fit(url, { maxVersion = 40 } = {}) {
    const payload = payloadOf(url) || '';
    return { qr: window.QR ? QR.encode(url, { maxVersion }) : null, link: payload.length <= MAX_LINK, bytes: new TextEncoder().encode(url).length };
  }

  /** Šířka QR kódu v CSS px: celé pixely displeje na modul (stejně široké moduly – ostřejší pro fotoaparát), nejvýš max. */
  function sizePx(max, modules, dpr = 1) {
    const dev = Math.floor((max * dpr) / modules);
    return dev >= 2 ? (dev * modules) / dpr : max;
  }

  /** Payload odkazu → pročištěná data (ShareLink.unpack + Backup.parse); jinak chyba s českou hláškou. */
  async function read(payload, deps) {
    if (!payload) throw new Error('Odkaz na přenos je poškozený – nech si ho poslat znovu (celý)');
    let json;
    try { json = await ShareLink.unpack(payload); } catch (e) {
      throw new Error(/velký/.test(e && e.message) ? 'Odkaz na přenos je moc velký – přenes data souborem zálohy' : 'Odkaz na přenos je poškozený – nech si ho poslat znovu (celý)');
    }
    try { return Backup.parse(json, deps); } catch (e) {
      throw new Error(/novější/.test(e && e.message) ? 'Odkaz je z novější verze ATLAS – obnov stránku a otevři ho znovu' : 'Tohle není odkaz na přenos z ATLASu');
    }
  }

  /* ---------- příjem ---------- */
  /** Payload z odkazu nebo z pole „Mám odkaz“ → náhled se Sloučit / Nahradit (Backup.incoming). */
  async function receive(payload) {
    // cesty z průvodce čistí Trip.sanitizeTrip a odškrtnutí „Před cestou“ patří PreTrip – bez nich by tiše chyběly
    if (window.Lazy) {
      try { await Lazy.need('trip'); } catch (e) { toast('Tahle část aplikace se nenačetla – zkontroluj připojení a otevři odkaz znovu', 'err'); return; }
    }
    let inc;
    try { inc = await read(payload); } catch (e) { toast(e.message, 'err'); return; }
    Backup.incoming(inc);
  }
  /**
   * Odkaz #sync=… při startu nebo vložený do otevřené stránky: adresa se hned uklidí na #dashboard (data v ní
   * nezůstanou – historie, záložka, obnovení stránky) a náhled se otevře, až se odkaz přečte → true, když šlo o #sync=.
   */
  function fromHash(hash = location.hash) {
    if (!/^#sync=/.test(hash)) return false;
    history.replaceState(null, '', '#dashboard');
    receive(payloadOf(hash));
    return true;
  }

  /* ---------- odeslání ---------- */
  const native = () => Boolean(window.ShareLink && ShareLink.native());
  // QR kód přes celou obrazovku (bílé pozadí, co největší) – klepnutím, Esc nebo Zpět zmizí
  function zoom(q) {
    const el = document.createElement('div');
    el.className = 'tf-full';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'QR kód přes celou obrazovku');
    el.innerHTML = `${QR.svg(q, { label: 'QR kód s odkazem na přenos dat' })}<div class="tf-full-tip">Klepnutím zavřeš</div>`;
    document.body.appendChild(el);
    const svg = el.querySelector('svg');
    const size = () => { svg.style.width = svg.style.height = `${sizePx(Math.min(innerWidth, innerHeight) - 24, q.size + 8, devicePixelRatio || 1)}px`; };
    // Escape zavře jen QR kód, ne i okno Přenést pod ním (to Escapem zavírá app.js na document): zachytit ho dřív
    // (capture na window) a dál nepustit
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    const close = () => { el.remove(); removeEventListener('resize', size); removeEventListener('keydown', key, true); removeEventListener('popstate', close); };
    size();
    el.onclick = close;
    addEventListener('resize', size);
    addEventListener('keydown', key, true);
    addEventListener('popstate', close);
  }

  const PASTE = `<details class="tf-paste"><summary>📥 Mám odkaz z jiného zařízení</summary>
      <div class="row"><input class="input" id="tfIn" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="Vlož odkaz s #sync=…" aria-label="Odkaz na přenos z jiného zařízení"><button type="button" class="btn" id="tfLoad">Načíst</button></div>
      <p class="faint">Hodí se pro ATLAS na ploše iPhonu: odkaz z fotoaparátu se otevře v Safari, které má svoje úložiště – zkopíruj ho a vlož sem.</p></details>`;
  function wirePaste() {
    const go = () => {
      const p = payloadOf($('#tfIn').value);
      if (!p) { toast('Tohle není odkaz na přenos – musí obsahovat #sync=', 'err'); return; }
      receive(p);
    };
    $('#tfLoad').onclick = go;
    $('#tfIn').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); go(); } };
  }

  let token = 0;
  function open() {
    // odškrtnutí „Před cestou“ (PreTrip.exportDone) a cesty z průvodce: moduly se stahují až po startu (lazy.js)
    if (window.Lazy && !Lazy.has('trip')) return Lazy.run('trip', open);
    const c = Backup.countsNow();
    if (Backup.isEmpty(c)) {
      modalOpen(`<div class="modal-body tf-modal">
        <h3>📲 Přenést do jiného zařízení</h3>
        <p class="muted tf-lead">V tomhle zařízení zatím nic uloženého není. Data sem přeneseš z druhého: otevři tam ATLAS → <b>⋯ Další</b> (na počítači vlevo dole) → <b>📲 Přenést do jiného zařízení</b> a QR kód naskenuj fotoaparátem tohohle telefonu – nebo si odtamtud pošli odkaz.</p>
        ${PASTE}</div>`);
      $('details.tf-paste').open = true;
      wirePaste();
      return;
    }
    const json = Backup.snapshot(), my = ++token, send = native() ? '📤 Poslat odkaz' : '🔗 Kopírovat odkaz';
    modalOpen(`<div class="modal-body tf-modal">
      <h3>📲 Přenést do jiného zařízení</h3>
      <p class="muted tf-lead" id="tfLead">Naskenuj QR kód fotoaparátem druhého telefonu – ATLAS se tam otevře, ukáže, co přibude, a nabídne <b>Sloučit</b> nebo <b>Nahradit</b>. Bez účtu, data jdou jen v odkazu (na server ne).</p>
      <div class="tf-qr-box" id="tfBox"><div class="faint tf-wait">Připravuji QR kód…</div></div>
      <p class="tf-sum"><b>Přenese se:</b> ${h(Backup.countsTxt(c))}</p>
      <div class="bk-actions"><button type="button" class="btn primary" id="tfSend">${send}</button><button type="button" class="btn" id="tfFile">💾 Soubor zálohy</button></div>
      <p class="faint tf-note">Odkaz nese tvoje cesty i kódy rezervací – posílej ho jen sobě. Je to stav z této chvíle: co pak změníš, přeneseš novým odkazem.</p>
      ${PASTE}</div>`);
    // připravený odkaz (komprese je asynchronní) – klepnutí na Kopírovat pak zapíše do schránky hned (Safari)
    const e = ShareLink.prepare(KIND, json);
    $('#tfSend').onclick = () => ShareLink.send(KIND, json, { title: 'ATLAS – moje data', text: '📲 Moje data z ATLASu – otevři na druhém zařízení:' })
      .then(r => (r.shared || r.aborted ? null : r.copied ? toast('Odkaz zkopírován – otevři ho na druhém zařízení (e-mail nebo chat sám sobě)') : prompt('Zkopíruj odkaz a otevři ho na druhém zařízení:', r.url)));
    $('#tfFile').onclick = () => Backup.open();
    wirePaste();
    Promise.resolve(e.url || e.done).then(url => {
      const box = $('#tfBox');
      if (my !== token || !box) return; // okno mezitím zavřené nebo otevřené znovu
      const f = fit(url), lead = $('#tfLead');
      // bez QR kódu: úvod o odkazu (ne „naskenuj“)
      if ((!f.link || !f.qr) && lead) lead.innerHTML = `${f.link ? 'Pošli si odkaz do druhého zařízení a otevři ho tam' : 'Přenes data souborem zálohy'} – ATLAS ukáže, co přibude, a nabídne <b>Sloučit</b> nebo <b>Nahradit</b>. Bez účtu, nic se neukládá na server.`;
      if (!f.link) {
        box.innerHTML = '<div class="note warn">⚠️ <div>Dat je i na odkaz moc – přenes je <b>souborem zálohy</b>.</div></div>';
        $('#tfSend').hidden = true;
        $('#tfFile').classList.add('primary');
        return;
      }
      if (!f.qr) {
        box.innerHTML = `<div class="note info">📏 <div>Dat je na QR kód moc (odkaz má ${f.bytes.toLocaleString('cs-CZ')} znaků, QR kód pojme nejvýš 2 953). Pošli si odkaz – AirDropem, Quick Share, e-mailem nebo do chatu sám sobě – nebo soubor zálohy.</div></div>`;
        return;
      }
      box.innerHTML = `<button type="button" class="tf-qr" id="tfQr" aria-label="QR kód s odkazem na přenos – klepnutím zvětšíš">${QR.svg(f.qr, { label: 'QR kód s odkazem na přenos dat' })}</button>
        <div class="faint tf-tip">Klepnutím ho zvětšíš přes celou obrazovku${f.qr.version > 25 ? ' – kód je hustý, fotoaparát drž blízko a rovně' : ''}</div>`;
      const btn = $('#tfQr'), svg = btn.querySelector('svg');
      svg.style.width = svg.style.height = `${sizePx(Math.min(box.clientWidth || QR_MAX, QR_MAX), f.qr.size + 8, window.devicePixelRatio || 1)}px`;
      btn.onclick = () => zoom(f.qr);
    }, () => { const box = $('#tfBox'); if (my === token && box) box.innerHTML = '<div class="note warn">⚠️ <div>Odkaz se nepodařilo připravit – přenes data souborem zálohy.</div></div>'; });
  }

  /** Položka v ⋯ Další (app.js openMore). */
  function addToMenu(list) {
    list.insertAdjacentHTML('beforeend', '<button type="button" class="btn ghost" id="moreXfer">📲 Přenést do jiného zařízení <span class="faint">QR kód</span></button>');
    list.querySelector('#moreXfer').onclick = () => open();
  }
  // Počítač a tablet nemají ⋯ Další: odkaz v postranním panelu pod přepínačem motivu (vzhled .side-about jako
  // ℹ️ O aplikaci). Na telefonu je panel skrytý. V node testu (vm) DOM není.
  if (typeof document !== 'undefined') {
    const toggle = document.querySelector('#themeToggle');
    if (toggle && !document.querySelector('#sideXfer')) {
      toggle.insertAdjacentHTML('afterend', '<button type="button" class="theme-toggle side-about" id="sideXfer">📲 Přenést do jiného zařízení</button>');
      document.querySelector('#sideXfer').onclick = () => open();
    }
  }

  window.Transfer = { KIND, MAX_LINK, payloadOf, fit, sizePx, read, receive, fromHash, open, addToMenu, zoom };
})();
