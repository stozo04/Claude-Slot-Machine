import { MIN_MATCH, PAYLINES, PAYLINE_COUNT, PAYING_SYMBOLS, PAYTABLE, REEL_COUNT, ROW_COUNT, SYMBOL_IDS, type PayingSymbolId, type SymbolId } from '../config/gameConfig';
import { evaluateGrid } from './PaylineEvaluator';
import { ReelEngine, reelEngine } from './ReelEngine';
import { mulberry32 } from './rng';

/**
 * Exact (closed-form) probability analysis, independent of any animation or sampling.
 *
 * Why a per-line formula is exact: every stop is uniform and independent, so for a fixed payline
 * the symbol on reel r is distributed exactly as that reel's strip frequencies, independently
 * across reels. Linearity of expectation then gives the exact total RTP as the sum over lines,
 * and RTP = (Σ lines E[line payout]) / (bet per line × 20 lines) = E[line payout] in line-bet units.
 */

export interface SymbolLineBreakdown {
  symbol: PayingSymbolId;
  /** Probability that a given payline pays exactly 3 / 4 / 5 of this symbol. */
  probability: [number, number, number];
  multiplier: readonly [number, number, number];
  /** Contribution to RTP (fraction of wager returned). */
  rtp: [number, number, number];
}

export function symbolFrequencies(reels: ReelEngine = reelEngine, reel = 0): Record<SymbolId, number> {
  const counts = reels.symbolCounts(reel);
  const total = reels.stripLength(reel);
  return Object.fromEntries(SYMBOL_IDS.map((id) => [id, counts[id] / total])) as Record<SymbolId, number>;
}

export function lineBreakdown(reels: ReelEngine = reelEngine): SymbolLineBreakdown[] {
  return PAYING_SYMBOLS.map((symbol) => {
    const p = Array.from({ length: REEL_COUNT }, (_, reel) => reels.symbolCounts(reel)[symbol] / reels.stripLength(reel));
    const probability = [3, 4, 5].map((n) => {
      let prob = 1;
      for (let r = 0; r < n; r++) prob *= p[r];
      if (n < REEL_COUNT) prob *= 1 - p[n]; // run must end: next reel must differ
      return prob;
    }) as [number, number, number];
    const multiplier = PAYTABLE[symbol];
    const rtp = probability.map((prob, i) => prob * multiplier[i]) as [number, number, number];
    return { symbol, probability, multiplier, rtp };
  });
}

/** Exact theoretical RTP as a fraction (0.94 = 94%). */
export function theoreticalRtp(reels: ReelEngine = reelEngine): number {
  return lineBreakdown(reels).reduce((sum, row) => sum + row.rtp[0] + row.rtp[1] + row.rtp[2], 0);
}

/**
 * Exact maximum payout in bet-per-line units, via exhaustive branch-and-bound over reel stops.
 * Returns the maximising stops too, so tests can verify it against the real evaluator.
 */
export function maximumPayout(reels: ReelEngine = reelEngine): { lineBetMultiples: number; stops: number[]; nodes: number } {
  const windows: { stop: number; cells: SymbolId[] }[][] = [];
  for (let reel = 0; reel < REEL_COUNT; reel++) {
    const seen = new Map<string, { stop: number; cells: SymbolId[] }>();
    for (let stop = 0; stop < reels.stripLength(reel); stop++) {
      const cells = reels.windowAt(reel, stop);
      const key = cells.join();
      if (!seen.has(key)) seen.set(key, { stop, cells });
    }
    windows.push([...seen.values()]);
  }
  const bestCell = PAYING_SYMBOLS.reduce((m, s) => Math.max(m, PAYTABLE[s][2]), 0);
  let best = -1;
  let bestStops: number[] = [];
  let nodes = 0;
  const grid: SymbolId[][] = [];
  const stops: number[] = [];

  const recurse = (reel: number) => {
    nodes++;
    if (reel === REEL_COUNT) {
      const total = evaluateGrid(grid).reduce((s, w) => s + w.multiplier, 0);
      if (total > best) {
        best = total;
        bestStops = [...stops];
      }
      return;
    }
    // Optimistic bound: lines whose prefix is still alive could at best pay a 5-of-a-kind of that symbol.
    let bound = 0;
    for (const rows of PAYLINES) {
      let alive = true;
      let symbol: SymbolId = grid[0]?.[rows[0]] ?? 'BLANK';
      if (reel > 0) {
        if (symbol === 'BLANK') alive = false;
        for (let r = 1; r < reel && alive; r++) if (grid[r][rows[r]] !== symbol) alive = false;
        if (alive) bound += PAYTABLE[symbol as PayingSymbolId][2];
      } else bound += bestCell;
    }
    if (bound <= best) return;
    for (const option of windows[reel]) {
      grid[reel] = option.cells;
      stops[reel] = option.stop;
      recurse(reel + 1);
    }
    grid.length = reel;
    stops.length = reel;
  };
  recurse(0);
  return { lineBetMultiples: best, stops: bestStops, nodes };
}

