// Hledání míst bez data/places.json (chybějící nebo poškozený soubor po nasazení): našeptávač a Objevuj aspoň z vlastních
// dat a chyba jednou do logu – ne čtení a parsování 8 MB při každém dotazu. Vlastní soubor testu = vlastní proces
// (seznam míst se načítá jen jednou, v ostatních testech je už načtený).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const { config } = await import('../server/config.js');
const { suggest, geocodePlaces, geocode } = await import('../server/lib/places.js');

test('bez seznamu míst: návrhy a středy měst z vlastních dat, chyba v logu jednou', async () => {
  const root = config.root;
  const tmp = mkdtempSync(path.join(tmpdir(), 'atlas-places-'));
  const log = console.error;
  const errs = [];
  config.root = tmp; // data/places.json tu není
  console.error = (...a) => errs.push(a.join(' '));
  try {
    assert.deepEqual((await suggest('Brno')).map((s) => s.id.split('|')[0]), ['ap:BRQ', 'geo:49.1952,16.6080']);
    assert.equal((await geocodePlaces('Praha'))[0].label, 'Praha');
    await assert.rejects(geocode('Benátky'), /ENOENT/);
    assert.equal(errs.length, 1, errs.join('\n'));
    assert.match(errs[0], /data\/places\.json/);
  } finally {
    config.root = root;
    console.error = log;
    rmSync(tmp, { recursive: true, force: true });
  }
});
