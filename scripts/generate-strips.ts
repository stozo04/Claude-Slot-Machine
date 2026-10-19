/**
 * One-off design tool: interleaves every symbol evenly around a 100-stop strip (weighted
 * round-robin with a seeded phase per symbol and per reel), so the five reels share the same
 * symbol counts but have different orderings. The output is pasted as plain literals into
 * src/config/gameConfig.ts — the config file, not this script, is the source of truth.
 */
import { mulberry32 } from '../src/engine/rng';

const COUNTS: Array<[string, number]> = [['*', 3], ['A', 7], ['M', 10], ['C', 15], ['G', 25], ['.', 40]];

function buildStrip(seed: number): string {
  const rng = mulberry32(seed);
  const items: Array<{ key: number; code: string }> = [];
  for (const [code, count] of COUNTS) {
    const phase = rng();
    for (let k = 0; k < count; k++) items.push({ key: (k + phase) / count + (rng() - 0.5) * 0.002, code });
  }
  items.sort((a, b) => a.key - b.key);
  return items.map((i) => i.code).join('');
}

[0x11, 0x2f, 0x47, 0x83, 0xa1].forEach((seed, i) => console.log(`  // reel ${i + 1}\n  '${buildStrip(seed)}',`));
