import { test } from 'node:test';
const P = await import('../server/lib/places.js');
test('tmp', async () => {
  for (const q of ['Amsterdam', 'Amsterodam', 'Singapur', 'Goa', 'Alexandria', 'Itálie', 'Amstrdam', 'Řím', 'Malta']) {
    console.log(q, JSON.stringify(P.localSuggestions(q, 4).map((s) => [s.id, s.type, s.label, s.en, s.cc, s.fuzzy, s.lat])));
    console.log('  geo', JSON.stringify((await P.geocode(q)).map((s) => [s.label, s.cc, s.pop])));
    console.log('  gp', JSON.stringify((await P.geocodePlaces(q)).map((s) => [s.label, s.cc, s.fuzzy])));
  }
});
