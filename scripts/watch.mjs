#!/usr/bin/env node
// Upozornění do mobilu i se zavřeným ATLASem – spouští GitHub Actions (.github/workflows/watch.yml), notifikace
// posílá přes ntfy.sh (aplikace ntfy, zdarma a bez registrace):
//
//   node scripts/watch.mjs alerts   hlídané ceny z tajného ATLAS_WATCH (kód z tlačítka „📲 Hlídat i v mobilu“
//                                   v aplikaci) – při zlevnění o 3 % nebo pod cílovou cenou (stejně jako v aplikaci)
//   node scripts/watch.mjs tips     týdenní tip: nejlevnější víkendy z „Odkud obvykle létáš“ (z kódu, jinak Praha)
//   node scripts/watch.mjs health   jestli ATLAS hledá: server odpovídá, zkušební hledání vrací lety, dopravci bez chyb
//
// Hledá na živém serveru (ATLAS_URL, výchozí https://atlas-letenky.onrender.com) – ceny jsou stejné jako v aplikaci
// (tokeny Travelpayouts a LiteAPI má jen server); uspaný server nejdřív probudí. Bez NTFY_TOPIC (tajný název
// tématu) zprávy jen vypíše do logu. Co už bylo hlášeno, si pamatuje v souboru WATCH_STATE (mezi běhy actions/cache).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const DEFAULT_URL = 'https://atlas-letenky.onrender.com';
export const DEFAULT_HOME = { from: ['ap:PRG'], radiusKm: 200, label: 'Praha' };
const MAX_WATCHES = 12; // jako v aplikaci (Alerts.upsertWatch cap)
const MAX_CODE = 48000; // GitHub secret má nejvýš 48 kB

// Stejná pravidla jako hlídané ceny v aplikaci (public/js/alerts.js: kdy upozornit, kdy je termín pryč).
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(readFileSync(path.join(root, 'public', 'js', 'alerts.js'), 'utf8'), ctx, { filename: 'alerts.js' });
export const Alerts = ctx.window.Alerts;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
const ymd = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => ymd(new Date(Date.parse(s + 'T00:00:00Z') + n * 864e5));
const czk = (n) => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} Kč`;
const DOW = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];
const dm = (s) => { const d = new Date(s + 'T00:00:00Z'); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`; };

/**
 * Kód z aplikace (ATLAS_WATCH): „z“ + base64url(deflate-raw(JSON)) jako sdílené odkazy (krátký bez komprese jako
 * base64url JSON), nebo rovnou JSON.
 * → { watches: [{ id, label, p (dotaz na /api/search), target, czk, notified }], home }. Cizí vstup: jen známá pole.
 */
export function decodeWatch(code) {
  code = String(code || '').trim();
  if (!code) return { watches: [], home: null };
  if (code.length > MAX_CODE) throw new Error('kód je příliš dlouhý');
  let text = code;
  if (code[0] !== '{') {
    // jako sdílené odkazy (ShareLink.pack): „z“ + zkomprimované, krátký kód bez komprese jako base64url JSON („ey…“)
    if (!/^[A-Za-z0-9_-]+$/.test(code)) throw new Error('kód je poškozený');
    text = code[0] === 'z'
      ? zlib.inflateRawSync(Buffer.from(code.slice(1), 'base64url'), { maxOutputLength: 1 << 20 }).toString('utf8')
      : Buffer.from(code, 'base64url').toString('utf8');
  }
  const raw = JSON.parse(text);
  if (!raw || typeof raw !== 'object' || (raw.v != null && raw.v !== 1)) throw new Error('neznámý formát kódu');
  const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '');
  const watches = (Array.isArray(raw.w) ? raw.w : [])
    .filter((w) => w && typeof w === 'object' && w.p && typeof w.p === 'object' && !Array.isArray(w.p))
    .slice(0, MAX_WATCHES)
    .map((w, i) => ({
      id: str(String(w.id ?? i), 60) || String(i), label: str(w.label, 120) || 'Hlídané hledání', p: w.p,
      target: num(w.target), czk: num(w.czk), notified: num(w.notified),
    }));
  const h = raw.home && Array.isArray(raw.home.from) ? raw.home : null;
  const from = h ? h.from.filter((x) => typeof x === 'string' && x.length <= 80).slice(0, 8) : [];
  const radius = h && Number.isFinite(+h.radiusKm) ? Math.min(600, Math.max(0, Math.round(+h.radiusKm))) : DEFAULT_HOME.radiusKm;
  return { watches, home: from.length ? { from, radiusKm: radius, label: str(h.label, 80) || from.join(', ') } : null };
}

