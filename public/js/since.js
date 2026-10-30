/* ATLAS – 🕘 Od minula: krátká karta nahoře na Přehledu, když se uživatel vrátí jiný den – co se od jeho poslední
   návštěvy změnilo pro něj: hlídaná cena zlevnila nebo je pod cílovou cenou, blíží se uložená cesta (i kdy se otevírá
   online check-in), radar má nové levné cíle, odložené nabídky propadly. Náhrada upozornění v telefonu: bez notifikací
   a bez dotazů na server – jen z toho, co už je uložené (historie hlídaných cen z kontrol, které aplikace dělá stejně,
   uložený radar, plánovač). Čistá logika bez DOM, aby šla testovat v node (test/since.test.js); karta je v app.js
   (renderSince), stav v localStorage 'atlas_since' = { last, from, at, hid, gone }. */
(function () {
  const CFG = {
    gap: 8 * 36e5, // návrat = jiný den a aspoň 8 h od minula (ne 23:50 → 0:10)
    hold: 12 * 36e5, // karta vydrží 12 h od návratu (aplikace zavřená telefonem a znovu otevřená ji neztratí)
    max: 3, // nejvýš řádků
    tripMin: 3, tripMax: 7, // cesta za 3–7 dní (dřív ji ukazuje karta 📍 Dnes na cestě)
    hidCap: 40, goneCap: 12,
  };
  const obj = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
  const num = v => (typeof v === 'number' && isFinite(v) && v > 0 ? v : null);
  const pad = n => String(n).padStart(2, '0');
  const isYmd = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d + 'T12:00:00Z'));
  const ymdMs = d => Date.parse(d + 'T12:00:00Z');
  const daysTo = (a, b) => Math.round((ymdMs(b) - ymdMs(a)) / 864e5);
  /** Místní den okamžiku ms ('YYYY-MM-DD'). */
  const dayOf = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  // pevné mezery: „út 3. 11.“ se na telefonu nerozdělí na „út 3.“ a „11.“ (jako dm v recs.js)
  const dm = d => `${+d.slice(8, 10)}.\u00a0${+d.slice(5, 7)}.`;
  const DOW = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];
  const dow = d => `${DOW[new Date(ymdMs(d)).getUTCDay()]}\u00a0${dm(d)}`;
  const V_DEN = ['v neděli', 'v pondělí', 'v úterý', 've středu', 've čtvrtek', 'v pátek', 'v sobotu'];
  // „733 Kč“ s pevnou mezerou jako czk() v app.js – na telefonu se „Kč“ neodtrhne
  const czk = n => Math.round(n).toLocaleString('cs-CZ') + ' Kč';
  const more = n => (n ? ` · a ${n} ${n <= 4 ? 'další' : 'dalších'}` : '');
  // čas z localStorage: věrohodný (od roku 2020) a ne z budoucnosti (hodiny jiného zařízení, zpětně posunuté hodiny)
  const okAt = (v, now) => Boolean(num(v)) && v >= Date.UTC(2020, 0, 1) && v <= now + 60e3;

  /** Kdy to bylo, vztaženo k now: „dnes“, „včera“, „v pondělí“ (do týdne), jinak „12. 10.“ – „než v pondělí“, „naposledy včera“. */
  function dayRef(ms, now) {
    const d = daysTo(dayOf(ms), dayOf(now)), x = new Date(ms);
    return d <= 0 ? 'dnes' : d === 1 ? 'včera' : d < 7 ? V_DEN[x.getDay()] : `${x.getDate()}. ${x.getMonth() + 1}.`;
  }

  /**
   * Otevření aplikace v now: návrat jiný den (aspoň CFG.gap od minula) otevře okno „Od minula“ se základem from =
   * poslední návštěva; během CFG.hold od návratu okno trvá (from zůstane), pak zmizí. Poprvé (bez last) nic – není
   * s čím srovnat. → { from (ms | null), fresh (právě otevřené okno), mem (nový stav k uložení – last = now) }.
   * hid = podpisy řádků skrytých ✕ (zůstanou, dokud se řádek nezmění); jen pro právě trvající okno gone = propadlé
   * odložené nabídky a shut = okno zavřené ✕ (= at; řádek „Od minula“ pod hledáním pak totéž neopakuje).
   */
  function gate(mem, now, cfg = CFG) {
    const m = obj(mem) ? mem : {}, last = okAt(m.last, now) ? m.last : null;
    let from = null, at = null;
    if (last && dayOf(last) !== dayOf(now) && now - last >= cfg.gap) { from = last; at = now; }
    else if (okAt(m.from, now) && okAt(m.at, now) && m.from <= m.at && now - m.at < cfg.hold) { from = m.from; at = m.at; }
    const fresh = at === now && from != null, same = Boolean(from) && !fresh;
    const hid = (Array.isArray(m.hid) ? m.hid : []).filter(s => typeof s === 'string' && s.length <= 400).slice(-cfg.hidCap);
    const gone = same && Array.isArray(m.gone) ? m.gone : [];
    return { from, fresh, mem: { last: now, ...(from ? { from, at } : {}), hid, ...(gone.length ? { gone } : {}), ...(same && m.shut === at ? { shut: at } : {}) } };
  }

  // místo pro hledání (Flights.searchTo): metropole nebo letiště z odložené nabídky
  const placeId = d => (typeof d.id === 'string' && /^(ap|metro):[A-Z0-9]{3}$/.test(d.id) ? d.id : typeof d.key === 'string' && /^[A-Z]{3}$/.test(d.key) ? 'ap:' + d.key : null);
  /**
   * Odložené nabídky (S.pins), kterým už proběhl odlet (před today) – aplikace je sama uklidí (Pins.alive), tak je
   * „Od minula“ zachytí před úklidem: prev (už zachycené v tomhle okně) + nové, každá jednou, nejvýš CFG.goneCap.
   * → [{ k, d1, label, id, cc }]
   */
  function gonePins(prev, pins, today) {
    const out = (Array.isArray(prev) ? prev : []).filter(x => obj(x) && typeof x.k === 'string' && isYmd(x.d1) && typeof x.label === 'string');
    for (const p of Array.isArray(pins) ? pins : []) {
      if (!obj(p) || typeof p.k !== 'string' || !obj(p.dest)) continue;
      const d1 = p.kind === 'r' ? obj(p.r) && p.r.d1 : obj(p.t) && obj(p.t.out) && p.t.out.date;
      if (!isYmd(d1) || !(d1 < today) || out.some(x => x.k === p.k)) continue;
      out.push({ k: p.k, d1, label: String(p.dest.label || p.dest.key || '').slice(0, 80), id: placeId(p.dest), cc: /^[A-Z]{2}$/.test(p.dest.cc || '') ? p.dest.cc : '' });
    }
    return out.slice(-CFG.goneCap);
  }

  /**
   * Hlídání, která od minulé návštěvy (from) zlevnila: cena při ní = poslední kontrola do from (jen se stejným
   * základem ceny – Alerts.epoch; po změně 🏠 vlastních cen nic), teď = poslední kontrola po from (ta, kterou aplikace
   * po otevření dělá stejně). Jen zlevnění aspoň o Alerts.CFG.seenPct %, ještě neviděné (seen – prohlédnutý seznam
   * nebo 📉 karta) a s termínem, který neproběhl (ani nabídka, která už odletěla – Alerts.bestGone); hit = od minula
   * kleslo pod cílovou cenu. skip = id hlídání, které už ukazuje velká 📉 karta. → [{ id, label, cur, base, at (kdy byla
   * cena base), d, hit, target }] (cíle napřed, pak největší zlevnění)
   */
  function watchNews(list, { from, today, skip = [], A = window.Alerts } = {}) {
    const pct = A.CFG.seenPct, sk = new Set(skip), out = [];
    for (const w of Array.isArray(list) ? list : []) {
      if (!obj(w) || !obj(w.best) || sk.has(w.id) || A.isPast(w.form, today) || A.bestGone(w, today)) continue;
      const cur = num(w.best.czk);
      if (!cur || !(num(w.checked) > from)) continue;
      const before = A.epoch(w.history).filter(p => obj(p) && num(p.at) && p.at <= from && num(p.czk)), b = before[before.length - 1];
      if (!b || cur > b.czk * (1 - pct / 100) || (num(w.seen) && cur >= w.seen)) continue;
      const t = num(w.target);
      out.push({ id: w.id, label: String(w.label || 'Hlídané hledání'), cur, base: b.czk, at: b.at, d: b.czk - cur, hit: Boolean(t && cur <= t && b.czk > t), target: t });
    }
    return out.sort((a, b) => b.hit - a.hit || b.d - a.d);
  }

  /**
   * Nejbližší uložená cesta, která začíná za CFG.tripMin–tripMax dní: kdy odlet (odjezd – vlak, bus, autem), kdy se
   * otevře online check-in prvního letu (Ics.checkin – Ryanair, Wizz Air s časem odletu), jinak kolik zbývá zařídit.
   * → { i, t, d, place, fly, checkin, todo } | null
   */
  function tripNews(trips, today, Ics = window.Ics) {
    let best = null;
    (Array.isArray(trips) ? trips : []).forEach((t, i) => {
      if (!obj(t) || !isYmd(t.start)) return;
      const d = daysTo(today, t.start);
      if (d >= CFG.tripMin && d <= CFG.tripMax && (!best || t.start < best.t.start)) best = { t, i, d };
    });
    if (!best) return null;
    const t = best.t, ok = v => (Array.isArray(v) ? v.filter(l => obj(l) && isYmd(l.date)) : []);
    const legs = ok(t.legs).sort((a, b) => String(a.dep || a.date).localeCompare(String(b.dep || b.date))), gs = ok(t.ground);
    // „odlet“ jen u cesty s letem (jako karta Dnes na cestě), jinak „odjezd“
    const ft = String(t.flight || '').trim(), w = obj(t.wizard) ? t.wizard : null;
    const fly = legs.length || gs.length ? legs.length > 0 : w ? !(obj(w.overland) && w.overland.on) : Boolean(ft) && !/^🚆/u.test(ft);
    const l = legs[0], c = l && l.dep && Ics && Ics.checkin ? Ics.checkin({ carrier: l.carrier, dep: l.dep, fromTz: l.fromTz }) : null;
    const todo = (Array.isArray(t.checklist) ? t.checklist : []).filter(x => obj(x) && !x.done && /^Zařídit/i.test(x.t || '')).length;
    const place = String((t.dest && t.dest !== '—' ? t.dest : t.name) || 'Cesta').split(',')[0].trim().slice(0, 60);
    return { i: best.i, t, d: best.d, place, fly: Boolean(fly), checkin: c && c.open && c.open.slice(0, 10) >= today ? c : null, todo };
  }

  /**
   * Nové cíle radaru od minula: uložený výsledek (karty, které radar ukazuje – bez 🙈) obnovený po from, karty
   * s newAt po from (radar je označí „nové“ jen proti minulému výsledku stejného dotazu – žádná výplň). Výsledek
   * s výpadkem zdroje (partial) ne. radar = { at, items, mode, partial } → { n, top, ids } | null
   */
  function radarNews(radar, from) {
    if (!obj(radar) || radar.partial || !Array.isArray(radar.items) || !(num(radar.at) > from)) return null;
    const fresh = radar.items.filter(x => obj(x) && num(x.newAt) > from && num(x.czk)).sort((a, b) => a.czk - b.czk);
    return fresh.length ? { n: fresh.length, top: fresh[0], ids: fresh.map(x => String(x.id || x.to)).sort() } : null;
  }

  /**
   * Řádky karty „Od minula“, nejdůležitější první, nejvýš max: 🎯 pod cílovou cenou, 📉 zlevnilo, ✈️ cesta za pár dní,
   * 📡 nové cíle radaru, 📌 propadlé odložené nabídky. Řádek skrytý ✕ (podpis sig v hid) se vrátí, až se změní.
   * x = { from, now, today, watch, skip, trips, radar, gone, hid } → [{ kind, sig, ico, b, t, go }], go = kam klepnutí
   * vede: { to: 'watch', id } | { to: 'trip', i } | { to: 'radar' } | { to: 'search', places } | { to: 'flights' }.
   */
  function digest(x, { A = window.Alerts, Ics = window.Ics } = {}) {
    const { from, now, today, watch = [], skip = [], trips = [], radar = null, gone = [], hid = [], max = CFG.max } = x || {};
    if (!num(from) || !num(now) || !isYmd(today)) return [];
    const lines = [];
    const ws = A ? watchNews(watch, { from, today, skip, A }) : [], hits = ws.filter(w => w.hit), drops = ws.filter(w => !w.hit);
    const sigW = l => l.map(w => `${w.id}@${w.cur}`).join(',');
    if (hits.length) {
      const h = hits[0];
      lines.push({ kind: 'hit', sig: 'h:' + sigW(hits), ico: '🎯', b: h.label, t: `teď ${czk(h.cur)} – pod tvou cenou ${czk(h.target)}${more(hits.length - 1)}`, go: { to: 'watch', id: h.id } });
    }
    if (drops.length) {
      const w = drops[0];
      lines.push({ kind: 'drop', sig: 'd:' + sigW(drops), ico: '📉', b: w.label, t: `o ${czk(w.d)} levněji než ${dayRef(w.at, now)} · teď ${czk(w.cur)}${more(drops.length - 1)}`, go: { to: 'watch', id: w.id } });
    }
    const tr = tripNews(trips, today, Ics);
    if (tr) {
      const c = tr.checkin, hm = c ? `${+c.open.slice(11, 13)}:${c.open.slice(14, 16)}` : '';
      lines.push({
        kind: 'trip', sig: `t:${tr.t.start}|${tr.place}`, ico: tr.fly ? '✈️' : '🧳', b: tr.place,
        t: `${tr.fly ? 'odlet' : 'odjezd'} za ${tr.d} ${tr.d <= 4 ? 'dny' : 'dní'} (${dow(tr.t.start)})${c ? ` · online check-in ${c.airline} od ${dow(c.open.slice(0, 10))} v ${hm}` : tr.todo ? ` · zbývá zařídit ${tr.todo}` : ''}`,
        go: { to: 'trip', i: tr.i },
      });
    }
    const r = radarNews(radar, from);
    if (r) {
      const wk = radar.mode === 'weekend', n = r.n;
      const what = n === 1 ? (wk ? 'nový levný víkend' : 'nový levný cíl') : n <= 4 ? (wk ? 'nové levné víkendy' : 'nové levné cíle') : (wk ? 'nových levných víkendů' : 'nových levných cílů');
      const lw = radar.mode === 'holiday' ? ' na prodloužený víkend' : '';
      const top = `${String(r.top.label || r.top.to || '')} za ${czk(r.top.czk)}`;
      lines.push({ kind: 'radar', sig: 'r:' + r.ids.join(','), ico: '📡', b: 'Radar', t: n === 1 ? `${what}${lw}: ${top}` : `${n} ${what}${lw} – nejlevnější ${top}`, go: { to: 'radar' } });
    }
    const g = Array.isArray(gone) ? gone.filter(p => obj(p) && typeof p.k === 'string' && isYmd(p.d1)) : [];
    if (g.length) {
      const names = [...new Set(g.map(p => p.label).filter(Boolean))], n = g.length;
      const places = [], seen = new Set();
      for (const p of g) if (p.id && !seen.has(p.id) && places.length < 4) { seen.add(p.id); places.push({ id: p.id, label: p.label, cc: p.cc || '' }); }
      lines.push({
        kind: 'pins', sig: 'p:' + g.map(p => p.k).sort().join(','), ico: '📌',
        b: names.length <= 2 ? names.join(' a ') : `${names.slice(0, 2).join(', ')} a další`,
        t: n === 1 ? `odložená nabídka na ${dm(g[0].d1)} už propadla – hledat nový termín` : `${n} ${n <= 4 ? 'odložené nabídky už propadly' : 'odložených nabídek už propadlo'} – hledat nové termíny`,
        go: places.length ? { to: 'search', places } : { to: 'flights' },
      });
    }
    const off = new Set(Array.isArray(hid) ? hid : []);
    return lines.filter(l => !off.has(l.sig)).slice(0, max);
  }

  window.Since = { CFG, dayOf, dayRef, gate, gonePins, watchNews, tripNews, radarNews, digest };
})();
