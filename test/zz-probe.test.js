// Hledání větou (public/js/smart.js): město bez diakritiky, malými nebo v místním tvaru („Milan“, „milano“, „do milana“)
// se pozná stejně jako „Milán“ – tvary ze Smart.stems a výběr Smart.bestPlace nad vlastními daty (jako flights.js resolvePlace).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const { localSuggestions } = await import('../server/lib/places.js');
const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
const plain = (x) => JSON.parse(JSON.stringify(x));
const ctx = { console, URLSearchParams };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['searchhelp.js', 'smart.js']) vm.runInContext(src(f), ctx, { filename: f });
const { Smart, SearchHelp: H } = ctx;
const today = '2026-10-22';
const parse = (t) => Smart.parse(t, { today, presets: {}, holidays: H.holidayList(today), holidayDates: H.holidayDates });
const place = (ph) => Smart.bestPlace(Smart.stems(ph).map((q) => ({ q, items: plain(localSuggestions(q, 8, { role: 'to' })), local: true })))?.id;

test('hledání větou: Milán i bez diakritiky, malými a jako Milano', () => {
  for (const t of ['Milán', 'do Milána', 'Milan', 'milan', 'Milano', 'milano', 'do Milana', 'do milana', 'milano v kvetnu']) {
    assert.equal(place(parse(t).to[0]), 'metro:MIL', t);
  }
  const r = parse('z prahy do milana');
  assert.deepEqual([place(r.from[0]), place(r.to[0])].map((id) => /\|Praha$|^ap:PRG$/.test(id) || id), [true, 'metro:MIL']);
  // jiná města bez háčků a čárek stejně
  assert.equal(place(parse('do Parize').to[0]), 'metro:PAR');
  assert.equal(place(parse('z Vidne do Rima').to[0]), 'metro:ROM');
  // „20.11. Řím nebo Milan“: druhý cíl jako s „Milán“
  assert.deepEqual(plain(parse('20.11. Řím nebo Milan, zpět 27.11.').to), ['Řím', 'Milan']);
});