/** Termín hlídaného hledání už je celý pryč (jako Alerts.isPast, jen nad dotazem na server). */
export function isPastQuery(p, today) {
  if (p.trip === 'multi') return (p.legs || []).some((l) => l && l.date && l.date < today);
  if (p.exactOut) return p.exactOut < today;
  return !!p.dateTo && p.dateTo < today;
}

/** Nejlevnější nabídka výsledku → { czk (na osobu), desc } – stejně jako bestOf v aplikaci (flights.js). */
export function bestOf(res) {
  if (!res) return null;
  if (res.mode === 'multi') {
    const c = (res.combos || [])[0];
    if (!c) return null;
    return { czk: c.perPersonCzk, desc: c.picks.map((p, i) => { const l = res.legs[i].options[p].out; return `${dm(l.date)} ${l.from}→${l.to}`; }).join(' · ') };
  }
  const groups = (res.groups || []).filter((g) => g && g.best && num(g.best.perPersonCzk));
  if (!groups.length) return null;
  const g = groups.reduce((m, x) => (x.best.perPersonCzk < m.best.perPersonCzk ? x : m));
  const t = g.best;
  return { czk: t.perPersonCzk, desc: `${g.dest.label} · ${dm(t.out.date)}${t.back ? ' – ' + dm(t.back.date) : ''} · z ${t.out.from}` };
}

/** Probudí uspaný server (Render po 15 min bez provozu uspí): /api/health, dokud neodpoví, nejvýš ~4 min. */
export async function wake(base, { fetch = globalThis.fetch, sleep, tries = 8, log = () => {} } = {}) {
  let last = '';
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(60000) });
      if (r.ok) {
        const h = await r.json();
        if (h && h.ok) return h;
        last = 'odpověď bez ok';
      } else last = `HTTP ${r.status}`;
    } catch (e) {
      last = e.message;
    }
    log(`server zatím neodpovídá (${last}), zkusím znovu`);
    if (i < tries - 1) await sleep(30000);
  }
  throw new Error(`server neodpovídá (${last})`);
}

