import { REEL_COUNT, REEL_STRIPS, ROW_COUNT, type SymbolId } from '../config/gameConfig';
import type { Grid } from './types';

/**
 * ReelEngine — knows the virtual reel strips and how a stop position maps to visible symbols.
 *
 * Stop N is shown on the centre row (row 1); N+1 on the top row (row 0); N−1 on the bottom row
 * (row 2). Strips wrap. The 3D reels use exactly the same mapping, so what you see is always the
 * grid that was evaluated.
 */
export class ReelEngine {
  constructor(private readonly strips: readonly (readonly SymbolId[])[] = REEL_STRIPS) {
    if (strips.length !== REEL_COUNT) throw new Error(`Expected ${REEL_COUNT} reel strips`);
  }

  get reelCount() {
    return this.strips.length;
  }

  stripLength(reel: number): number {
    return this.strips[reel].length;
  }

  strip(reel: number): readonly SymbolId[] {
    return this.strips[reel];
  }

  symbolAt(reel: number, index: number): SymbolId {
    const strip = this.strips[reel];
    return strip[((index % strip.length) + strip.length) % strip.length];
  }

  /** [top, middle, bottom] visible on a reel when it rests on `stop`. */
  windowAt(reel: number, stop: number): SymbolId[] {
    return Array.from({ length: ROW_COUNT }, (_, row) => this.symbolAt(reel, stop + 1 - row));
  }

  gridFromStops(stops: readonly number[]): Grid {
    if (stops.length !== this.strips.length) throw new Error('Stop count does not match reel count');
    return stops.map((stop, reel) => {
      if (!Number.isInteger(stop) || stop < 0 || stop >= this.strips[reel].length) {
        throw new RangeError(`Invalid stop ${stop} for reel ${reel}`);
      }
      return this.windowAt(reel, stop);
    });
  }

  /** Occurrences of each symbol on one reel strip. */
  symbolCounts(reel: number): Record<SymbolId, number> {
    const counts = { BLANK: 0, GROK: 0, CHATGPT: 0, MUSE: 0, ANTHROPIC: 0, GEMINI: 0 } as Record<SymbolId, number>;
    for (const id of this.strips[reel]) counts[id]++;
    return counts;
  }
}

export const reelEngine = new ReelEngine();
