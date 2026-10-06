/* ATLAS – vlak nebo bus místo letadla: společné UI pro výsledky letů (čip, srovnání, spoje) a průvodce cestou.
   Data z /api/ground: odhad času a ceny (vždy jen odhad), srovnání s letadlem, odkazy (RegioJet, FlixBus, IDOS,
   Google Mapy) a – až na vyžádání a jen ze serveru – živé spoje RegioJetu. FlixBus je jen odkaz (jeho podmínky
   automatické využití dat nepovolují). Čistá logika nahoře jde testovat v node (test/ground-ui.test.js). */
(function () {
  const kc = n => Math.round(n).toLocaleString('cs-CZ') + ' Kč';
  /** „4 h 20“, „45 min“, „12 h“ */
  const hm = m => { m = Math.round(+m || 0); const h = Math.floor(m / 60); return h ? `${h} h${m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''}` : `${m} min`; };
  const KIND = { TRAIN: 'vlak', BUS: 'bus' };
  const kindsTxt = k => (k || []).map(x => KIND[x]).filter(Boolean).join(' + ') || 'vlak / bus';
  const kindIco = k => (k || []).includes('TRAIN') ? '🚆' : (k || []).includes('BUS') ? '🚌' : '🚆';
  const hhmm = s => (typeof s === 'string' && s.length >= 16 ? s.slice(11, 16) : '');
  const days = (a, b) => Math.round((Date.parse(b.slice(0, 10) + 'T12:00:00Z') - Date.parse(a.slice(0, 10) + 'T12:00:00Z')) / 864e5);
  const dm = d => `${+d.slice(8, 10)}. ${+d.slice(5, 7)}.`;

  /** Text čipu u výsledku letu (odhad): „🚆 i vlakem/busem ~4 h 20 · od ~299 Kč“ */
  const chipText = g => `🚆 i vlakem/busem ~${hm(g.min)} · od ~${kc(g.czk)}`;
  /** Původ odhadu: změřené spoje z Prahy, nebo model podle vzdálenosti. */
  const basisTxt = b => b === 'measured' ? 'odhad podle skutečných spojů z 13. 10.' : 'odhad podle vzdálenosti';

  /** Spoj RegioJetu (z /api/ground live.items) → úsek cesty po zemi pro průvodce cestou. */
  function legFromLive(x, date) {
    return {
      source: 'regiojet', id: String(x.id || ''), date: (x.dep || date || '').slice(0, 10), dep: x.dep || null, arr: x.arr || null,
      min: x.min || null, czk: x.priceFrom || 0, kinds: (x.kinds || []).slice(0, 2), transfers: x.transfers || 0,
      fromStation: x.fromStation || '', toStation: x.toStation || '',
    };
  }
  /** Odhad (bez konkrétního spoje) → úsek cesty: jen den, čas ověří uživatel přes odkaz. */
  function legFromEst(date, est) {
    return { source: 'estimate', id: '', date, dep: null, arr: null, min: est ? est.minutes : null, czk: est ? est.czk : 0, kinds: [], transfers: null, fromStation: '', toStation: '' };
  }
  /** Cena cesty po zemi za všechny cestující (tam + zpět). */
  const tripCzk = (ov, adults) => Math.round(((ov.out ? ov.out.czk || 0 : 0) + (ov.back ? ov.back.czk || 0 : 0)) * (adults || 1));
  /** Popis úseku: „út 13. 10. 06:01 → 10:21 · 4 h 20 · vlak, přímý“ / „út 13. 10. · ~4 h 20 (odhad)“ */
  function legTxt(l) {
    if (!l) return '';
    if (!l.dep) return `${dm(l.date)} · ~${hm(l.min)} (odhad, čas ověř v odkazu)`;
    const plus = l.arr && days(l.dep, l.arr) > 0 ? ` +${days(l.dep, l.arr)}` : '';
    return `${dm(l.date)} ${hhmm(l.dep)} → ${hhmm(l.arr)}${plus} · ${hm(l.min)} · ${kindsTxt(l.kinds)}, ${l.transfers ? `${l.transfers}× přestup` : 'přímý'}`;
  }

  /* ---------- HTML (globální esc, safeUrl, czk z app.js) ---------- */
  const LINK_TAG = { regiojet: 'koupíš tam', flixbus: 'jen odkaz', idos: 'jen odkaz', google: 'jen odkaz' };
  function linksHtml(links) {
    if (!links || !links.length) return '';
    return `<div class="gnd-links">${links.map(l => `<a class="gnd-link" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener" title="${esc(l.note || '')}"><b>${esc(l.name)}</b><small>${esc(LINK_TAG[l.id] || 'odkaz')}</small> ↗</a>`).join('')}</div>`;
  }

  /** Řádek spoje; sel = { name, checked } → přepínač pro výběr (průvodce cestou). */
  function connRow(x, sel) {
    const plus = x.arr && x.dep && days(x.dep, x.arr) > 0 ? `<small>+${days(x.dep, x.arr)}</small>` : '';
    const st = [x.fromStation, x.toStation].every(Boolean) ? ` · ${esc(x.fromStation)} → ${esc(x.toStation)}` : '';
    const price = x.bookable ? `<b>${czk(x.priceFrom)}</b>${x.priceTo && x.priceTo > x.priceFrom ? `<small>až ${czk(x.priceTo)}</small>` : ''}` : '<small>vyprodáno</small>';
    const inner = `<span class="gc-t">${kindIco(x.kinds)} <b>${esc(hhmm(x.dep))}</b> → <b>${esc(hhmm(x.arr))}</b>${plus}</span>
      <span class="gc-x">${esc(hm(x.min))} · ${esc(x.transfers ? `${x.transfers}× přestup` : 'přímý')} · ${esc(kindsTxt(x.kinds))}${st}${x.bookable && x.seats != null && x.seats < 20 ? ` · <span class="warn">${+x.seats} míst</span>` : ''}</span>
      <span class="gc-p">${price}</span>`;
    if (!sel) return `<div class="gc-row${x.bookable ? '' : ' off'}">${inner}</div>`;
    return `<label class="gc-row sel${x.bookable ? '' : ' off'}"><input type="radio" name="${esc(sel.name)}" value="${esc(x.id)}" ${sel.checked ? 'checked' : ''} ${x.bookable ? '' : 'disabled'}>${inner}</label>`;
  }

  /** Odhad jako řádek (i k výběru: „ponechat odhad“). */
  function estRow(est, sel) {
    if (!est) return '';
    const inner = `<span class="gc-t">🚆 <b>~${esc(hm(est.minutes))}</b></span><span class="gc-x">${esc(basisTxt(est.basis))} · konkrétní spoj vyber přes odkaz</span><span class="gc-p"><b>od ~${czk(est.czk)}</b><small>odhad</small></span>`;
    if (!sel) return `<div class="gc-row est">${inner}</div>`;
    return `<label class="gc-row sel est"><input type="radio" name="${esc(sel.name)}" value="" ${sel.checked ? 'checked' : ''}>${inner}</label>`;
  }

  /** Stav živých spojů: seznam (RegioJet – živé ceny), nebo vysvětlení, proč platí odhad. */
  function liveHtml(j, { sel = null, picked = null, max = 12 } = {}) {
    const live = j.live;
    const rjLink = (j.links || []).find(l => l.id === 'regiojet');
    let html = '';
    if (live && live.ok) {
      const items = live.items || [];
      html += `<div class="gc-head"><span class="b good">RegioJet – živé ceny${live.demo ? ' (DEMO)' : ''}</span><span class="faint">${items.length ? `${live.count} ${live.count === 1 ? 'spoj' : live.count >= 2 && live.count <= 4 ? 'spoje' : 'spojů'} ke koupi · cena na osobu, jedním směrem` : 'tento den RegioJet nejede'}</span>${rjLink ? `<a class="btn sm ghost" href="${esc(safeUrl(rjLink.url))}" target="_blank" rel="noopener">Koupit na RegioJet ↗</a>` : ''}</div>`;
      if (live.demo) html += '<div class="faint gc-demo">⚠️ DEMO režim – spoje i ceny jsou vymyšlené.</div>';
      html += `<div class="gc-list">${items.slice(0, max).map(x => connRow(x, sel && { name: sel, checked: picked === x.id })).join('')}${sel ? estRow(j.est, { name: sel, checked: !picked }) : ''}</div>`;
      if (items.length > max) html += `<div class="faint gc-more">a dalších ${items.length - max} spojů na webu RegioJetu</div>`;
    } else {
      const why = live ? live.error : 'Živé spoje se načtou po výběru data.';
      html += `<div class="gc-head"><span class="b">odhad</span><span class="faint">${esc(why || '')}</span></div><div class="gc-list">${estRow(j.est, sel && { name: sel, checked: true })}</div>`;
    }
    return html;
  }

  /** GET api/ground → JSON (chyba = výjimka s českou zprávou ze serveru). */
  async function load(params, signal) {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)]));
    const r = await fetch('api/ground?' + qs, { signal });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  }

  /**
   * Panel se spoji pro výsledky letů: datum (lze změnit), spoje tam (RegioJet živě / odhad), na vyžádání spoje zpět
   * a odkazy. opts = { q: { from, to }, date, back (datum zpět nebo null), adults, flight: { czk, trips, min } }.
   */
  function panel(host, opts) {
    if (!host) return;
    const seq = { out: 0, back: 0 };
    const today = new Date().toISOString().slice(0, 10);
    const dirHtml = (which, date) => `<div class="gp-dir" data-gdir="${which}"><div class="gp-dh"><b>${which === 'out' ? 'Tam' : 'Zpět'}</b>
      <input type="date" class="input gp-date" value="${esc(date || '')}" min="${today}" aria-label="Datum ${which === 'out' ? 'tam' : 'zpět'}"></div><div class="gp-body"><div class="loading-row"><span class="spin dark"></span> Hledám spoje…</div></div></div>`;
    host.innerHTML = `<div class="gnd-panel">${dirHtml('out', opts.date)}${opts.back ? `<div class="gp-backbtn"><button type="button" class="btn sm" data-gback>↩ Ukázat i spoje zpět (${esc(dm(opts.back))})</button></div>` : ''}<div class="gp-links"></div>
      <div class="faint gp-note">Odhad = přibližná doba a nejnižší cena; RegioJet ukazuje skutečné spoje a ceny (načtené na tvůj pokyn), FlixBus, IDOS a Google Mapy jsou jen odkazy – ceny tam ověř.</div></div>`;
    const fill = async (which, date) => {
      const box = host.querySelector(`[data-gdir="${which}"] .gp-body`);
      if (!box) return;
      const my = ++seq[which];
      box.innerHTML = '<div class="loading-row"><span class="spin dark"></span> Hledám spoje…</div>';
      const q = which === 'out' ? opts.q : { from: opts.q.to, to: opts.q.from };
      try {
        const j = await load({ from: q.from, to: q.to, date, adults: opts.adults, flightCzk: opts.flight && opts.flight.czk, trips: opts.flight && opts.flight.trips, flightMin: opts.flight && opts.flight.min });
        if (!box.isConnected || my !== seq[which]) return;
        if (!j.est) { box.innerHTML = `<div class="note info">ℹ️ <div>${esc(j.why || 'Sem vlak ani bus nedává smysl.')}</div></div>`; return; }
        box.innerHTML = liveHtml(j);
        if (which === 'out') host.querySelector('.gp-links').innerHTML = linksHtml(j.links);
      } catch (e) {
        if (box.isConnected && my === seq[which]) box.innerHTML = `<div class="note warn">⚠️ <div>${esc(e.message)}</div></div>`;
      }
    };
    host.querySelectorAll('.gp-date').forEach(inp => inp.onchange = () => { const w = inp.closest('[data-gdir]').dataset.gdir; if (inp.value) fill(w, inp.value); });
    const bb = host.querySelector('[data-gback]');
    if (bb) bb.onclick = () => {
      bb.parentElement.outerHTML = dirHtml('back', opts.back);
      const inp = host.querySelector('[data-gdir="back"] .gp-date');
      inp.onchange = () => { if (inp.value) fill('back', inp.value); };
      fill('back', opts.back);
    };
    fill('out', opts.date);
  }

  window.Ground = { hm, kindsTxt, chipText, basisTxt, legFromLive, legFromEst, tripCzk, legTxt, linksHtml, connRow, estRow, liveHtml, load, panel };
})();
