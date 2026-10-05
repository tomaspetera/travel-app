/* ATLAS – vyhledávač letenek (UI). Data z /api/search (server prohledává Ryanair, Wizz Air, Kiwi.com, Travelpayouts). */
(function () {
  const DOW = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
  const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];
  const PRESETS = {
    weekend: { nMin: 1, nMax: 3, out: [4, 5, 6], back: [0, 1] },
    long: { nMin: 3, nMax: 5, out: [3, 4, 5], back: [0, 1, 2] },
    week: { nMin: 5, nMax: 9, out: [], back: [] },
    '2weeks': { nMin: 11, nMax: 16, out: [], back: [] },
  };
  const MNS_IN = ['lednu', 'únoru', 'březnu', 'dubnu', 'květnu', 'červnu', 'červenci', 'srpnu', 'září', 'říjnu', 'listopadu', 'prosinci'];
  const EXOTIC = ['TH', 'ID', 'VN', 'AE', 'LK', 'MV', 'JP', 'MX', 'DO', 'CU', 'KE', 'TZ', 'OM', 'JO'];
  const PROV = {}; // id → {name,color,kind,note}
  let health = null;
  let lastResult = null;
  let lastPayload = null;
  let view = { mode: 'list', sort: 'total', maxPrice: null, onlyDeals: false, excludeOrigins: new Set(), carriers: new Set(), outDate: null, expanded: new Set() };
  let searchCtl = null;
  let fromInput, toInput, heroFrom, heroTo;
  let originPreview = [];

  /* ---------- utility ---------- */
  const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00'); d.setDate(d.getDate() + n); return fmtYMD(d); };
  const today = () => fmtYMD(new Date());
  const dayLabel = s => { const d = new Date(s.slice(0, 10) + 'T12:00:00'); return `${DOW[d.getDay()].toLowerCase()} ${d.getDate()}. ${d.getMonth() + 1}.`; };
  const timeOf = l => l.hasTime ? l.dep.slice(11, 16) : '';
  const arrTime = l => l.arr && l.hasTime ? (l.arrEst ? '~' : '') + l.arr.slice(11, 16) : '';
  const dur = m => m ? `${Math.floor(m / 60)} h ${pad(m % 60)} min` : '';
  const hm = m => m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}` : `${m} min`;
  const yymmdd = s => s.slice(2, 10).replace(/-/g, '');
  const nightsTxt = n => n === 1 ? '1 noc' : n >= 2 && n <= 4 ? `${n} noci` : `${n} nocí`;
  const plural = (n, one, few, many) => `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
  const provName = id => PROV[id]?.name || id;
  const provColor = id => PROV[id]?.color || '#64748b';
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  async function api(path) {
    const r = await fetch(path);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
    return r.json();
  }

  /** POST /api/search se streamem průběhu (NDJSON). */
  async function runSearch(payload, { onProgress, signal } = {}) {
    const r = await fetch('api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal });
    if (!r.ok || !r.body) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '', result = null, error = null;
    for (; ;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line) continue;
        const ev = JSON.parse(line);
        if (ev.type === 'progress' && onProgress) onProgress(ev);
        else if (ev.type === 'result') result = ev.result;
        else if (ev.type === 'error') error = ev.error;
      }
    }
    if (error) throw new Error(error);
    if (!result) throw new Error('Server neposlal výsledek');
    return result;
  }

  /* ---------- PlaceInput: čipy + našeptávač ---------- */
  class PlaceInput {
    constructor(el, { placeholder, max = 5, onChange, dark = false, allowAnywhere = false, origin = false }) {
      this.el = el; this.items = []; this.max = max; this.onChange = onChange || (() => { }); this.allowAnywhere = allowAnywhere;
      this.origin = origin; // odkud: světadíl nedává smysl
      el.classList.add('pi'); if (dark) el.classList.add('pi-dark');
      el.innerHTML = `<div class="pi-chips"></div><input class="pi-input" placeholder="${esc(placeholder || '')}" autocomplete="off" spellcheck="false"><div class="pi-dd" hidden></div>`;
      this.chipsEl = $('.pi-chips', el); this.input = $('.pi-input', el); this.dd = $('.pi-dd', el);
      this.active = -1; this.sugs = []; this.ctl = null; this.ph = placeholder;
      const load = debounce(() => this.fetch(), 160);
      this.input.addEventListener('input', () => { if (this.input.value.trim().length >= 2) load(); else this.close(); });
      this.input.addEventListener('focus', () => { if (this.input.value.trim().length >= 2) load(); });
      this.input.addEventListener('keydown', e => this.key(e));
      this.input.addEventListener('blur', () => setTimeout(() => this.close(), 150));
      el.addEventListener('click', e => { if (e.target === el || e.target === this.chipsEl) this.input.focus(); });
      this.render();
    }
    async fetch() {
      const q = this.input.value.trim();
      if (this.ctl) this.ctl.abort();
      this.ctl = new AbortController();
      try {
        const r = await fetch('api/places?q=' + enc(q), { signal: this.ctl.signal });
        const j = await r.json();
        if (q !== this.input.value.trim()) return;
        this.sugs = (j.items || []).filter(s => !this.origin || s.type !== 'continent'); this.active = this.sugs.length ? 0 : -1; this.open();
      } catch (e) { if (e.name !== 'AbortError') { this.sugs = []; this.open(true); } }
    }
    open(err) {
      const typeLbl = { airport: 'letiště', metro: 'město', country: 'země', region: 'oblast', place: 'místo', continent: 'světadíl' };
      this.dd.innerHTML = this.sugs.length ? this.sugs.map((s, i) => `<div class="pi-opt ${i === this.active ? 'on' : ''}" data-i="${i}"><span class="pi-flag">${s.flag || '📍'}</span><span class="pi-t"><b>${esc(s.label)}</b><small>${esc(s.sub || '')}</small></span><span class="pi-type">${typeLbl[s.type] || ''}</span></div>`).join('')
        : `<div class="pi-empty">${err ? 'Našeptávač je nedostupný' : 'Nic nenalezeno – zkus jiný název nebo kód letiště'}</div>`;
      this.dd.hidden = false;
      $$('.pi-opt', this.dd).forEach(o => o.onmousedown = e => { e.preventDefault(); this.pick(this.sugs[+o.dataset.i]); });
    }
    close() { this.dd.hidden = true; }
    key(e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (this.dd.hidden || !this.sugs.length) return;
        e.preventDefault(); this.active = (this.active + (e.key === 'ArrowDown' ? 1 : -1) + this.sugs.length) % this.sugs.length; this.open();
      } else if (e.key === 'Enter') {
        if (!this.dd.hidden && this.sugs[this.active]) { e.preventDefault(); this.pick(this.sugs[this.active]); }
      } else if (e.key === 'Escape') this.close();
      else if (e.key === 'Backspace' && !this.input.value && this.items.length) { this.items.pop(); this.render(); this.onChange(this.items); }
    }
    pick(s) {
      if (!s) return;
      const item = { id: s.id, label: s.label, flag: s.flag || '📍', type: s.type };
      if (!this.items.some(x => x.id === item.id)) { if (this.items.length >= this.max) this.items.shift(); this.items.push(item); }
      this.input.value = ''; this.close(); this.render(); this.onChange(this.items);
    }
    set(items, silent) { this.items = (items || []).slice(0, this.max); this.render(); if (!silent) this.onChange(this.items); }
    add(item) { this.pick(item); }
    render() {
      this.chipsEl.innerHTML = this.items.map((x, i) => `<span class="pi-chip"><span>${x.flag || ''}</span>${esc(x.label)}<button type="button" data-x="${i}" aria-label="Odebrat">×</button></span>`).join('');
      $$('[data-x]', this.chipsEl).forEach(b => b.onclick = e => { e.stopPropagation(); this.items.splice(+b.dataset.x, 1); this.render(); this.onChange(this.items); });
      this.input.placeholder = this.items.length ? 'přidat další…' : this.ph;
    }
  }

  /* ---------- formulář ---------- */
  function defaultForm() {
    return {
      from: S.home?.from || [], to: [], radius: S.home?.radius ?? 200, trip: 'return', len: 'week', nMin: 5, nMax: 9,
      dFrom: addDays(today(), 7), dTo: addDays(today(), 60), adults: 2, maxPrice: '', ground: true, kmRate: 1.1,
      openJaw: true, directOnly: false, outDays: [], backDays: [], exclude: [], minTemp: 0, bags: 'none',
      dateMode: 'flex', xOut: addDays(today(), 14), xBack: addDays(today(), 21), xFlex: 0,
    };
  }
  function getForm() {
    return {
      from: fromInput.items, to: toInput.items, radius: +$('#radius').value,
      trip: $('#tripType .on').dataset.v, len: $('#lenPreset .on')?.dataset.v || 'custom',
      nMin: +$('#nMin').value, nMax: +$('#nMax').value, dFrom: $('#dFrom').value, dTo: $('#dTo').value,
      adults: +$('#adults').value, maxPrice: $('#maxPrice').value, ground: $('#groundOn').checked, kmRate: +$('#kmRate').value,
      openJaw: $('#openJaw').checked, directOnly: $('#directOnly').checked,
      outDays: $$('#outDays .on').map(b => +b.dataset.d), backDays: $$('#backDays .on').map(b => +b.dataset.d),
      exclude: originPreview.filter(a => a.off).map(a => a.iata), minTemp: +($('#minTemp .on')?.dataset.t || 0),
      bags: $('#bags .on')?.dataset.b || 'none',
      dateMode: $('#dateMode .on').dataset.v, xOut: $('#xOut').value, xBack: $('#xBack').value, xFlex: +($('#xFlex .on')?.dataset.f || 0),
    };
  }
  function setForm(f) {
    f = { ...defaultForm(), ...f };
    if (f.dFrom < today()) { const span = Math.max(14, (new Date(f.dTo) - new Date(f.dFrom)) / 864e5 | 0); f.dFrom = addDays(today(), 3); f.dTo = addDays(f.dFrom, span); }
    if (!f.xOut || f.xOut < today()) { const n = f.xOut && f.xBack ? Math.max(0, (new Date(f.xBack) - new Date(f.xOut)) / 864e5 | 0) : 7; f.xOut = addDays(today(), 14); f.xBack = addDays(f.xOut, n); }
    $$('#dateMode button').forEach(b => b.classList.toggle('on', b.dataset.v === f.dateMode));
    $('#xOut').value = f.xOut; $('#xBack').value = f.xBack || addDays(f.xOut, 7);
    $$('#xFlex button').forEach(b => b.classList.toggle('on', +b.dataset.f === (f.xFlex || 0)));
    fromInput.set(f.from, true); toInput.set(f.to, true);
    $('#radius').value = f.radius; $('#radiusVal').textContent = f.radius + ' km';
    $$('#tripType button').forEach(b => b.classList.toggle('on', b.dataset.v === f.trip));
    $$('#lenPreset button').forEach(b => b.classList.toggle('on', b.dataset.v === f.len));
    $('#nMin').value = f.nMin; $('#nMax').value = f.nMax; $('#dFrom').value = f.dFrom; $('#dTo').value = f.dTo;
    $('#adults').value = String(f.adults); $('#maxPrice').value = f.maxPrice || ''; $('#groundOn').checked = f.ground; $('#kmRate').value = f.kmRate;
    $('#openJaw').checked = f.openJaw; $('#directOnly').checked = f.directOnly;
    setMinTemp(f.minTemp);
    setBags(f.bags);
    $$('#outDays button').forEach(b => b.classList.toggle('on', f.outDays.includes(+b.dataset.d)));
    $$('#backDays button').forEach(b => b.classList.toggle('on', f.backDays.includes(+b.dataset.d)));
    originPreview = []; pendingExclude = new Set(f.exclude || []);
    syncFormUI(); refreshOrigins();
  }
  let pendingExclude = new Set();
  // Za teplem: 0 = kdekoliv, jinak 20 / 25 / 30 °C (starší uložená hledání pole nemají).
  function setMinTemp(t) { $$('#minTemp button').forEach(b => b.classList.toggle('on', +b.dataset.t === (+t || 0))); }
  // Zavazadla: none = jen malé pod sedadlo (starší uložená hledání a hlídané ceny pole nemají).
  const BAG_LBL = { cabin: 'kabinový kufr', checked: 'kufr k odbavení' };
  function setBags(b) { $$('#bags button').forEach(x => x.classList.toggle('on', x.dataset.b === (BAG_LBL[b] ? b : 'none'))); }
  function payloadOf(f) {
    const exact = f.dateMode === 'exact';
    return {
      from: f.from.map(x => x.id), to: f.to.map(x => x.id), radiusKm: f.radius,
      dateFrom: f.dFrom, dateTo: f.dTo, trip: f.trip, nightsMin: f.nMin, nightsMax: f.nMax,
      outDays: exact ? [] : f.outDays, backDays: exact ? [] : f.backDays, adults: f.adults, maxPrice: f.maxPrice ? +f.maxPrice : null,
      directOnly: f.directOnly, kmRate: f.ground ? f.kmRate : 0, openJaw: f.openJaw, exclude: f.exclude,
      ...(f.minTemp ? { minTemp: +f.minTemp } : {}),
      ...(BAG_LBL[f.bags] ? { bags: f.bags } : {}),
      // Přesná data: server hledá jen odlet xOut a návrat xBack (± xFlex dní).
      ...(exact ? { exactOut: f.xOut, exactBack: f.trip === 'return' ? f.xBack : null, flexDays: f.xFlex || 0 } : {}),
    };
  }
  function syncFormUI() {
    const ret = $('#tripType .on').dataset.v === 'return';
    const exact = $('#dateMode .on').dataset.v === 'exact';
    $('#lenField').style.display = ret && !exact ? '' : 'none';
    $('#flexField').style.display = exact ? 'none' : '';
    $('#exactField').hidden = !exact;
    $('#xBackWrap').style.display = ret ? '' : 'none';
    $('#xBackLbl').style.display = ret ? '' : 'none';
    // Dny v týdnu při přesných datech nedávají smysl.
    $('#backDaysField').style.display = ret && !exact ? '' : 'none';
    $('#outDays').closest('.field').style.display = exact ? 'none' : '';
    if (exact) {
      const out = $('#xOut').value, back = $('#xBack').value, fl = +($('#xFlex .on')?.dataset.f || 0);
      const n = out && back ? Math.round((new Date(back) - new Date(out)) / 864e5) : null;
      $('#xInfo').textContent = !out ? 'Vyber datum odletu.'
        : ret && (!back || n < 0) ? '⚠️ Návrat musí být stejný den nebo po odletu.'
        : ret ? `${fmtDate(out)} → ${fmtDate(back)} · ${n === 0 ? 'týž den' : n === 1 ? '1 noc' : n <= 4 ? n + ' noci' : n + ' nocí'}${fl ? ` · každé datum ± ${fl} ${fl === 1 ? 'den' : 'dny'}` : ' · jen tyto dva dny'}`
        : `odlet ${fmtDate(out)}${fl ? ` ± ${fl} ${fl === 1 ? 'den' : 'dny'}` : ' · jen tento den'}`;
    }
    const f = getForm();
    const bits = [];
    if (f.adults !== 1) bits.push(`${f.adults} os.`);
    if (f.maxPrice) bits.push(`do ${czk(+f.maxPrice)}`);
    if (!f.ground) bits.push('bez dopravy');
    if (f.directOnly) bits.push('jen přímé');
    if (BAG_LBL[f.bags]) bits.push('🧳 ' + BAG_LBL[f.bags]);
    if (f.outDays.length) bits.push('odlet ' + f.outDays.map(d => DOW[d]).join(','));
    $('#moreSummary').textContent = bits.length ? '· ' + bits.join(' · ') : '';
    $('#quickDest').querySelectorAll('[data-any]').forEach(b => b.classList.toggle('on', !toInput.items.length));
  }
  function applyPreset(k) {
    const p = PRESETS[k];
    $$('#lenPreset button').forEach(b => b.classList.toggle('on', b.dataset.v === k));
    if (p) {
      $('#nMin').value = p.nMin; $('#nMax').value = p.nMax;
      $$('#outDays button').forEach(b => b.classList.toggle('on', p.out.includes(+b.dataset.d)));
      $$('#backDays button').forEach(b => b.classList.toggle('on', p.back.includes(+b.dataset.d)));
    }
    syncFormUI();
  }

  const refreshOrigins = debounce(async () => {
    const f = getForm();
    const host = $('#originPills');
    if (!f.from.length) { originPreview = []; host.innerHTML = '<span class="faint">Zadej, odkud letíš – třeba „Brno“, „Vídeň“, „Česko“ nebo použij 📍 polohu.</span>'; return; }
    try {
      const qs = f.from.map(x => 'from=' + enc(x.id)).join('&') + `&radius=${f.radius}&kmRate=${f.ground ? f.kmRate : 0}`;
      const j = await api('api/origins?' + qs);
      const prevOff = new Set([...originPreview.filter(a => a.off).map(a => a.iata), ...pendingExclude]);
      pendingExclude = new Set();
      originPreview = j.airports.map(a => ({ ...a, off: prevOff.has(a.iata) }));
      const max = health?.maxOrigins || 8;
      host.innerHTML = originPreview.map((a, i) => `<button type="button" class="opill ${a.off ? 'off' : ''} ${i >= max ? 'over' : ''}" data-op="${a.iata}" title="${esc(a.name)}${a.ground ? ` · cesta ~${hm(a.ground.minutes)}, ~${czk(a.ground.czk)}` : ''}">
        <b>${a.iata}</b> ${esc(a.city)}${a.distKm ? ` <span>${a.distKm} km</span>` : ''}${a.ground && a.ground.czk ? ` <span class="g">~${czk(a.ground.czk)}</span>` : ''}</button>`).join('')
        + (originPreview.length > max ? `<span class="faint" style="font-size:12px">prohledá se ${max} nejbližších</span>` : '');
      $$('[data-op]', host).forEach(b => b.onclick = () => { const a = originPreview.find(x => x.iata === b.dataset.op); a.off = !a.off; b.classList.toggle('off', a.off); });
    } catch (e) { host.innerHTML = `<span class="faint">Náhled letišť nedostupný (${esc(e.message)})</span>`; }
  }, 200);

  function buildForm() {
    fromInput = new PlaceInput($('#fromInput'), { origin: true, placeholder: 'Např. Brno, Vídeň, Česko, Jihlava…', onChange: () => { refreshOrigins(); updateHomeChip(); } });
    toInput = new PlaceInput($('#toInput'), { placeholder: 'Kamkoliv 🌍 – nebo napiš zemi, město, ostrov, světadíl…', onChange: syncFormUI });
    $('#outDays').innerHTML = DOW_ORDER.map(d => `<button type="button" data-d="${d}">${DOW[d]}</button>`).join('');
    $('#backDays').innerHTML = DOW_ORDER.map(d => `<button type="button" data-d="${d}">${DOW[d]}</button>`).join('');
    $$('#outDays button, #backDays button').forEach(b => b.onclick = () => { b.classList.toggle('on'); $$('#lenPreset button').forEach(x => x.classList.toggle('on', x.dataset.v === 'custom')); syncFormUI(); });
    $$('#tripType button').forEach(b => b.onclick = () => { $$('#tripType button').forEach(x => x.classList.toggle('on', x === b)); syncFormUI(); });
    $$('#dateMode button').forEach(b => b.onclick = () => { $$('#dateMode button').forEach(x => x.classList.toggle('on', x === b)); syncFormUI(); });
    $$('#xFlex button').forEach(b => b.onclick = () => { $$('#xFlex button').forEach(x => x.classList.toggle('on', x === b)); syncFormUI(); });
    $$('#minTemp button').forEach(b => b.onclick = () => setMinTemp(b.dataset.t));
    $$('#bags button').forEach(b => b.onclick = () => { setBags(b.dataset.b); syncFormUI(); });
    $('#xOut').min = today(); $('#xBack').min = today();
    $('#xOut').onchange = () => {
      // Posun odletu posune i návrat (zachová počet nocí), ať návrat není před odletem.
      const prev = $('#xOut').dataset.prev, back = $('#xBack').value, out = $('#xOut').value;
      if (prev && back && out) { const n = Math.round((new Date(back) - new Date(prev)) / 864e5); if (n >= 0) $('#xBack').value = addDays(out, n); }
      $('#xOut').dataset.prev = out; syncFormUI();
    };
    $('#xOut').onfocus = () => { $('#xOut').dataset.prev = $('#xOut').value; };
    $('#xBack').onchange = syncFormUI;
    $$('#lenPreset button').forEach(b => b.onclick = () => applyPreset(b.dataset.v));
    ['#nMin', '#nMax'].forEach(s => $(s).oninput = () => { $$('#lenPreset button').forEach(x => x.classList.toggle('on', x.dataset.v === 'custom')); });
    $('#radius').oninput = () => { $('#radiusVal').textContent = $('#radius').value + ' km'; refreshOrigins(); updateHomeChip(); };
    ['#groundOn', '#kmRate'].forEach(s => $(s).onchange = () => { refreshOrigins(); syncFormUI(); });
    ['#adults', '#maxPrice', '#directOnly', '#openJaw'].forEach(s => $(s).onchange = syncFormUI);
    $$('#quickRange button').forEach(b => b.onclick = () => {
      if (b.dataset.m) {
        const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1);
        const e = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        $('#dFrom').value = fmtYMD(d); $('#dTo').value = fmtYMD(e);
      } else {
        const from = $('#dFrom').value && $('#dFrom').value >= today() ? $('#dFrom').value : addDays(today(), 3);
        $('#dFrom').value = from; $('#dTo').value = addDays(from, +b.dataset.d);
      }
    });
    // „Za teplem“ už není pevný seznam zemí – je to filtr podle podnebí pod tímto řádkem.
    $('#quickDest').innerHTML = [
      ['🌍 Kamkoliv', 'any'],
      ['🏙️ Evropa', 'eu'],
      ['🌏 Exotika', 'exotic'],
    ].map(q => `<button type="button" class="qd" data-qd="${q[1]}" ${q[1] === 'any' ? 'data-any="1"' : ''}>${q[0]}</button>`).join('');
    $$('#quickDest [data-qd]').forEach(b => b.onclick = () => {
      const k = b.dataset.qd;
      if (k === 'exotic') toInput.set(EXOTIC.slice(0, 5).map(cc => ({ id: 'cc:' + cc, label: byIso[cc]?.cs || cc, flag: flag(cc) })));
      else toInput.set([]);
      if (k === 'eu') toast('Evropa = kamkoliv; seřaď výsledky podle ceny 😉');
    });
    $('#geoBtn').onclick = () => useMyLocation(fromInput);
    $('#searchForm').onsubmit = e => { e.preventDefault(); startSearch(); };
    $('#watchBtn').onclick = () => addWatch();
  }

  function useMyLocation(input) {
    if (!navigator.geolocation) return toast('Prohlížeč nepodporuje polohu', 'err');
    toast('Zjišťuji polohu…');
    navigator.geolocation.getCurrentPosition(p => {
      const lat = p.coords.latitude.toFixed(4), lon = p.coords.longitude.toFixed(4);
      input.set([...input.items.filter(x => !x.id.startsWith('geo:')), { id: `geo:${lat},${lon}|Moje poloha`, label: 'Moje poloha', flag: '📍', type: 'place' }]);
    }, () => toast('Polohu se nepodařilo zjistit', 'err'), { timeout: 10000, maximumAge: 600000 });
  }

  /* ---------- domov (odkud obvykle létáš) ---------- */
  function updateHomeChip() {
    const f = fromInput ? fromInput.items : (S.home?.from || []);
    const r = $('#radius') ? +$('#radius').value : (S.home?.radius ?? 200);
    const chip = $('#homeChip');
    chip.innerHTML = f.length ? `📍 ${esc(f.map(x => x.label).join(', '))} <span>+${r} km</span>` : '📍 Nastav, odkud létáš';
    chip.onclick = () => { go('flights'); setTimeout(() => fromInput.input.focus(), 300); };
  }

  /* ---------- hledání ---------- */
  async function startSearch(opts = {}) {
    const f = getForm();
    if (!f.from.length) { toast('Zadej, odkud chceš letět', 'err'); fromInput.input.focus(); return; }
    if (f.dateMode !== 'exact' && f.dTo < f.dFrom) { toast('Konec rozsahu je před začátkem', 'err'); return; }
    if (f.dateMode === 'exact') {
      if (!f.xOut || f.xOut < today()) { toast('Zadej datum odletu (dnes nebo později)', 'err'); $('#xOut').focus(); return; }
      if (f.trip === 'return' && (!f.xBack || f.xBack < f.xOut)) { toast('Návrat musí být stejný den nebo po odletu', 'err'); $('#xBack').focus(); return; }
    }
    S.form = f; S.home = { from: f.from, radius: f.radius }; save(); updateHomeChip();
    const payload = payloadOf(f);
    lastPayload = payload;
    if (searchCtl) searchCtl.abort();
    searchCtl = new AbortController();
    view = { ...view, excludeOrigins: new Set(), carriers: new Set(), outDate: null, expanded: new Set(), maxPrice: null };
    $('#results').innerHTML = '';
    const btn = $('#doSearch'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Hledám…';
    renderProgress({ providers: [] }, true);
    if (!opts.noScroll) $('#progress').scrollIntoView({ behavior: 'smooth', block: 'start' });
    busySearches++;
    try {
      const res = await runSearch(payload, { onProgress: ev => renderProgress(ev), signal: searchCtl.signal });
      lastResult = res;
      renderProgress({ providers: res.providers }, false, res);
      renderResults();
      return res;
    } catch (e) {
      if (e.name === 'AbortError') return;
      $('#progress').innerHTML = `<div class="note bad">${ico('M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z')}<div>${esc(e.message)}</div></div>`;
    } finally {
      busySearches--;
      btn.disabled = false; btn.innerHTML = '🔎 Najít nejlevnější lety';
    }
  }

  function renderProgress(ev, starting, res) {
    const host = $('#progress');
    const rows = (ev.providers || []).map(p => {
      const pct = p.calls ? Math.round(p.done / p.calls * 100) : (p.state === 'done' ? 100 : 0);
      const st = { pending: 'čeká', running: 'hledám…', done: 'hotovo', partial: 'částečně', error: 'chyba' }[p.state] || p.state;
      return `<div class="prow ${p.state}"><span class="pdot" style="background:${provColor(p.id)}"></span><b>${esc(provName(p.id))}</b>
        <div class="pbar"><span style="width:${pct}%"></span></div>
        <span class="pnum">${p.calls ? `${p.done}/${p.calls}` : ''}</span>
        <span class="pst">${st}${p.found ? ` · ${p.found} nálezů` : ''}${p.ms && !starting && p.state !== 'running' ? ` · ${(p.ms / 1000).toFixed(1)} s` : ''}</span>
        ${p.note ? `<div class="pnote">${esc(p.note)}</div>` : ''}${p.error ? `<div class="pnote err">${esc(p.error)}</div>` : ''}</div>`;
    }).join('');
    const disabled = (health?.providers || []).filter(p => !p.enabled && p.hint && p.kind !== 'stays').map(p => `<div class="prow off"><span class="pdot" style="background:${p.color}"></span><b>${esc(p.name)}</b><span class="pst">vypnuto</span><div class="pnote">${esc(p.hint)}</div></div>`).join('');
    const head = res ? `Prohledáno ${res.origins.length} letišť za ${(res.stats.ms / 1000).toFixed(1)} s` : `<span class="spin"></span> Prohledávám letiště${originPreview.length ? ` (${originPreview.filter(a => !a.off).slice(0, health?.maxOrigins || 8).map(a => a.iata).join(', ')})` : ''}…`;
    host.innerHTML = `<div class="card progress-card ${res ? 'done' : ''}"><div class="ph">${head}</div>${rows}${res ? disabled : ''}</div>`;
  }

  /* ---------- výsledky ---------- */
  function countryInfo(cc) { return byIso[cc] || null; }
  function seasonOk(cc, ymd) { const c = countryInfo(cc); if (!c || !c.months) return null; return c.months.includes(+ymd.slice(5, 7)); }

  function visibleTrips(trips) {
    return trips.filter(t => {
      if (view.excludeOrigins.has(t.out.from)) return false;
      if (t.back && view.excludeOrigins.has(t.back.to)) return false;
      if (view.carriers.size && !view.carriers.has(t.out.provider) && !(t.back && view.carriers.has(t.back.provider))) return false;
      if (view.maxPrice && t.perPersonCzk > view.maxPrice) return false;
      if (view.onlyDeals && !['super', 'good'].includes(t.deal.level)) return false;
      if (view.outDate && t.out.date !== view.outDate) return false;
      return true;
    });
  }
  function sortKey(t, g) {
    switch (view.sort) {
      case 'flight': return t.flightCzk;
      case 'deal': return -t.deal.score;
      case 'season': { const s = seasonOk(g?.dest.cc || '', t.out.date); const c = countryInfo(g?.dest.cc); return t.perPersonCzk * (s === true ? 0.65 : s === false ? 1.2 : 1) * (c && c.safety ? (1.25 - c.safety * 0.05) : 1); }
      case 'warm': return -(t.tempHi ?? -99);
      case 'near': return t.distanceKm;
      case 'far': return -t.distanceKm;
      case 'date': return t.out.date + (t.out.dep || '');
      default: return t.perPersonCzk;
    }
  }
  function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  function computeGroups() {
    const res = lastResult;
    const out = [];
    for (const g of res.groups) {
      const trips = visibleTrips(g.options);
      if (!trips.length) continue;
      trips.sort((a, b) => cmp(sortKey(a, g), sortKey(b, g)) || a.perPersonCzk - b.perPersonCzk);
      out.push({ ...g, vis: trips });
    }
    out.sort((a, b) => cmp(sortKey(a.vis[0], a), sortKey(b.vis[0], b)));
    return out;
  }

  function renderResults() {
    const res = lastResult; if (!res) return;
    rowRegistry = [];
    const host = $('#results');
    const isRoute = res.mode === 'route';
    const groups = computeGroups();
    const flat = isRoute ? visibleTrips(res.top || []).sort((a, b) => cmp(sortKey(a), sortKey(b))) : null;
    const all = groups.flatMap(g => g.vis);
    const best = all.length ? all.reduce((m, t) => t.perPersonCzk < m.perPersonCzk ? t : m) : null;
    const prices = res.groups.map(g => g.best.perPersonCzk);
    const maxP = prices.length ? Math.max(...prices) : 0;
    const usedProviders = [...new Set(res.groups.flatMap(g => g.options.flatMap(t => [t.out.provider, t.back?.provider].filter(Boolean))))];
    const destTxt = res.destination.kind === 'anywhere' ? 'kamkoliv' : esc(res.destination.label);

    if (!res.groups.length) {
      host.innerHTML = emptyState(res);
      $$('[data-mt]', host).forEach(b => b.onclick = () => { setMinTemp(b.dataset.mt); startSearch({ noScroll: true }); });
      return;
    }
    const summary = `<div class="res-head">
      <div><h2>${isRoute ? `✈️ ${destTxt}` : `🌍 ${res.groups.length} destinací ${res.destination.kind === 'countries' ? '· ' + destTxt : ''}`}</h2>
      <div class="muted" style="font-size:13px">z ${res.origins.map(o => `<b>${o.iata}</b>`).join(', ')} · ${whenTxt(res.query)} · ${res.query.adults} os.${BAG_LBL[res.query.bags] ? ` · 🧳 vč. ${res.query.bags === 'cabin' ? 'kabinového kufru' : 'kufru k odbavení'}` : ''}
      ${best ? ` · nejlevněji <b class="good">${czk(best.perPersonCzk)}</b>/os.` : ''}</div></div>
      <div class="res-tools">
        <select id="sortSel" title="Řazení">
          ${[['total', `Nejlevnější celkem (vč. dopravy${BAG_LBL[res.query.bags] ? ' a zavazadel' : ''})`], ['flight', 'Nejlevnější letenka'], ['deal', 'Nejvýhodnější vůči běžné ceně'], ['season', 'Cena + ideální sezóna'], ['warm', 'Nejtepleji'], ['date', 'Nejdřívější odlet'], ['near', 'Nejblíž'], ['far', 'Nejdál']].map(o => `<option value="${o[0]}" ${view.sort === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}
        </select>
        <div class="seg" id="viewSeg">${[['list', '☰ Seznam'], ['map', '🗺️ Mapa'], ...(isRoute ? [['cal', '📅 Kalendář']] : [])].map(v => `<button type="button" data-v="${v[0]}" class="${view.mode === v[0] ? 'on' : ''}">${v[1]}</button>`).join('')}</div>
      </div></div>
      <div class="res-filters">
        <div class="rf-group"><span class="faint">Letiště:</span>${res.origins.map(o => `<button type="button" class="fchip ${view.excludeOrigins.has(o.iata) ? '' : 'on'}" data-fo="${o.iata}" title="${esc((o.name || '') + (o.hub ? ` – velké přestupní letiště pro dálkové lety (${o.distKm} km, cesta ~${o.ground?.czk || 0} Kč započtena)` : ''))}">${o.hub ? '✈︎ ' : ''}${o.iata}${o.ground && o.ground.czk ? ` <small>+${o.ground.czk}</small>` : ''}</button>`).join('')}</div>
        ${usedProviders.length > 1 ? `<div class="rf-group"><span class="faint">Aerolinky:</span>${usedProviders.map(p => `<button type="button" class="fchip ${!view.carriers.size || view.carriers.has(p) ? 'on' : ''}" data-fc="${p}"><i style="background:${provColor(p)}"></i>${esc(provName(p))}</button>`).join('')}</div>` : ''}
        <div class="rf-group rf-price"><span class="faint">Max.</span><input type="range" id="fPrice" min="0" max="${Math.ceil(maxP / 100) * 100}" step="100" value="${view.maxPrice || Math.ceil(maxP / 100) * 100}"><b id="fPriceVal">${view.maxPrice ? czk(view.maxPrice) : 'bez limitu'}</b></div>
        <button type="button" class="fchip ${view.onlyDeals ? 'on' : ''}" id="fDeals">🔥 jen výhodné</button>
        ${view.outDate ? `<button type="button" class="fchip on" id="fDate">odlet ${fmtDate(view.outDate)} ✕</button>` : ''}
      </div>
      ${res.warm ? `<div class="note info" style="margin-bottom:14px">🌡️ <div><b>Za teplem ≥ ${res.warm.minTemp} °C:</b> jen cíle, kde je v měsíci odletu dlouhodobý průměr denních maxim aspoň ${res.warm.minTemp} °C${res.warm.dropped ? ` – ${plural(res.warm.dropped, 'nabídka', 'nabídky', 'nabídek')} do chladnějších míst ${res.warm.dropped === 1 ? 'vyřazena' : res.warm.dropped <= 4 ? 'vyřazeny' : 'vyřazeno'}` : ''}.</div></div>` : ''}
      ${res.demo ? `<div class="note warn" style="margin-bottom:14px">⚠️ <div><b>DEMO data</b> – ceny i lety jsou vymyšlené, slouží jen k vyzkoušení aplikace.</div></div>` : ''}
      ${res.fx && res.fx.source === 'approx' && !res.demo ? `<div class="note warn" style="margin-bottom:14px">💱 <div>Kurzy měn se nepodařilo načíst – přepočet do Kč je orientační.</div></div>` : ''}
      <div class="faint rank-note">Pořadí určuje jen zvolené řazení (cena, termín, vzdálenost) – žádná aerolinka ani partner si za lepší pozici neplatí.${health?.affiliate ? ' Odkazy na Aviasales jsou partnerské (affiliate, <span class="ad-tag">reklama</span>): při nákupu přes ně může ATLAS dostat provizi, cenu to pro tebe nemění.' : ''}</div>`;

    let body = '';
    if (view.mode === 'map') body = `<div class="card res-map-card"><div id="resMap" class="res-map"></div><div class="map-legend"><span><i class="lg-dot" style="background:#34d399"></i>nejlevnější</span><span><i class="lg-dot" style="background:#fbbf24"></i>střední</span><span><i class="lg-dot" style="background:#fb7185"></i>dražší</span><span class="faint">klikni na bod → detail</span></div></div><div id="mapList"></div>`;
    else if (view.mode === 'cal' && isRoute) body = calendarHtml(res) + `<div class="section-head"><h2>Nejlepší kombinace${view.outDate ? ' · odlet ' + fmtDate(view.outDate) : ''}</h2></div>` + flatList(flat);
    else body = isRoute ? (groups.length > 1 ? `<div class="dest-mini">${groups.map(g => `<span class="chip">${flag(g.dest.cc)} ${esc(g.dest.label)} od <b>${czk(g.vis[0].perPersonCzk)}</b></span>`).join('')}</div>` : '') + flatList(flat) : groups.map(g => groupCard(g)).join('');
    if (!body.trim() || (view.mode === 'list' && !groups.length)) body += `<div class="empty">Filtrům nic neodpovídá. Uvolni filtr ceny, letišť nebo aerolinek.</div>`;
    host.innerHTML = summary + body + `<div class="res-foot faint">Ceny jsou za osobu ${bagFoot(res.query.bags)}, vč. odhadu dopravy na letiště${res.query.kmRate ? ` (${res.query.kmRate} Kč/km)` : ' (vypnuto)'}. Živé ceny (Ryanair, Wizz Air) se mohou do rezervace změnit; ceny „z cache“ ověř. Kurz: ${res.fx ? `1 EUR = ${res.fx.eurCzk.toFixed(2)} Kč (${esc(res.fx.source)})` : '—'}. 🌡️ Teplota u cíle je dlouhodobý průměr denních maxim v měsíci odletu (NASA POWER, 2001–2020, okolí letiště) – ne předpověď počasí.</div>`;
    wireResults();
    if (view.mode === 'map') drawResultMap(groups);
  }

  // Co je v ceně za zavazadla (patička výsledků); příplatky jsou jen odhad podle dopravce.
  function bagFoot(bags) {
    if (!BAG_LBL[bags]) return 'jen s malým zavazadlem pod sedadlo (kufr si přidej v „Další možnosti → 🧳 Zavazadla“)';
    return `vč. odhadu příplatku za ${bags === 'cabin' ? 'kabinový kufr do 10 kg' : 'kufr k odbavení 20–23 kg (kabinový kufr se nepočítá)'} – typická cena u dopravce při nákupu s letenkou, přesnou ukáže až rezervace`;
  }

  function emptyState(res) {
    const errs = res.providers.filter(p => p.error).map(p => `<li><b>${esc(provName(p.id))}:</b> ${esc(p.error)}</li>`).join('');
    const notes = res.providers.filter(p => p.note).map(p => `<li><b>${esc(provName(p.id))}:</b> ${esc(p.note)}</li>`).join('');
    const aps = res.origins.map(o => o.iata).join(', ');
    // Za teplem: vysvětli, že lety jsou, jen ne do tepla, a nabídni nižší limit (zvýrazněný ten, který už něco pustí).
    const w = res.warm;
    const lower = w ? [25, 20].filter(x => x < w.minTemp) : [];
    const warmest = w ? w.maxHi ?? w.destHi ?? null : null;
    const fits = warmest != null ? lower.find(x => x <= warmest) : null;
    const msg = w && w.dropped
      ? `Z letišť ${aps} jsem našel ${plural(w.dropped, 'nabídku', 'nabídky', 'nabídek')}, ale žádná nevede tam, kde bývá v měsíci odletu přes den aspoň ${w.minTemp} °C${w.maxHi != null ? ` – nejtepleji bylo kolem ${w.maxHi} °C` : ''}.`
      : w && w.destHi != null && w.destHi < w.minTemp
      ? `V cíli ${esc(res.destination.label)} bývá v měsících odletu přes den průměrně nejvýš ~${w.destHi} °C – na filtr „za teplem“ ≥ ${w.minTemp} °C to nestačí.`
      : `Z letišť ${aps} jsem pro zadané termíny nenašel žádný let${res.destination.kind !== 'anywhere' ? ' do cíle ' + esc(res.destination.label) : ''}.${w ? ` Filtr „za teplem“ pouští jen cíle, kde bývá v měsíci odletu přes den aspoň ${w.minTemp} °C.` : ''}`;
    return `<div class="card empty-res"><div class="ei">${w ? '🌡️' : '🧭'}</div><h2>Nic jsem nenašel</h2>
      <p class="muted">${msg}</p>
      ${w ? `<div class="row wrap warm-retry">${lower.map(x => `<button type="button" class="btn sm ${x === fits ? 'primary' : ''}" data-mt="${x}">Snížit na ≥ ${x} °C</button>`).join('')}<button type="button" class="btn sm ghost" data-mt="0">Hledat bez teplotního filtru</button></div>` : ''}
      <ul class="hints"><li>Zvětši okruh letišť (posuvník „+ letiště do“).</li><li>Rozšiř rozsah dat nebo počet nocí, zruš omezení dnů.</li><li>Zkus „🌍 Kamkoliv“ – uvidíš, kam se z okolí dá letět.</li></ul>
      ${errs ? `<div class="note bad" style="text-align:left;margin-top:12px"><div><b>Chyby zdrojů:</b><ul>${errs}</ul></div></div>` : ''}
      ${notes ? `<div class="note info" style="text-align:left;margin-top:12px"><div><ul>${notes}</ul></div></div>` : ''}</div>`;
  }

  function legHtml(l, back) {
    const ap = a => `<b>${a}</b>`;
    const t1 = timeOf(l), t2 = arrTime(l);
    return `<div class="leg ${back ? 'back' : ''}">
      <span class="cbadge" style="background:${provColor(l.provider)}" title="${esc(l.carrierName || provName(l.provider))}">${esc(l.carrier || '?')}</span>
      <span class="ld">${dayLabel(l.date)}</span>
      <span class="lr">${ap(l.from)}${t1 ? ` <span class="tm">${t1}</span>` : ''} <span class="arr">→</span> ${ap(l.to)}${t2 ? ` <span class="tm">${t2}</span>` : ''}</span>
      <span class="lx">${[dur(l.durationMin), l.stops ? `${l.stops}× přestup` : (l.provider === 'travelpayouts' ? '' : 'přímý'), l.flightNo, l.carrierName].filter(Boolean).map(esc).join(' · ')}</span>
      ${l.czk && !back ? '' : ''}
    </div>`;
  }

  function badges(t, g) {
    const out = [];
    if (t.nights != null) out.push(`<span class="b">🌙 ${nightsTxt(t.nights)}</span>`);
    if (t.deal.level === 'super') out.push('<span class="b hot">🔥 Super cena</span>');
    else if (t.deal.level === 'good') out.push('<span class="b good">👍 Výhodné</span>');
    if (t.deal.drop) out.push(`<span class="b good">↓ zlevnilo o ${t.deal.drop} %</span>`);
    if (!t.out.live || (t.back && !t.back.live)) out.push('<span class="b warn" title="Cena z vyhledávání jiných uživatelů za posledních ~48 h – před nákupem ověř">⏱ z cache</span>');
    if (t.back && t.back.to !== t.out.from) out.push(`<span class="b info" title="Návrat na jiné letiště než odlet">↩ návrat do ${t.back.to}</span>`);
    if (t.back && t.back.from !== t.out.to) out.push(`<span class="b info" title="Zpět z jiného letiště v cílové oblasti">✈ zpět z ${t.back.from}</span>`);
    const bags = lastResult?.query.bags;
    if (BAG_LBL[bags] && !t.bagCzk) out.push(`<span class="b good" title="${t.bagEst ? 'Hrubý odhad – u dopravce se to nepodařilo ověřit, zkontroluj při rezervaci' : 'U dopravce bývá v ceně i nejlevnějšího tarifu'}">🧳 ${bags === 'cabin' ? 'kabinový kufr' : 'kufr'} ${t.bagEst ? 'nejspíš ' : ''}v ceně</span>`);
    if (t.back && t.back.provider !== t.out.provider) out.push('<span class="b info" title="Dvě samostatné letenky – při zpoždění prvního letu druhá aerolinka nečeká">🔀 2 aerolinky</span>');
    const s = g ? seasonOk(g.dest.cc, t.out.date) : null;
    if (s === true) out.push('<span class="b good" title="Podle ATLAS je to ideální období pro tuto zemi">☀️ ideální sezóna</span>');
    if (t.tempHi != null) out.push(`<span class="b ${t.tempHi >= 25 ? 'sun' : t.tempHi < 15 ? 'info' : ''}" title="Dlouhodobý průměr denních maxim v ${MNS_IN[+t.out.date.slice(5, 7) - 1]} (NASA POWER) – není to předpověď">🌡️ ~${t.tempHi} °C</span>`);
    if (g && g.dest.airportDistKm > 30) out.push(`<span class="b" title="Vzdálenost letiště od centra">📏 ${g.dest.airportDistKm} km od centra</span>`);
    return out.join('');
  }

  function bookButtons(t) {
    const btn = (url, label, prov) => url ? `<a class="btn sm book" style="--pc:${provColor(prov)}" href="${esc(safeUrl(url))}" target="_blank" rel="noopener">${label}</a>` : `<span class="btn sm ghost" title="Demo data nemají rezervační odkaz" style="opacity:.55">${label}</span>`;
    if (t.bookUrl) return btn(t.bookUrl, `Koupit ${t.combined ? 'na Aviasales' : 'u ' + esc(provName(t.provider))} ↗`, t.provider);
    if (!t.back) return btn(t.out.bookUrl, `Koupit u ${esc(provName(t.out.provider))} ↗`, t.out.provider);
    return btn(t.out.bookUrl, `Tam: ${esc(provName(t.out.provider))} ↗`, t.out.provider) + btn(t.back.bookUrl, `Zpět: ${esc(provName(t.back.provider))} ↗`, t.back.provider);
  }

  function verifyLinks(t) {
    const pax = lastResult.query.adults;
    const sameAp = t.back && t.back.from === t.out.to && t.back.to === t.out.from;
    const gq = (a, b, d1, d2) => `https://www.google.com/travel/flights?hl=cs&curr=CZK&q=${enc(`Flights from ${a} to ${b} on ${d1}${d2 ? ' returning ' + d2 : ' one way'}`)}`;
    const sk = (a, b, d1, d2) => `https://www.skyscanner.cz/transport/flights/${a.toLowerCase()}/${b.toLowerCase()}/${yymmdd(d1)}/${d2 ? yymmdd(d2) + '/' : ''}?adults=${pax}&rtn=${d2 ? 1 : 0}`;
    if (!t.back || sameAp) {
      const d2 = t.back ? t.back.date : null;
      return `<a href="${gq(t.out.from, t.out.to, t.out.date, d2)}" target="_blank" rel="noopener">Google Flights</a> · <a href="${sk(t.out.from, t.out.to, t.out.date, d2)}" target="_blank" rel="noopener">Skyscanner</a>`;
    }
    return `<a href="${gq(t.out.from, t.out.to, t.out.date)}" target="_blank" rel="noopener">tam (Google)</a> · <a href="${gq(t.back.from, t.back.to, t.back.date)}" target="_blank" rel="noopener">zpět (Google)</a>`;
  }

  function priceBox(t) {
    const pax = lastResult.query.adults;
    return `<div class="pbox"><div class="pp">${czk(t.perPersonCzk)}</div><div class="pl">na osobu</div>
      <div class="pd">letenky ${czk(t.flightCzk)}${t.bagCzk ? ` + <span title="Odhad příplatku za ${BAG_LBL[lastResult.query.bags] || 'zavazadlo'}${t.bagEst ? ' – hrubý, dopravce se nepodařilo ověřit' : ' – typická cena u dopravce'}">zavazadla ~${czk(t.bagCzk)}</span>` : ''}${t.groundCzk ? ` + doprava ${czk(t.groundCzk)}` : ''}</div>
      ${pax > 1 ? `<div class="pd">celkem ${pax} os.: <b>${czk(t.totalCzk)}</b></div>` : ''}</div>`;
  }

  function tripRow(t, g, idx) {
    return `<div class="trip-row" data-tid="${esc(t.id)}">
      <div class="tr-legs">${legHtml(t.out)}${t.back ? legHtml(t.back, true) : ''}<div class="tr-badges">${badges(t, g)}</div></div>
      ${priceBox(t)}
      <div class="tr-act"><button type="button" class="btn sm primary" data-pick="${idx}">Vybrat a pokračovat →</button>
        <div class="tr-buy">${bookButtons(t)}</div>
        <div class="tr-more"><span class="faint">Ověřit:</span> ${verifyLinks(t)}${g && byIso[g.dest.cc] ? ` · <button type="button" class="linkbtn" data-country="${g.dest.cc}">Info o zemi</button>` : ''}</div>
      </div></div>`;
  }

  let rowRegistry = [];
  function reg(t, g) { rowRegistry.push({ t, g }); return rowRegistry.length - 1; }

  function groupCard(g) {
    const t = g.vis[0];
    const c = byIso[g.dest.cc];
    const exp = view.expanded.has(g.dest.key);
    const others = g.vis.slice(1);
    return `<div class="card res-card" id="g-${esc(g.dest.key)}">
      <div class="rc-head">
        <div class="rc-flag">${flag(g.dest.cc)}</div>
        <div class="rc-name"><h3>${esc(g.dest.label)}</h3><div class="faint">${esc(g.dest.country || '')}${g.dest.airports.length > 1 ? ` · letiště ${g.dest.airports.join(', ')}` : ` · ${g.dest.airports[0]}`}${t.distanceKm ? ` · ${t.distanceKm.toLocaleString('cs')} km` : ''}${c && c.cost ? ` · ceny na místě ${costDots(c.cost)}` : ''}</div></div>
      </div>
      ${tripRow(t, g, reg(t, g))}
      ${others.length ? `<button type="button" class="more-btn" data-exp="${esc(g.dest.key)}">${exp ? '▲ Skrýt' : `▼ Další termíny a letiště (${others.length})`}</button>
        ${exp ? `<div class="alt-list">${others.map(o => tripRow(o, g, reg(o, g))).join('')}</div>` : ''}` : ''}
    </div>`;
  }

  function flatList(list) {
    if (!list || !list.length) return `<div class="empty">${view.outDate ? 'Pro tento den odletu nic neodpovídá filtrům – vyber jiný den v kalendáři.' : 'Filtrům nic neodpovídá.'}</div>`;
    const byKey = new Map(lastResult.groups.map(g => [g.dest.key, g]));
    return `<div class="card res-card flat">${list.slice(0, 40).map(t => { const g = byKey.get(t.destKey); return tripRow(t, g, reg(t, g)); }).join('')}</div>`;
  }

  function calendarHtml(res) {
    const cal = res.calendar; if (!cal) return '';
    const render = (days, title, clickable) => {
      if (!days.length) return `<div class="cal-box"><h4>${title}</h4><div class="faint">žádná data</div></div>`;
      const byDate = new Map(days.map(d => [d.date, d]));
      const costs = days.map(d => d.cost).sort((a, b) => a - b);
      const q = v => { const i = costs.findIndex(c => c >= v); return i / Math.max(1, costs.length - 1); };
      const months = [...new Set(days.map(d => d.date.slice(0, 7)))].sort();
      return `<div class="cal-box"><h4>${title}</h4>${months.map(m => {
        const [y, mo] = m.split('-').map(Number);
        const first = new Date(y, mo - 1, 1); const n = new Date(y, mo, 0).getDate();
        const offset = (first.getDay() + 6) % 7;
        let cells = '';
        for (let i = 0; i < offset; i++) cells += '<div class="cd empty"></div>';
        for (let d = 1; d <= n; d++) {
          const key = `${m}-${pad(d)}`; const x = byDate.get(key);
          if (!x) { cells += `<div class="cd none"><span>${d}</span></div>`; continue; }
          const h = 140 - q(x.cost) * 140;
          const tip = x.outDate ? `${dayLabel(key)}: celá cesta od ${czk(x.cost)}/os. (${x.from}→${x.to} ${fmtDate(x.outDate)}, zpět ${fmtDate(x.backDate)} do ${x.backTo})` : `${dayLabel(key)}: ${czk(x.cost)} (${x.from}→${x.to}, ${provName(x.provider)})`;
          cells += `<div class="cd ${clickable ? 'click' : ''} ${view.outDate === key ? 'sel' : ''}" ${clickable ? `data-day="${key}"` : ''} style="--h:${h}" title="${esc(tip)}"><span>${d}</span><b>${x.cost >= 10000 ? Math.round(x.cost / 1000) + 'k' : x.cost}</b></div>`;
        }
        return `<div class="cal-month"><div class="cm-t">${MNS_FULL[mo - 1]} ${y}</div><div class="cal-grid">${['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'].map(x => `<div class="cdw">${x}</div>`).join('')}${cells}</div></div>`;
      }).join('')}</div>`;
    };
    const trip = cal.kind === 'trip';
    return `<div class="card cal-card"><div class="cal-wrap">${render(cal.out, trip ? '🛫 Podle dne odletu – nejlevnější celá cesta (Kč/os.)' : '🛫 Nejlevnější odlet podle dne (Kč/os.)', true)}${trip ? render(cal.back, '🛬 Podle dne návratu – nejlevnější celá cesta', false) : ''}</div><div class="faint" style="font-size:12px;margin-top:8px">Ceny vč. letenek tam i zpět a dopravy na letiště, se zadaným počtem nocí. Klikni na den odletu a uvidíš kombinace s tímto datem.</div></div>`;
  }

  function wireResults() {
    const host = $('#results');
    $('#sortSel', host).onchange = e => { view.sort = e.target.value; rerender(); };
    $$('#viewSeg button', host).forEach(b => b.onclick = () => { view.mode = b.dataset.v; rerender(); });
    $$('[data-fo]', host).forEach(b => b.onclick = () => { const k = b.dataset.fo; view.excludeOrigins.has(k) ? view.excludeOrigins.delete(k) : view.excludeOrigins.add(k); rerender(); });
    $$('[data-fc]', host).forEach(b => b.onclick = () => {
      const k = b.dataset.fc; const all = [...new Set($$('[data-fc]', host).map(x => x.dataset.fc))];
      if (!view.carriers.size) view.carriers = new Set(all);
      view.carriers.has(k) ? view.carriers.delete(k) : view.carriers.add(k);
      if (!view.carriers.size || view.carriers.size === all.length) view.carriers = new Set();
      rerender();
    });
    const fp = $('#fPrice', host);
    if (fp) {
      fp.oninput = () => { $('#fPriceVal').textContent = +fp.value >= +fp.max ? 'bez limitu' : czk(+fp.value); };
      fp.onchange = () => { view.maxPrice = +fp.value >= +fp.max ? null : +fp.value; rerender(); };
    }
    const fd = $('#fDeals', host); if (fd) fd.onclick = () => { view.onlyDeals = !view.onlyDeals; rerender(); };
    const fdt = $('#fDate', host); if (fdt) fdt.onclick = () => { view.outDate = null; rerender(); };
    $$('[data-exp]', host).forEach(b => b.onclick = () => { const k = b.dataset.exp; view.expanded.has(k) ? view.expanded.delete(k) : view.expanded.add(k); rerender(true); });
    $$('[data-day]', host).forEach(c => c.onclick = () => { view.outDate = view.outDate === c.dataset.day ? null : c.dataset.day; rerender(true); });
    $$('[data-pick]', host).forEach(b => b.onclick = () => { const r = rowRegistry[+b.dataset.pick]; Trip.start({ t: r.t, g: r.g, result: lastResult }); });
    $$('[data-country]', host).forEach(b => b.onclick = () => openCountry(b.dataset.country));
  }
  function rerender(keepScroll) {
    const y = window.scrollY;
    rowRegistry = [];
    renderResults();
    if (keepScroll) window.scrollTo(0, y);
  }


  /* ---------- mapa výsledků ---------- */
  async function drawResultMap(groups) {
    const el = $('#resMap'); if (!el || typeof d3 === 'undefined') return;
    const world = await loadWorld();
    const feats = topojson.feature(world, world.objects.countries).features;
    const W = el.clientWidth || 900, H = Math.max(380, Math.min(620, W * 0.58));
    const res = lastResult;
    const pts = groups.filter(g => g.dest.lat != null).map(g => ({ g, t: g.vis[0], lon: g.dest.lon, lat: g.dest.lat }));
    const orig = res.origins.filter(o => o.lat != null);
    const geo = { type: 'MultiPoint', coordinates: [...pts.map(p => [p.lon, p.lat]), ...orig.map(o => [o.lon, o.lat])] };
    const proj = d3.geoNaturalEarth1().fitExtent([[30, 30], [W - 30, H - 30]], geo);
    if (proj.scale() > 2600) proj.scale(2600);
    const path = d3.geoPath(proj);
    el.innerHTML = '';
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('class', 'rm-svg');
    const g0 = svg.append('g');
    g0.append('g').selectAll('path').data(feats).join('path').attr('d', path).attr('class', 'rm-land');
    const prices = pts.map(p => p.t.perPersonCzk).sort((a, b) => a - b);
    const qOf = v => prices.length > 1 ? prices.findIndex(x => x >= v) / (prices.length - 1) : 0;
    const col = v => { const q = qOf(v); return q < .33 ? '#34d399' : q < .66 ? '#fbbf24' : '#fb7185'; };
    const home = res.home ? [res.home.lon, res.home.lat] : (orig[0] ? [orig[0].lon, orig[0].lat] : null);
    const lines = g0.append('g');
    pts.slice().sort((a, b) => a.t.perPersonCzk - b.t.perPersonCzk).slice(0, 25).forEach(p => {
      const o = res.origins.find(x => x.iata === p.t.out.from) || orig[0];
      if (!o) return;
      lines.append('path').datum({ type: 'LineString', coordinates: [[o.lon, o.lat], [p.lon, p.lat]] }).attr('d', path).attr('class', 'rm-arc').attr('stroke', col(p.t.perPersonCzk));
    });
    const tip = $('#mapTip');
    g0.append('g').selectAll('circle').data(pts).join('circle')
      .attr('cx', d => proj([d.lon, d.lat])[0]).attr('cy', d => proj([d.lon, d.lat])[1])
      .attr('r', d => d.t.deal.level === 'super' ? 7 : 5.5).attr('class', 'rm-dot').attr('fill', d => col(d.t.perPersonCzk))
      .on('mousemove', (e, d) => { tip.innerHTML = `${flag(d.g.dest.cc)} ${esc(d.g.dest.label)} · <span style="color:var(--good)">${czk(d.t.perPersonCzk)}</span>${d.t.tempHi != null ? ` · 🌡️ ~${d.t.tempHi} °C` : ''}`; tip.style.left = e.clientX + 'px'; tip.style.top = e.clientY + 'px'; tip.style.opacity = 1; })
      .on('mouseleave', () => tip.style.opacity = 0)
      .on('click', (e, d) => { tip.style.opacity = 0; showMapDetail(d.g); });
    // popisky nejlevnějších
    g0.append('g').selectAll('text').data(pts.slice().sort((a, b) => a.t.perPersonCzk - b.t.perPersonCzk).slice(0, 12)).join('text')
      .attr('x', d => proj([d.lon, d.lat])[0] + 8).attr('y', d => proj([d.lon, d.lat])[1] + 4).attr('class', 'rm-lbl')
      .text(d => `${d.g.dest.label} ${Math.round(d.t.perPersonCzk).toLocaleString('cs')}`);
    g0.append('g').selectAll('rect').data(orig).join('rect')
      .attr('x', d => proj([d.lon, d.lat])[0] - 4).attr('y', d => proj([d.lon, d.lat])[1] - 4).attr('width', 8).attr('height', 8).attr('class', 'rm-origin');
    if (home) svg.append('circle').attr('cx', proj(home)[0]).attr('cy', proj(home)[1]).attr('r', 4).attr('class', 'rm-home');
    svg.call(d3.zoom().scaleExtent([1, 10]).on('zoom', ev => { g0.attr('transform', ev.transform); g0.selectAll('circle').attr('r', d => (d.t.deal.level === 'super' ? 7 : 5.5) / Math.sqrt(ev.transform.k)); g0.selectAll('.rm-lbl').style('font-size', 11 / Math.sqrt(ev.transform.k) + 'px'); }));
  }
  function showMapDetail(g) {
    rowRegistry = [];
    $('#mapList').innerHTML = groupCard(g);
    wireResults();
    $('#mapList').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ---------- hlídané ceny ---------- */
  // Popis termínu: přesná data („tam 14.11. · zpět 21.11.“) nebo rozsah + počet nocí.
  function whenTxt(q) {
    const x = q.exact;
    if (x) {
      const pm = x.flex ? ` ±${x.flex}` : '';
      return `📅 tam ${fmtDate(x.out)}${pm}${x.back ? ` · zpět ${fmtDate(x.back)}${pm}` : ' · jen tam'}${x.flex ? '' : ' (přesná data)'}`;
    }
    return `${fmtDate(q.dateFrom)}–${fmtDate(q.dateTo)} · ${q.trip === 'return' ? `${q.nightsMin}–${q.nightsMax} nocí` : 'jen tam'}`;
  }
  function watchLabel(f) {
    const from = f.from.map(x => x.label).join(', ');
    const to = f.to.length ? f.to.map(x => x.label).join(', ') : 'kamkoliv';
    return `${from} → ${to}`;
  }
  function bestOf(res) {
    const all = res.groups.map(g => g.best);
    if (!all.length) return null;
    const t = all.reduce((m, x) => x.perPersonCzk < m.perPersonCzk ? x : m);
    const g = res.groups.find(x => x.best === t);
    return { czk: t.perPersonCzk, desc: `${g.dest.label} · ${fmtDate(t.out.date)}${t.back ? '–' + fmtDate(t.back.date) : ''} · z ${t.out.from}` };
  }
  async function addWatch() {
    const f = getForm();
    if (!f.from.length) return toast('Nejdřív zadej, odkud letíš', 'err');
    let res = lastResult && JSON.stringify(lastPayload) === JSON.stringify(payloadOf(f)) ? lastResult : await startSearch({ noScroll: true });
    if (!res) return;
    const b = bestOf(res);
    S.watch = S.watch || [];
    const czk0 = b ? b.czk : null;
    S.watch.unshift({ id: Date.now().toString(36), label: watchLabel(f), sub: (f.dateMode === 'exact' ? whenTxt({ exact: { out: f.xOut, back: f.trip === 'return' ? f.xBack : null, flex: f.xFlex } }) : `${fmtDate(f.dFrom)}–${fmtDate(f.dTo)} · ${f.trip === 'return' ? `${f.nMin}–${f.nMax} nocí` : 'jen tam'}${f.minTemp ? ` · 🌡️ ≥ ${f.minTemp} °C` : ''}`) + (BAG_LBL[f.bags] ? ` · 🧳 ${BAG_LBL[f.bags]}` : ''), form: f, best: b, history: b ? [{ at: Date.now(), czk: b.czk }] : [], checked: Date.now(), base: czk0, low: czk0, seen: czk0, target: null });
    S.watch = S.watch.slice(0, 12); save();
    updateWatchBadges();
    toast('Hledání uloženo – cenu hlídám na Přehledu, dokud máš ATLAS otevřený');
  }

  // Stav karet během kontroly: id → 'wait' (ve frontě) | 'run' (právě se kontroluje).
  const wState = new Map();
  let busySearches = 0; // hledání spuštěná uživatelem – automatická kontrola počká
  const sched = Alerts.scheduler({
    list: () => S.watch || [],
    check: id => checkOne(id, true),
    sync: syncWatches,
    today,
    sleep: ms => new Promise(r => setTimeout(r, ms)),
    canRun: () => !document.hidden && !busySearches,
  });
  const cardSel = id => `#watchList [data-w="${CSS.escape(id)}"]`;
  const notifOk = () => Alerts.notifState(window.Notification, window.isSecureContext !== false);

  function sparkSvg(w) {
    const W = 120, H = 34, sp = Alerts.sparkPath(w.history, W, H, 4);
    if (!sp) return '';
    const n = (w.history || []).length;
    const lab = `Vývoj ceny za ${n} ${n < 5 ? 'kontroly' : 'kontrol'}: ${czk(sp.min)} až ${czk(sp.max)}`;
    const tgt = w.target >= sp.min && w.target <= sp.max ? `<path class="ws-tgt" d="M0 ${sp.y(w.target)}H${W}"/>` : '';
    return `<svg class="w-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(lab)}"><title>${esc(lab)}</title>${tgt}<path class="ws-line" d="${sp.d}"/><path class="ws-dot" d="M${sp.last[0]} ${sp.last[1]}h0"/></svg>`;
  }
  function watchBar() {
    const n = {
      default: '<button type="button" class="btn sm ghost" id="notifBtn">🔔 Upozorňovat i v prohlížeči</button>',
      granted: '<span class="w-ntf">🔔 Upozornění v prohlížeči jsou zapnutá.</span>',
      denied: '<span class="w-ntf">🔕 Upozornění má prohlížeč pro ATLAS zablokovaná – povolíš je v nastavení webu (ikona vedle adresy).</span>',
      unsupported: '<span class="w-ntf">Tento prohlížeč upozornění neumí – zlevnění uvidíš tady a u položky Přehled.</span>',
    }[notifOk()];
    return `<div class="watch-bar"><span>🔄 Každé hledání kontroluji automaticky zhruba jednou za 6 h – ale jen dokud máš ATLAS otevřený v prohlížeči a panel není schovaný na pozadí. Zavřená stránka nehlídá nic.</span>${n}</div>`;
  }
  function watchCard(w, now = Date.now()) {
    const h = w.history || [];
    const cur = w.best?.czk;
    const prev = h.length > 1 ? h[h.length - 2].czk : null;
    const diff = prev && cur ? cur - prev : 0;
    const past = Alerts.isPast(w.form, today());
    const st = wState.get(w.id);
    const since = Alerts.pctChange(w.base ?? h[0]?.czk, cur);
    const low = Alerts.lowest([w.low, ...h.map(x => x.czk), cur]);
    const drop = Alerts.isDropped(w);
    const id = esc(w.id);
    const when = st === 'run' ? '<span class="spin dark"></span> kontroluji…' : st === 'wait' ? '⏳ čeká na kontrolu…'
      : w.checked ? `naposledy zkontrolováno <span data-ago="${+w.checked}" title="${esc(new Date(w.checked).toLocaleString('cs-CZ'))}">${Alerts.agoTxt(now - w.checked)}</span>` : 'zatím nezkontrolováno';
    return `<div class="card watch${st ? ' checking' : ''}${past ? ' past' : ''}${drop ? ' dropped' : ''}" data-w="${id}">
        <div class="w-head"><div class="w-t">${esc(w.label)}</div>${drop ? '<span class="b good">📉 zlevnilo</span>' : ''}</div>
        <div class="faint" style="font-size:12px">${esc(w.sub)}</div>
        <div class="w-main"><div class="w-p">${cur ? czk(cur) : '—'}<small>/os.</small> ${diff ? `<span class="${diff < 0 ? 'good' : 'bad'}" title="Oproti minulé kontrole">${diff < 0 ? '↓' : '↑'} ${czk(Math.abs(diff))}</span>` : ''}</div>${sparkSvg(w)}</div>
        <div class="w-stats">${since != null ? `<span>od uložení <b class="${since < 0 ? 'good' : since > 0 ? 'bad' : ''}">${Alerts.fmtPct(since)}</b></span>` : ''}${low ? `<span>nejnižší cena ${czk(low)}</span>` : ''}</div>
        <div class="faint" style="font-size:12px">${esc(w.best?.desc || 'zatím bez výsledku')}</div>
        ${past ? '<div class="note warn w-past">⌛ <div>Termín proběhl – tohle hledání už hlídat nejde. Smaž ho, nebo ho otevři a vyber nové datum.</div></div>'
        : `<label class="w-target">Upozornit pod <input class="input" type="number" inputmode="numeric" min="0" data-wt="${id}" value="${+w.target > 0 ? +w.target : ''}" aria-label="Cílová cena v Kč na osobu"> Kč <span class="good w-hit" ${cur && cur <= w.target ? '' : 'hidden'}>✓ splněno</span></label>`}
        <div class="w-st faint">${when}</div>
        <div class="row w-act">${past ? `<button class="btn sm" data-wd="${id}">🗑 Smazat</button><button class="btn sm ghost" data-wo="${id}">Otevřít</button>`
        : `<button class="btn sm" data-wc="${id}" ${st ? 'disabled' : ''}>↻ Zkontrolovat</button><button class="btn sm ghost" data-wo="${id}">Otevřít</button><button class="btn sm ghost" data-wd="${id}" title="Smazat">✕</button>`}</div>
      </div>`;
  }
  // Rozepsanou cílovou cenu při překreslení nezahodit.
  function keepTyping(fn) {
    const a = document.activeElement, k = a && a.dataset && a.dataset.wt ? { id: a.dataset.wt, v: a.value } : null;
    fn();
    const el = k && $(`#watchList [data-wt="${CSS.escape(k.id)}"]`);
    if (el) { el.value = k.v; el.focus(); }
  }
  function renderWatch() {
    const list = S.watch || [], host = $('#watchList');
    $('#watchHead').hidden = !list.length;
    const now = Date.now();
    keepTyping(() => { host.innerHTML = list.length ? `${watchBar()}<div class="watch-grid">${list.map(w => watchCard(w, now)).join('')}</div>` : ''; });
    host.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.id === 'notifBtn') askNotif();
      else if (b.dataset.wc) checkWatch(b.dataset.wc);
      else if (b.dataset.wo) openWatch(b.dataset.wo);
      else if (b.dataset.wd) { S.watch = S.watch.filter(x => x.id !== b.dataset.wd); save(); renderWatch(); }
    };
    // ukládat průběžně (překreslení karty během psaní nic neztratí), potvrdit až po dopsání
    host.oninput = e => { if (e.target.dataset.wt) setTarget(e.target.dataset.wt, e.target.value); };
    host.onchange = e => { if (e.target.dataset.wt) setTarget(e.target.dataset.wt, e.target.value, true); };
    $('#watchCheckAll').onclick = () => Promise.all((S.watch || []).filter(w => !Alerts.isPast(w.form, today())).map(w => checkWatch(w.id)));
    updateWatchBadges();
    observeSeen();
  }
  function paintCard(id) {
    const el = $(cardSel(id)), w = (S.watch || []).find(x => x.id === id);
    if (el && w) keepTyping(() => { el.outerHTML = watchCard(w); });
  }
  function setState(id, st) { st ? wState.set(id, st) : wState.delete(id); paintCard(id); }
  function openWatch(id) {
    const w = (S.watch || []).find(x => x.id === id); if (!w) return;
    go('flights'); setForm(w.form); startSearch();
  }
  function setTarget(id, v, done) {
    const w = (S.watch || []).find(x => x.id === id); if (!w) return;
    const n = Math.round(+v), cur = w.best?.czk;
    w.target = n > 0 ? n : null;
    const met = !!(cur && w.target && cur <= w.target);
    const hit = $(`${cardSel(id)} .w-hit`); if (hit) hit.hidden = !met;
    // Už teď splněno → tuhle cenu znovu nehlásit, ozvat se až při dalším zlevnění.
    if (done && met) w.notified = cur;
    save();
    if (done) toast(!w.target ? 'Cílová cena zrušena' : met ? `Už teď stojí ${czk(cur)} – ozvu se, až cena ještě klesne` : `Upozorním, až bude cena ${czk(w.target)} nebo méně`);
  }
  /** Ruční kontrola – zařadí se do stejné fronty jako automatická, takže se nikdy nepotkají. */
  function checkWatch(id) {
    if (wState.has(id)) return Promise.resolve();
    setState(id, 'wait');
    const asked = Date.now();
    return sched.exclusive(() => {
      const w = (S.watch || []).find(x => x.id === id);
      // mezitím ho zkontrolovala automatická kontrola → jen ukázat výsledek
      if (w && w.checked >= asked) return toast(`${w.label}: ${w.best ? czk(w.best.czk) : 'nic nenalezeno'}`);
      return checkOne(id, false);
    }).finally(() => { if (wState.get(id) === 'wait') setState(id, null); });
  }
  async function checkOne(id, auto) {
    const w = (S.watch || []).find(x => x.id === id); if (!w) return;
    if (Alerts.isPast(w.form, today())) { if (!auto) toast(`${w.label}: termín už proběhl`, 'err'); return; }
    setState(id, 'run');
    const ctl = new AbortController(), tm = auto ? setTimeout(() => ctl.abort(), Alerts.CFG.timeoutMs) : 0;
    try {
      const f = { ...defaultForm(), ...w.form };
      if (f.dFrom < today()) f.dFrom = today();
      const res = await runSearch(payloadOf(f), { signal: ctl.signal });
      const cur = (S.watch || []).find(x => x.id === id); if (!cur) return; // mezitím smazané
      const r = Alerts.applyCheck(cur, bestOf(res), Date.now());
      Object.assign(cur, r.w); save();
      const b = cur.best;
      if (r.why) alertDrop(cur, r.why, r.prev);
      else if (!auto) toast(b && r.prev && b.czk < r.prev ? `📉 ${cur.label}: cena klesla na ${czk(b.czk)}!` : `${cur.label}: ${b ? czk(b.czk) : 'nic nenalezeno'}`);
    } catch (e) {
      // automatická kontrola chybu jen zapíše a zkusí to příští cyklus
      w.tried = Date.now(); save();
      if (!auto) toast(e.message, 'err');
    } finally {
      clearTimeout(tm); setState(id, null); updateWatchBadges(); observeSeen();
    }
  }
  function alertDrop(w, why, prev) {
    const cur = w.best.czk, pct = Alerts.pctChange(prev, cur);
    const more = why === 'drop' && pct ? `${Alerts.fmtPct(pct)} od minulé kontroly` : w.target ? `tvůj limit ${czk(w.target)}` : '';
    toast(`${why === 'target' ? '🎯' : '📉'} ${w.label}: ${czk(cur)}${more ? ' · ' + more : ''}`);
    if (notifOk() !== 'granted') return;
    try {
      const n = new Notification(why === 'target' ? `ATLAS: ${czk(cur)} – pod tvou cenou` : `ATLAS: cena klesla na ${czk(cur)}`, { body: `${w.label} · ${w.sub || ''}${more ? `\n${more}` : ''}\nKlikni a otevřu hledání.`, tag: 'atlas-watch-' + w.id });
      n.onclick = () => { window.focus(); n.close(); openWatch(w.id); };
    } catch (e) { } // např. Android Chrome umí upozornění jen přes service worker
  }
  function askNotif() {
    if (notifOk() !== 'default') return renderWatch();
    let done = false;
    const fin = p => {
      if (done) return; done = true;
      if (p === 'granted') toast('Upozornění zapnutá – ozvu se, až cena klesne');
      renderWatch();
    };
    try { const r = Notification.requestPermission(fin); if (r && r.then) r.then(fin, () => fin(Notification.permission)); } catch (e) { fin(Notification.permission); }
  }
  // Jiný panel s ATLASem mohl mezitím kontrolovat – převzít jeho novější výsledky (a neupozorňovat dvakrát).
  function syncWatches() {
    try {
      const d = JSON.parse(localStorage.getItem(LS)), stored = d && Array.isArray(d.watch) ? d.watch : [];
      let n = 0;
      for (const w of S.watch || []) {
        const s = stored.find(x => x && x.id === w.id);
        if (s && (s.checked || 0) > (w.checked || 0)) { Object.assign(w, s); n++; }
      }
      return n;
    } catch (e) { return 0; }
  }

  /* ukazatel „zlevnilo od minule“ – zmizí, když si uživatel seznam na přehledu prohlédne */
  function watchStatTxt() {
    const list = S.watch || [], n = Alerts.droppedCount(list);
    return n ? `<b class="good">📉 Zlevnilo od minule: ${n}</b>` : list.length ? 'Hlídám, dokud máš ATLAS otevřený' : 'Ulož hledání tlačítkem ♡';
  }
  function updateWatchBadges() {
    const n = Alerts.droppedCount(S.watch);
    const nb = $('#navDrops'); if (nb) { nb.hidden = !n; nb.textContent = '📉 ' + n; }
    const md = $('#mobDrops'); if (md) md.hidden = !n;
    const val = $('#watchStatVal'); if (val) val.textContent = (S.watch || []).length;
    const sub = $('#watchStatSub');
    if (sub) { sub.innerHTML = watchStatTxt(); sub.onclick = n ? () => $('#watchHead').scrollIntoView({ behavior: 'smooth', block: 'start' }) : null; sub.classList.toggle('jump', !!n); }
  }
  let seenIO = null, seenT = 0;
  function observeSeen() {
    const el = $('#watchList'); if (!el || !window.IntersectionObserver) return;
    seenIO = seenIO || new IntersectionObserver(es => { clearTimeout(seenT); if (es.some(e => e.isIntersecting)) seenT = setTimeout(markSeen, 1500); });
    seenIO.unobserve(el); seenIO.observe(el); // znovu vyhodnotit i bez posunu stránky
  }
  function markSeen() {
    if (activeView !== 'dashboard' || document.hidden) return;
    let ch = 0;
    for (const w of S.watch || []) if (w.best?.czk > 0 && w.seen !== w.best.czk) { w.seen = w.best.czk; ch++; }
    if (ch) { save(); updateWatchBadges(); }
  }

  /** Automatické kontroly: chvíli po startu a pak každých 30 min, jen v otevřeném a viditelném panelu. */
  function startAutoCheck() {
    const C = Alerts.CFG, tick = () => sched.cycle();
    setTimeout(tick, C.startMs);
    setInterval(tick, C.cycleMs);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      if (Date.now() - sched.lastCycle >= C.cycleMs) setTimeout(tick, 1500);
      observeSeen();
    });
    window.addEventListener('storage', e => { if (e.key === LS && syncWatches()) renderWatch(); });
    setInterval(() => $$('#watchList [data-ago]').forEach(el => { el.textContent = Alerts.agoTxt(Date.now() - +el.dataset.ago); }), 60e3);
  }

  /* ---------- živý radar na přehledu ---------- */
  function radarPayload() {
    const h = S.home;
    return { from: h.from.map(x => x.id), radiusKm: h.radius ?? 200, to: [], dateFrom: addDays(today(), 3), dateTo: addDays(today(), 45), trip: 'return', nightsMin: 2, nightsMax: 7, adults: 1, kmRate: 1.1 };
  }
  async function renderRadar(force) {
    const host = $('#radar');
    if (!S.home || !S.home.from?.length) {
      $('#radarSub').textContent = '';
      host.innerHTML = `<div class="card radar-setup"><div><b>Odkud obvykle létáš?</b><div class="muted" style="font-size:13px">Nastav výchozí místo a radar ti tu bude ukazovat nejlevnější lety z okolí na příštích 6 týdnů.</div></div><div class="place-input" id="radarFrom"></div><button class="btn primary" id="radarGo">Nastavit</button></div>`;
      const pi = new PlaceInput($('#radarFrom'), { origin: true, placeholder: 'Např. Brno, Praha, Vídeň…' });
      $('#radarGo').onclick = () => { if (!pi.items.length) return toast('Vyber místo ze seznamu', 'err'); S.home = { from: pi.items, radius: 200 }; save(); updateHomeChip(); if (fromInput && !fromInput.items.length) { fromInput.set(pi.items); } renderRadar(true); heroFrom && heroFrom.set(pi.items, true); };
      return;
    }
    const p = radarPayload();
    const key = JSON.stringify(p);
    $('#radarSub').textContent = `· ${S.home.from.map(x => x.label).join(', ')} +${S.home.radius ?? 200} km · zpáteční 2–7 nocí · příštích 6 týdnů`;
    $('#radarReload').onclick = () => renderRadar(true);
    if (!force && S.radar && S.radar.key === key && Date.now() - S.radar.at < 30 * 60e3) return paintRadar(S.radar);
    host.innerHTML = `<div class="radar-grid">${Array.from({ length: 8 }, () => '<div class="card radar-card skel"></div>').join('')}</div>`;
    busySearches++;
    try {
      const res = await runSearch(p);
      S.radar = { key, at: Date.now(), demo: res.demo, items: res.groups.slice(0, 12).map(g => ({ label: g.dest.label, cc: g.dest.cc, id: g.dest.id, czk: g.best.perPersonCzk, from: g.best.out.from, to: g.best.out.to, d1: g.best.out.date, d2: g.best.back?.date, deal: g.best.deal.level, prov: g.best.out.provider })) };
      save(); paintRadar(S.radar);
    } catch (e) {
      host.innerHTML = `<div class="note warn">⚠️ <div>Radar se nepodařilo načíst: ${esc(e.message)}</div></div>`;
    } finally { busySearches--; }
  }
  function paintRadar(r) {
    const host = $('#radar');
    if (!r.items.length) { host.innerHTML = '<div class="note info">ℹ️ <div>Na příštích 6 týdnů jsem z okolí nic nenašel. Zkus větší okruh.</div></div>'; return; }
    host.innerHTML = `${r.demo ? '<div class="faint" style="font-size:12px;margin-bottom:8px">⚠️ demo data</div>' : ''}<div class="radar-grid">${r.items.map((x, i) => `<div class="card radar-card ${x.deal === 'super' ? 'hot' : ''}" data-ri="${i}">
      <div class="rc-top"><span class="rcf">${flag(x.cc)}</span>${x.deal === 'super' ? '<span class="b hot">🔥</span>' : ''}</div>
      <div class="rc-city">${esc(x.label)}</div>
      <div class="rc-price">${czk(x.czk)}<small>/os.</small></div>
      <div class="faint" style="font-size:12px">${x.from} → ${x.to} · ${fmtDate(x.d1)}${x.d2 ? '–' + fmtDate(x.d2) : ''}</div>
    </div>`).join('')}</div><div class="faint" style="font-size:11.5px;margin-top:8px">Aktualizováno ${new Date(r.at).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })} · vč. dopravy na letiště · klikni pro všechny termíny</div>`;
    $$('[data-ri]', host).forEach(c => c.onclick = () => {
      const x = r.items[+c.dataset.ri];
      go('flights');
      setForm({ ...defaultForm(), from: S.home.from, radius: S.home.radius ?? 200, to: [{ id: x.id, label: x.label, flag: flag(x.cc) }], dFrom: addDays(today(), 3), dTo: addDays(today(), 45), nMin: 2, nMax: 7, len: 'custom', adults: 1 });
      startSearch();
    });
  }

  /* ---------- rychlé hledání (přehled) ---------- */
  function renderQuick() {
    const QF = [
      ['🌍', 'Kamkoliv nejlevněji', 'Celý svět z tvého okolí, příští 2 měsíce', { to: [] }],
      ['☀️', 'Za teplem', 'Kde bývá přes den 25 °C a víc · příští 2 měsíce', { to: [], minTemp: 25, trip: 'return', len: 'custom', nMin: 5, nMax: 10 }],
      ['🏙️', 'Víkend v Evropě', 'Čt/Pá–Ne/Po, příštích 6 týdnů', { to: [], len: 'weekend', dTo: addDays(today(), 45) }],
      ['🌏', 'Dálky a exotika', 'Thajsko, Bali, Emiráty, Maledivy…', { to: EXOTIC.slice(0, 6).map(cc => ({ id: 'cc:' + cc, label: byIso[cc]?.cs || cc, flag: flag(cc) })), len: 'custom', nMin: 7, nMax: 21, dTo: addDays(today(), 90) }],
      ['🏯', 'Asie', 'Thajsko, Vietnam, Japonsko, Bali, Srí Lanka…', { to: [{ id: 'ct:asia', label: 'Asie', flag: '🌏' }], len: 'custom', nMin: 7, nMax: 21, dTo: addDays(today(), 60) }],
      ['🦁', 'Afrika', 'Egypt, Maroko, Keňa, Zanzibar, Kapské Město…', { to: [{ id: 'ct:africa', label: 'Afrika', flag: '🌍' }], len: 'custom', nMin: 7, nMax: 16, dTo: addDays(today(), 60) }],
      ['🗽', 'Amerika', 'New York, Mexiko, Karibik, Kuba…', { to: [{ id: 'ct:namerica', label: 'Severní a Střední Amerika', flag: '🗽' }], len: 'custom', nMin: 7, nMax: 21, dTo: addDays(today(), 60) }],
    ];
    $('#quickFlights').innerHTML = QF.map((q, i) => `<div class="card dest" data-qf="${i}"><div class="flag">${q[0]}</div><div class="cname">${q[1]}</div><div class="cblurb">${q[2]}</div><div class="meta"><span class="chip accent">Hledat lety</span><span>→</span></div></div>`).join('');
    $$('[data-qf]').forEach(el => el.onclick = () => {
      const q = QF[+el.dataset.qf][3];
      go('flights');
      const base = { ...defaultForm(), ...(S.form || {}), from: (S.home?.from || fromInput.items), to: [], dFrom: addDays(today(), 3), dTo: addDays(today(), 60), dateMode: 'flex', minTemp: 0 };
      const f = { ...base, ...q };
      if (q.len && PRESETS[q.len]) Object.assign(f, { nMin: PRESETS[q.len].nMin, nMax: PRESETS[q.len].nMax, outDays: PRESETS[q.len].out, backDays: PRESETS[q.len].back });
      else if (q.nMin != null) Object.assign(f, { outDays: [], backDays: [] }); // vlastní počet nocí (dálkové lety)
      else Object.assign(f, { len: 'week', nMin: 3, nMax: 9, outDays: [], backDays: [] });
      setForm(f);
      if (!f.from.length) { toast('Zadej, odkud letíš'); fromInput.input.focus(); return; }
      startSearch();
    });
  }

  /* ---------- veřejné API pro app.js ---------- */
  function searchTo(items) {
    go('flights');
    const f = { ...defaultForm(), ...(S.form || {}), to: items };
    setForm(f);
    if (!f.from.length) { toast('Zadej, odkud letíš'); setTimeout(() => fromInput.input.focus(), 300); return; }
    startSearch();
  }

  function renderSources() {
    const box = $('#srcBox'); if (!box || !health) return;
    box.innerHTML = `<div class="src-t">Zdroje cen</div>` + health.providers.map(p => `<div class="src ${p.enabled ? 'on' : ''}" title="${esc(p.note || '')}${p.hint ? ' – ' + esc(p.hint) : ''}"><i style="background:${p.color}"></i>${esc(p.name)}<span>${p.enabled ? (p.blocked ? 'blokováno' : p.kind === 'cached' ? 'cache' : p.kind === 'demo' ? 'demo' : 'živě') : 'vypnuto'}</span></div>`).join('')
      + (health.providers.some(p => (p.id === 'travelpayouts' || p.id === 'liteapi') && !p.enabled)
        ? `<button type="button" class="linkbtn" id="tpHelp" style="margin-top:6px">➕ Zapnout ${health.providers.some(p => p.id === 'travelpayouts' && !p.enabled) ? 'všechny aerolinky' : 'hotely s cenami'}</button>` : '');
    const h = $('#tpHelp'); if (h) h.onclick = () => window.showSetupGuide(health.providers.some(p => p.id === 'travelpayouts' && !p.enabled) ? null : 'guideStays');
  }

  /** Návod: bezplatný token Travelpayouts = stovky dalších aerolinek (nízkonákladové i dálkové). */
  function showTpGuide() {
    modalOpen(`<div class="modal-hero"><div class="mh-bg"></div><button class="modal-close" onclick="modalClose()">${ico('M18 6L6 18M6 6l12 12')}</button>
      <div class="modal-hero-inner"><h2 style="font-size:23px">Zapnout všechny aerolinky a hotely</h2><div style="opacity:.85;font-size:13px">easyJet, Vueling, Lufthansa, Emirates, Qatar, Turkish… + hotely s hodnocením – zdarma, asi 5 minut</div></div></div>
      <div class="modal-body">
        <p class="muted" style="font-size:14px;margin-bottom:12px">Ryanair a Wizz Air ATLAS hledá přímo. Ostatní aerolinky (nízkonákladové i dálkové lety s přestupy) přidá bezplatný přístup k datům <b>Travelpayouts / Aviasales</b>:</p>
        <ol class="guide">
          <li>Zaregistruj se zdarma na <a href="https://www.travelpayouts.com/" target="_blank" rel="noopener">travelpayouts.com</a> (stačí e-mail).</li>
          <li>V profilu otevři <b>Profile → API token</b> (nebo Tools → API) a zkopíruj <b>API token</b>.</li>
          <li>Na <a href="https://dashboard.render.com/" target="_blank" rel="noopener">dashboard.render.com</a> otevři službu <b>atlas-letenky</b> → <b>Environment</b> → <b>Add Environment Variable</b>.</li>
          <li>Key: <code>TRAVELPAYOUTS_TOKEN</code>, Value: tvůj token → <b>Save Changes</b>. Render aplikaci za minutu sám restartuje.</li>
        </ol>
        <div class="note info" style="margin-top:12px">ℹ️ <div>Ceny z Travelpayouts pocházejí z hledání ostatních uživatelů za poslední dny – u výsledků jsou označené „z cache“ a před nákupem je ověř. Pokud budeš chtít z odkazů provize, doplň i <code>TRAVELPAYOUTS_MARKER</code> (tvoje partnerské ID).</div></div>
        <p class="muted" style="font-size:14px;margin:12px 0 8px"><b>Živé ceny všech aerolinek k vybranému letu</b> (Kiwi.com) jsou zapnuté samy – klíč nepotřebují.</p>
        <h3 id="guideStays" style="font-size:16px;margin:18px 0 8px">🏨 Hotely s cenou a hodnocením</h3>
        <ol class="guide">
          <li>Zaregistruj se zdarma na <a href="https://dashboard.liteapi.travel/" target="_blank" rel="noopener">dashboard.liteapi.travel</a>.</li>
          <li>V části <b>API Keys</b> zkopíruj klíč. <b>Sandbox</b> (začíná <code>sand_</code>) dává jen testovací hotely – pro skutečné ceny zapni <b>Production</b> (chce kartu, ale za hledání se neplatí).</li>
          <li>Na Renderu přidej proměnnou <code>LITEAPI_KEY</code> se zkopírovaným klíčem → <b>Save Changes</b>.</li>
        </ol>
        <p class="muted" style="font-size:13px">Bez klíče ATLAS u ubytování nabídne předvyplněné hledání na Booking.com (hodnocení 8+, od nejlevnějšího), Airbnb a Google Hotels.</p>
      </div>`);
  }
  window.showSetupGuide = (section) => {
    showTpGuide();
    if (section) setTimeout(() => { const el = document.getElementById(section); if (el) el.scrollIntoView({ block: 'start' }); }, 50);
  };

  async function init() {
    try {
      health = await api('api/health');
      for (const p of health.providers) PROV[p.id] = p;
      if (health.demo) $('#demoBanner').hidden = false;
    } catch (e) {
      toast('Server ATLAS neodpovídá – vyhledávání letů nepůjde', 'err');
    }
    PROV.travelpayouts = PROV.travelpayouts || { name: 'Ostatní aerolinky', color: '#ff6b00' };
    PROV.mix = { name: 'kombinace', color: '#5b8cff' };
    renderSources();
    buildForm();
    setForm(S.form || defaultForm());
    updateHomeChip();
    heroFrom = new PlaceInput($('#heroFrom'), { origin: true, placeholder: 'Brno, Vídeň, Česko…', dark: true, max: 3 });
    heroTo = new PlaceInput($('#heroTo'), { placeholder: 'kamkoliv 🌍', dark: true, max: 4 });
    heroFrom.set(S.home?.from || [], true);
    $('#heroSearch').onsubmit = e => {
      e.preventDefault();
      if (!heroFrom.items.length) { toast('Zadej, odkud letíš', 'err'); heroFrom.input.focus(); return; }
      go('flights');
      setForm({ ...defaultForm(), ...(S.form || {}), from: heroFrom.items, to: heroTo.items });
      startSearch();
    };
    updateWatchBadges();
    startAutoCheck();
  }

  window.Flights = { init, renderQuick, renderWatch, renderRadar, searchTo, repaintMap: () => { if (view.mode === 'map' && lastResult) rerender(true); }, PlaceInput, runSearch, watchStatTxt };
})();
