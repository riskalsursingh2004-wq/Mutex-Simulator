/**
 * Seeded PRNG (mulberry32). The seed is stored inside the simulation state,
 * so an auto-mode run is fully reproducible for a given seed.
 *
 * nextRandom(seed) -> { value in [0,1), seed: nextSeed }
 */
export function nextRandom(seed) {
  const nextSeed = (seed + 0x6d2b79f5) | 0;
  let t = nextSeed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, seed: nextSeed };
}
