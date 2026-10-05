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
  const WARM = ['ES', 'PT', 'IT', 'GR', 'CY', 'MT', 'TR', 'EG', 'MA', 'TN', 'HR'];
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
      openJaw: true, directOnly: false, outDays: [], backDays: [], exclude: [],
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
      exclude: originPreview.filter(a => a.off).map(a => a.iata),
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
    $$('#outDays button').forEach(b => b.classList.toggle('on', f.outDays.includes(+b.dataset.d)));
    $$('#backDays button').forEach(b => b.classList.toggle('on', f.backDays.includes(+b.dataset.d)));
    originPreview = []; pendingExclude = new Set(f.exclude || []);
    syncFormUI(); refreshOrigins();
  }
  let pendingExclude = new Set();
  function payloadOf(f) {
    const exact = f.dateMode === 'exact';
    return {
      from: f.from.map(x => x.id), to: f.to.map(x => x.id), radiusKm: f.radius,
      dateFrom: f.dFrom, dateTo: f.dTo, trip: f.trip, nightsMin: f.nMin, nightsMax: f.nMax,
      outDays: exact ? [] : f.outDays, backDays: exact ? [] : f.backDays, adults: f.adults, maxPrice: f.maxPrice ? +f.maxPrice : null,
      directOnly: f.directOnly, kmRate: f.ground ? f.kmRate : 0, openJaw: f.openJaw, exclude: f.exclude,
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
    $('#quickDest').innerHTML = [
      ['🌍 Kamkoliv', null, 'any'],
      ['☀️ Za teplem', WARM],
      ['🏙️ Evropa', null, 'eu'],
      ['🌏 Exotika', EXOTIC],
    ].map((q, i) => `<button type="button" class="qd" data-qd="${i}" ${q[2] === 'any' ? 'data-any="1"' : ''}>${q[0]}</button>`).join('');
    $$('#quickDest [data-qd]').forEach(b => b.onclick = () => {
      const i = +b.dataset.qd;
      if (i === 0) toInput.set([]);
      else if (i === 1) toInput.set(WARM.map(cc => ({ id: 'cc:' + cc, label: byIso[cc]?.cs || cc, flag: flag(cc) })));
      else if (i === 2) toInput.set([]);
      else toInput.set(EXOTIC.slice(0, 5).map(cc => ({ id: 'cc:' + cc, label: byIso[cc]?.cs || cc, flag: flag(cc) })));
      if (i === 2) toast('Evropa = kamkoliv; seřaď výsledky podle ceny 😉');
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
      return;
    }
    const summary = `<div class="res-head">
      <div><h2>${isRoute ? `✈️ ${destTxt}` : `🌍 ${res.groups.length} destinací ${res.destination.kind === 'countries' ? '· ' + destTxt : ''}`}</h2>
      <div class="muted" style="font-size:13px">z ${res.origins.map(o => `<b>${o.iata}</b>`).join(', ')} · ${whenTxt(res.query)} · ${res.query.adults} os.
      ${best ? ` · nejlevněji <b class="good">${czk(best.perPersonCzk)}</b>/os.` : ''}</div></div>
      <div class="res-tools">
        <select id="sortSel" title="Řazení">
          ${[['total', 'Nejlevnější celkem (vč. dopravy)'], ['flight', 'Nejlevnější letenka'], ['deal', 'Nejvýhodnější vůči běžné ceně'], ['season', 'Cena + ideální sezóna'], ['date', 'Nejdřívější odlet'], ['near', 'Nejblíž'], ['far', 'Nejdál']].map(o => `<option value="${o[0]}" ${view.sort === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}
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
      ${res.demo ? `<div class="note warn" style="margin-bottom:14px">⚠️ <div><b>DEMO data</b> – ceny i lety jsou vymyšlené, slouží jen k vyzkoušení aplikace.</div></div>` : ''}
      ${res.fx && res.fx.source === 'approx' && !res.demo ? `<div class="note warn" style="margin-bottom:14px">💱 <div>Kurzy měn se nepodařilo načíst – přepočet do Kč je orientační.</div></div>` : ''}
      <div class="faint rank-note">Pořadí určuje jen zvolené řazení (cena, termín, vzdálenost) – žádná aerolinka ani partner si za lepší pozici neplatí.${health?.affiliate ? ' Odkazy na Aviasales jsou partnerské (affiliate, <span class="ad-tag">reklama</span>): při nákupu přes ně může ATLAS dostat provizi, cenu to pro tebe nemění.' : ''}</div>`;

    let body = '';
    if (view.mode === 'map') body = `<div class="card res-map-card"><div id="resMap" class="res-map"></div><div class="map-legend"><span><i class="lg-dot" style="background:#34d399"></i>nejlevnější</span><span><i class="lg-dot" style="background:#fbbf24"></i>střední</span><span><i class="lg-dot" style="background:#fb7185"></i>dražší</span><span class="faint">klikni na bod → detail</span></div></div><div id="mapList"></div>`;
    else if (view.mode === 'cal' && isRoute) body = calendarHtml(res) + `<div class="section-head"><h2>Nejlepší kombinace${view.outDate ? ' · odlet ' + fmtDate(view.outDate) : ''}</h2></div>` + flatList(flat);
    else body = isRoute ? (groups.length > 1 ? `<div class="dest-mini">${groups.map(g => `<span class="chip">${flag(g.dest.cc)} ${esc(g.dest.label)} od <b>${czk(g.vis[0].perPersonCzk)}</b></span>`).join('')}</div>` : '') + flatList(flat) : groups.map(g => groupCard(g)).join('');
    if (!body.trim() || (view.mode === 'list' && !groups.length)) body += `<div class="empty">Filtrům nic neodpovídá. Uvolni filtr ceny, letišť nebo aerolinek.</div>`;
    host.innerHTML = summary + body + `<div class="res-foot faint">Ceny jsou za osobu bez zavazadel, vč. odhadu dopravy na letiště${res.query.kmRate ? ` (${res.query.kmRate} Kč/km)` : ' (vypnuto)'}. Živé ceny (Ryanair, Wizz Air) se mohou do rezervace změnit; ceny „z cache“ ověř. Kurz: ${res.fx ? `1 EUR = ${res.fx.eurCzk.toFixed(2)} Kč (${esc(res.fx.source)})` : '—'}.</div>`;
    wireResults();
    if (view.mode === 'map') drawResultMap(groups);
  }

  function emptyState(res) {
    const errs = res.providers.filter(p => p.error).map(p => `<li><b>${esc(provName(p.id))}:</b> ${esc(p.error)}</li>`).join('');
    const notes = res.providers.filter(p => p.note).map(p => `<li><b>${esc(provName(p.id))}:</b> ${esc(p.note)}</li>`).join('');
    return `<div class="card empty-res"><div class="ei">🧭</div><h2>Nic jsem nenašel</h2>
      <p class="muted">Z letišť ${res.origins.map(o => o.iata).join(', ')} jsem pro zadané termíny nenašel žádný let${res.destination.kind !== 'anywhere' ? ' do cíle ' + esc(res.destination.label) : ''}.</p>
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
    if (t.back && t.back.provider !== t.out.provider) out.push('<span class="b info" title="Dvě samostatné letenky – při zpoždění prvního letu druhá aerolinka nečeká">🔀 2 aerolinky</span>');
    const s = g ? seasonOk(g.dest.cc, t.out.date) : null;
    if (s === true) out.push('<span class="b good" title="Podle ATLAS je to ideální období pro tuto zemi">☀️ ideální sezóna</span>');
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
      <div class="pd">letenky ${czk(t.flightCzk)}${t.groundCzk ? ` + doprava ${czk(t.groundCzk)}` : ''}</div>
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
      .on('mousemove', (e, d) => { tip.innerHTML = `${flag(d.g.dest.cc)} ${esc(d.g.dest.label)} · <span style="color:var(--good)">${czk(d.t.perPersonCzk)}</span>`; tip.style.left = e.clientX + 'px'; tip.style.top = e.clientY + 'px'; tip.style.opacity = 1; })
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
    S.watch.unshift({ id: Date.now().toString(36), label: watchLabel(f), sub: f.dateMode === 'exact' ? whenTxt({ exact: { out: f.xOut, back: f.trip === 'return' ? f.xBack : null, flex: f.xFlex } }) : `${fmtDate(f.dFrom)}–${fmtDate(f.dTo)} · ${f.trip === 'return' ? `${f.nMin}–${f.nMax} nocí` : 'jen tam'}`, form: f, best: b, history: b ? [{ at: Date.now(), czk: b.czk }] : [], checked: Date.now() });
    S.watch = S.watch.slice(0, 12); save();
    toast('Hledání uloženo – cenu najdeš na Přehledu');
  }
  function renderWatch() {
    const list = S.watch || [];
    $('#watchHead').hidden = !list.length;
    $('#watchList').innerHTML = list.length ? `<div class="watch-grid">${list.map(w => {
      const h = w.history || []; const prev = h.length > 1 ? h[h.length - 2].czk : null; const cur = w.best?.czk;
      const diff = prev && cur ? cur - prev : 0;
      return `<div class="card watch" data-w="${w.id}">
        <div class="w-t">${esc(w.label)}</div><div class="faint" style="font-size:12px">${esc(w.sub)}</div>
        <div class="w-p">${cur ? czk(cur) : '—'}<small>/os.</small> ${diff ? `<span class="${diff < 0 ? 'good' : 'bad'}">${diff < 0 ? '↓' : '↑'} ${czk(Math.abs(diff))}</span>` : ''}</div>
        <div class="faint" style="font-size:12px">${esc(w.best?.desc || 'zatím bez výsledku')}</div>
        <div class="faint" style="font-size:11px">kontrola ${new Date(w.checked).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
        <div class="row" style="gap:6px;margin-top:10px"><button class="btn sm" data-wc="${w.id}">↻ Zkontrolovat</button><button class="btn sm ghost" data-wo="${w.id}">Otevřít</button><button class="btn sm ghost" data-wd="${w.id}" title="Smazat">✕</button></div>
      </div>`;
    }).join('')}</div>` : '';
    $$('[data-wc]').forEach(b => b.onclick = () => checkWatch(b.dataset.wc));
    $$('[data-wo]').forEach(b => b.onclick = () => { const w = S.watch.find(x => x.id === b.dataset.wo); go('flights'); setForm(w.form); startSearch(); });
    $$('[data-wd]').forEach(b => b.onclick = () => { S.watch = S.watch.filter(x => x.id !== b.dataset.wd); save(); renderWatch(); });
    $('#watchCheckAll').onclick = async () => { for (const w of S.watch) await checkWatch(w.id); };
  }
  async function checkWatch(id) {
    const w = S.watch.find(x => x.id === id); if (!w) return;
    const card = $(`[data-w="${id}"]`); if (card) card.classList.add('loading');
    try {
      const f = { ...defaultForm(), ...w.form };
      if (f.dFrom < today()) f.dFrom = today();
      if (f.dateMode === 'exact' && f.xOut < today()) { toast(`${w.label}: termín už proběhl`, 'err'); if (card) card.classList.remove('loading'); return; }
      const res = await runSearch(payloadOf(f));
      const b = bestOf(res);
      const prev = w.best?.czk;
      w.best = b; w.checked = Date.now(); if (b) w.history = [...(w.history || []), { at: Date.now(), czk: b.czk }].slice(-30);
      save();
      if (b && prev && b.czk < prev) toast(`📉 ${w.label}: cena klesla na ${czk(b.czk)}!`);
      else toast(`${w.label}: ${b ? czk(b.czk) : 'nic nenalezeno'}`);
    } catch (e) { toast(e.message, 'err'); }
    renderWatch();
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
    try {
      const res = await runSearch(p);
      S.radar = { key, at: Date.now(), demo: res.demo, items: res.groups.slice(0, 12).map(g => ({ label: g.dest.label, cc: g.dest.cc, id: g.dest.id, czk: g.best.perPersonCzk, from: g.best.out.from, to: g.best.out.to, d1: g.best.out.date, d2: g.best.back?.date, deal: g.best.deal.level, prov: g.best.out.provider })) };
      save(); paintRadar(S.radar);
    } catch (e) {
      host.innerHTML = `<div class="note warn">⚠️ <div>Radar se nepodařilo načíst: ${esc(e.message)}</div></div>`;
    }
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
      ['☀️', 'Za teplem', 'Španělsko, Portugalsko, Řecko, Kypr, Malta…', { to: WARM.map(cc => ({ id: 'cc:' + cc, label: byIso[cc]?.cs || cc, flag: flag(cc) })) }],
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
      const base = { ...defaultForm(), ...(S.form || {}), from: (S.home?.from || fromInput.items), to: [], dFrom: addDays(today(), 3), dTo: addDays(today(), 60), dateMode: 'flex' };
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
  }

  window.Flights = { init, renderQuick, renderWatch, renderRadar, searchTo, repaintMap: () => { if (view.mode === 'map' && lastResult) rerender(true); }, PlaceInput, runSearch };
})();
