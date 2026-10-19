/**
 * Random sources. The ProbabilityEngine only ever talks to the `RandomSource` interface, so the
 * production build uses crypto.getRandomValues while tests inject a seeded generator.
 */
export interface RandomSource {
  /** Uniform integer in [0, maxExclusive). Must be unbiased. */
  int(maxExclusive: number): number;
}

/** Small, fast, seedable PRNG (mulberry32). Returns floats in [0, 1). Tests / simulations only. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SeededRandom implements RandomSource {
  private next: () => number;
  constructor(seed: number) {
    this.next = mulberry32(seed);
  }
  int(maxExclusive: number): number {
    assertRange(maxExclusive);
    return Math.floor(this.next() * maxExclusive);
  }
}

/**
 * Cryptographically secure source with rejection sampling, so every stop is exactly uniform
 * (a plain `value % n` would favour low stops whenever 2^32 is not a multiple of n).
 */
export class SecureRandom implements RandomSource {
  private readonly buffer = new Uint32Array(1);
  int(maxExclusive: number): number {
    assertRange(maxExclusive);
    const cryptoApi = globalThis.crypto;
    if (!cryptoApi?.getRandomValues) {
      throw new Error('Secure random source unavailable: refusing to fall back to Math.random().');
    }
    const range = 0x100000000;
    const limit = range - (range % maxExclusive);
    let value: number;
    do {
      cryptoApi.getRandomValues(this.buffer);
      value = this.buffer[0];
    } while (value >= limit);
    return value % maxExclusive;
  }
}

function assertRange(maxExclusive: number) {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 0x100000000) {
    throw new RangeError(`Invalid random range: ${maxExclusive}`);
  }
}