/** Hledání na serveru (NDJSON jako v aplikaci) → výsledek; chyba hledání → výjimka. */
export async function search(base, payload, { fetch = globalThis.fetch } = {}) {
  const r = await fetch(`${base}/api/search`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(240000),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 200)}`);
  let result = null, error = null;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let ev;
    try { ev = JSON.parse(line); } catch (e) { continue; }
    if (ev.type === 'result') result = ev.result;
    else if (ev.type === 'error') error = ev.error;
  }
  if (error) throw new Error(error);
  if (!result) throw new Error('server neposlal výsledek');
  return result;
}

/** Notifikace přes ntfy.sh (JSON – čeština v titulku projde); bez tématu jen do logu. */
export async function notify(msg, { topic, fetch = globalThis.fetch, log = console.log } = {}) {
  log(`📨 ${msg.title}\n${msg.message}`);
  if (!topic) return false;
  const r = await fetch('https://ntfy.sh/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, title: msg.title, message: msg.message, priority: msg.priority || 3, ...(msg.click ? { click: msg.click } : {}) }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`ntfy: HTTP ${r.status}`);
  return true;
}

/** Hlídané ceny: každé hledání znovu, upozornění podle Alerts.shouldNotify; stav (minulá a hlášená cena) v state.alerts. */
export async function runAlerts({ code, base, state, today, topic, fetch, sleep, log = console.log }) {
  const { watches } = decodeWatch(code);
  if (!watches.length) { log('ATLAS_WATCH není nastavený nebo nic nehlídá – není co kontrolovat.'); return { checked: 0, sent: 0 }; }
  await wake(base, { fetch, sleep, log });
  const seen = {};
  let checked = 0, sent = 0;
  for (const w of watches) {
    // klíč stavu = otisk hledání (stejné hledání = stejný klíč jako v aplikaci); trasy v mezipaměti GitHubu nejsou
    const key = createHash('sha256').update(Alerts.searchKey(w.p)).digest('hex').slice(0, 16);
    const st = (state.alerts || {})[key] || { last: w.czk, notified: w.notified };
    seen[key] = st;
    if (isPastQuery(w.p, today)) { log(`${w.label}: termín už proběhl – přeskakuji`); continue; }
    if (checked) await sleep(10000); // jako hlídání v aplikaci: hledání po jednom s pauzou (Wizz Air nemá rád dávky)
    let best;
    try {
      best = bestOf(await search(base, w.p, { fetch }));
      checked++;
    } catch (e) {
      log(`${w.label}: hledání selhalo (${e.message})`);
      continue;
    }
    if (!best) { log(`${w.label}: nic nenalezeno`); continue; }
    const why = Alerts.shouldNotify({ prev: st.last, cur: best.czk, target: w.target, notified: st.notified });
    log(`${w.label}: ${czk(best.czk)} (minule ${st.last ? czk(st.last) : '–'})${why ? ` → upozornění (${why})` : ''}`);
    if (why) {
      const pct = Alerts.pctChange(st.last, best.czk);
      await notify({
        title: why === 'target' ? `🎯 Pod tvým limitem: ${w.label}` : `📉 Zlevnilo: ${w.label}`,
        message: `${czk(best.czk)} na osobu${why === 'drop' && pct ? ` (${Alerts.fmtPct(pct)})` : w.target ? ` · limit ${czk(w.target)}` : ''}\n${best.desc}`,
        priority: why === 'target' ? 4 : 3, click: `${base}/#dashboard`, // Hlídané ceny jsou na Přehledu
      }, { topic, fetch, log });
      st.notified = best.czk;
      sent++;
    }
    st.last = best.czk;
  }
  state.alerts = seen; // smazaná hledání ze stavu vypadnou
  return { checked, sent };
}

/** Dotaz pro týdenní tip: zpáteční let na víkend (odlet pá/so, návrat ne/po, 1–3 noci) v příštích ~8 týdnech. */
export function tipsQuery(home, today) {
  return {
    from: home.from, radiusKm: home.radiusKm, to: [], dateFrom: addDays(today, 3), dateTo: addDays(today, 59), trip: 'return',
    nightsMin: 1, nightsMax: 3, outDays: [5, 6], backDays: [0, 1], adults: 1, kmRate: 1, groundMode: 'transit', arrival: true,
  };
}

/** Týdenní tip: nejlevnější víkendy z domova – jeden řádek na cíl. */
export async function runTips({ code, base, today, topic, fetch, sleep, log = console.log, top = 8 }) {
  let home = null;
  try { home = decodeWatch(code).home; } catch (e) { log(`ATLAS_WATCH nejde přečíst (${e.message}) – tip z Prahy`); }
  home = home || DEFAULT_HOME;
  await wake(base, { fetch, sleep, log });
  const res = await search(base, tipsQuery(home, today), { fetch });
  const rows = (res.groups || []).filter((g) => g && g.best && num(g.best.perPersonCzk))
    .sort((a, b) => a.best.perPersonCzk - b.best.perPersonCzk).slice(0, top);
  if (!rows.length) { log('Žádné víkendové lety – tip neposílám.'); return { sent: 0 }; }
  const lines = rows.map((g) => `${czk(g.best.perPersonCzk)} · ${g.dest.label} · ${dm(g.best.out.date)} – ${dm(g.best.back.date)} · z ${g.best.out.from}`);
  await notify({
    title: `✈️ Levné víkendy · ${home.label} +${home.radiusKm} km`,
    message: `Nejlevnější zpáteční na víkend v příštích 8 týdnech (na osobu, s dopravou na letiště):\n${lines.join('\n')}`,
    priority: 3, click: `${base}/#flights`, // běžná priorita – jednou týdně smí pípnout (nízká chodí potichu)
  }, { topic, fetch, log });
  return { sent: 1, rows: rows.length };
}

