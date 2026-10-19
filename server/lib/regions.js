// Hranice oblastí, které jsou správním celkem (Toskánsko, Apulie, Istrie…; data/regions.json ze scripts/build-regions.mjs).
// Okruh „po Toskánsku“ se plánuje z kandidátů v kruhu kolem města oblasti; tady se z nich nechají jen ty uvnitř hranice.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REGIONS = JSON.parse(readFileSync(path.join(root, 'data', 'regions.json'), 'utf8')).regions;

export const hasRegion = (key) => Object.hasOwn(REGIONS, String(key || ''));

// paprsek na východ: lichý počet průsečíků s hranou = uvnitř (ring: [[lon, lat], …])
function inRing(ring, lat, lon) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Leží bod v oblasti? null = oblast bez známé hranice. */
export function inRegion(key, lat, lon) {
  if (!hasRegion(key)) return null;
  return REGIONS[key].polys.some((ring) => inRing(ring, lat, lon));
}

/**
 * Kandidáti jen z oblasti (+ ti, které si uživatel připnul). Když by jich zbylo méně než `min`, zůstane původní kruh –
 * méně cílů by okruh zkrátilo víc, než mu přesah za hranici uškodí. Příznaky pole (natureLoading…) se přenesou.
 */
export function keepInRegion(list, key, { min = 6, keep = () => false } = {}) {
  if (!hasRegion(key)) return list;
  const inside = list.filter((c) => keep(c) || inRegion(key, c.lat, c.lon));
  if (inside.length >= min) return Object.assign(inside, { natureLoading: list.natureLoading, descFailed: list.descFailed, degraded: list.degraded });
  return list;
}
