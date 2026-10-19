import { REEL_STRIPS, type SymbolId } from '../config/gameConfig';
import { evaluateGrid } from './PaylineEvaluator';
import { betPerLine as lineBetFor, totalPayout, winTier } from './PayoutCalculator';
import { ReelEngine, reelEngine } from './ReelEngine';
import { SecureRandom, type RandomSource } from './rng';
import type { SpinOutcome } from './types';

/**
 * ProbabilityEngine — the only place an outcome is decided.
 *
 * Every reel stop is sampled uniformly (unbiased, crypto-secure by default) from that reel's
 * virtual strip. The odds depend on nothing else: not balance, bet size, streaks or history.
 * The resulting grid is evaluated with the same evaluator the rest of the game uses, and the
 * outcome is complete before any animation starts. Rendering only plays it back.
 */
export class ProbabilityEngine {
  constructor(
    private readonly reels: ReelEngine = reelEngine,
    private readonly rng: RandomSource = new SecureRandom(),
  ) {}

  drawStops(): number[] {
    return Array.from({ length: this.reels.reelCount }, (_, reel) => this.rng.int(this.reels.stripLength(reel)));
  }

  /** Resolve a spin for a given bet per line (cents). */
  spin(betPerLineCents: number, lines = 20): SpinOutcome {
    return this.resolve(this.drawStops(), betPerLineCents, lines);
  }

  /** Deterministically resolve known stops (used by validation, tests and recovery). */
  resolve(stops: number[], betPerLineCents: number, lines = 20): SpinOutcome {
    const grid = this.reels.gridFromStops(stops);
    const wins = evaluateGrid(grid);
    const payout = totalPayout(wins, betPerLineCents);
    const wager = betPerLineCents * lines;
    return { stops, grid, wins, betPerLine: betPerLineCents, wager, payout, tier: winTier(payout, wager) };
  }
}

export { lineBetFor as betPerLine };
export type { SymbolId };
export const defaultStrips = REEL_STRIPS;