/** Zkušební hledání pro kontrolu: kamkoliv jedním směrem z Prahy za 10–24 dní (Ryanair a další dopravci). */
export const healthQuery = (today) => ({
  from: ['ap:PRG'], radiusKm: 0, to: [], trip: 'oneway', dateFrom: addDays(today, 10), dateTo: addDays(today, 24), adults: 1, kmRate: 0, groundMode: 'transit', arrival: false,
});

/**
 * Jestli ATLAS hledá. Server nebo hledání nefunguje → upozornit hned; chyba jednoho dopravce → až když trvá dvě
 * kontroly po sobě (Wizz Air občas jednorázově odmítne). Po opravě jedna zpráva „zase hledá“.
 */
export async function runHealth({ base, state, today, topic, fetch, sleep, log = console.log }) {
  const h = { streak: {}, alerted: [], ...(state.health || {}) };
  const issues = []; // { key, text } – znovu se hlásí, jen když přibude nový druh potíže (text chyby se mění)
  try {
    const info = await wake(base, { fetch, sleep, log });
    const res = await search(base, healthQuery(today), { fetch });
    if (!(res.groups || []).length) issues.push({ key: 'empty', text: 'zkušební hledání nevrátilo žádné lety' });
    const enabled = new Set((info.providers || []).filter((p) => p.enabled).map((p) => p.id));
    for (const p of res.providers || []) {
      if (!enabled.has(p.id)) continue;
      h.streak[p.id] = p.state === 'error' ? (h.streak[p.id] || 0) + 1 : 0;
      if (h.streak[p.id] >= 2) issues.push({ key: p.id, text: `${p.name || p.id}: ${p.error || 'chyba'} (už ${h.streak[p.id]}× po sobě)` });
    }
    log(`stav: ${(res.providers || []).map((p) => `${p.id} ${p.state} ${p.found}`).join(', ')}; nabídek ${(res.groups || []).length}`);
  } catch (e) {
    issues.unshift({ key: 'server', text: e.message });
  }
  const keys = issues.map((x) => x.key);
  let sent = 0;
  if (keys.some((k) => !h.alerted.includes(k))) {
    await notify({ title: '⚠️ ATLAS nehledá, jak má', message: `${issues.map((x) => x.text).join('\n')}\nNapiš Claudovi, ať se na to podívá.`, priority: 4, click: base }, { topic, fetch, log });
    sent++;
  } else if (!keys.length && h.alerted.length) {
    await notify({ title: '✅ ATLAS zase hledá', message: 'Zkušební hledání vrací lety a dopravci odpovídají.', priority: 2, click: base }, { topic, fetch, log });
    sent++;
  }
  h.alerted = keys;
  state.health = h;
  return { ok: !keys.length, issues: issues.map((x) => x.text), sent };
}

const loadState = (file) => { try { return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}; } catch (e) { return {}; } };

async function main(modes) {
  const env = process.env;
  const base = (env.ATLAS_URL || DEFAULT_URL).replace(/\/+$/, '');
  const file = env.WATCH_STATE || path.join(root, '.watch-state.json');
  const state = loadState(file);
  const opts = { code: env.ATLAS_WATCH, base, state, today: ymd(new Date()), topic: env.NTFY_TOPIC || '', fetch: globalThis.fetch, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };
  if (!opts.topic) console.log('::warning::Chybí secret NTFY_TOPIC – zprávy jen vypíšu do logu (návod v README, „Upozornění do mobilu“).');
  let failed = false;
  for (const mode of modes) {
    console.log(`== ${mode}`);
    try {
      const fn = { alerts: runAlerts, tips: runTips, health: runHealth }[mode];
      if (!fn) throw new Error(`neznámý režim „${mode}“ (alerts | tips | health)`);
      const out = await fn(opts);
      console.log(JSON.stringify(out));
      if (out && out.ok === false) { console.log(`::error::${mode}: ${out.issues.join('; ')}`); failed = true; }
    } catch (e) {
      console.log(`::error::${mode}: ${e.message}`);
      failed = true;
    }
  }
  writeFileSync(file, JSON.stringify(state));
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2).length ? process.argv.slice(2) : ['health', 'alerts']);