// ───────────────────────────── Simulation ─────────────────────────────

export interface SimulationResult {
  spins: number;
  seed: number;
  theoreticalRtp: number;
  empiricalRtp: number;
  standardError: number;
  confidence95: [number, number];
  zScore: number;
  hitFrequency: number;
  /** Return per spin in units of total wager. */
  distribution: Record<'loss' | 'under1x' | '1to2x' | '2to5x' | '5to20x' | '20to100x' | 'over100x', number>;
  maxObservedMultiple: number;
  symbolFrequency: Record<SymbolId, number>;
}

/** Monte-Carlo run through the real reel engine + evaluator. Seeded, so results are reproducible. */
export function simulate(spins: number, seed: number, reels: ReelEngine = reelEngine, onProgress?: (done: number) => void): SimulationResult {
  const rng = mulberry32(seed);
  const wagerUnits = PAYLINE_COUNT; // in bet-per-line units
  let sum = 0;
  let sumSq = 0;
  let hits = 0;
  let max = 0;
  const distribution = { loss: 0, under1x: 0, '1to2x': 0, '2to5x': 0, '5to20x': 0, '20to100x': 0, over100x: 0 };
  const symbolCounts = Object.fromEntries(SYMBOL_IDS.map((s) => [s, 0])) as Record<SymbolId, number>;
  const stops = new Array<number>(REEL_COUNT);
  for (let i = 0; i < spins; i++) {
    for (let r = 0; r < REEL_COUNT; r++) stops[r] = Math.floor(rng() * reels.stripLength(r));
    const grid = reels.gridFromStops(stops);
    for (const col of grid) for (const s of col) symbolCounts[s]++;
    const wins = evaluateGrid(grid);
    let payout = 0;
    for (const w of wins) payout += w.multiplier;
    const x = payout / wagerUnits; // return as a multiple of the total wager
    sum += x;
    sumSq += x * x;
    if (payout > 0) hits++;
    if (x > max) max = x;
    if (x === 0) distribution.loss++;
    else if (x < 1) distribution.under1x++;
    else if (x < 2) distribution['1to2x']++;
    else if (x < 5) distribution['2to5x']++;
    else if (x < 20) distribution['5to20x']++;
    else if (x < 100) distribution['20to100x']++;
    else distribution.over100x++;
    if (onProgress && (i + 1) % 50000 === 0) onProgress(i + 1);
  }
  const mean = sum / spins;
  const variance = Math.max(0, sumSq / spins - mean * mean);
  const standardError = Math.sqrt(variance / spins);
  const theory = theoreticalRtp(reels);
  const cells = spins * REEL_COUNT * ROW_COUNT;
  return {
    spins,
    seed,
    theoreticalRtp: theory,
    empiricalRtp: mean,
    standardError,
    confidence95: [mean - 1.96 * standardError, mean + 1.96 * standardError],
    zScore: standardError > 0 ? (mean - theory) / standardError : 0,
    hitFrequency: hits / spins,
    distribution,
    maxObservedMultiple: max,
    symbolFrequency: Object.fromEntries(SYMBOL_IDS.map((s) => [s, symbolCounts[s] / cells])) as Record<SymbolId, number>,
  };
}

export { MIN_MATCH };
