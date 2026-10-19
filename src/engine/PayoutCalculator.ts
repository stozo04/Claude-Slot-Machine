import { CENTS, PAYLINE_COUNT, WIN_TIERS, type WinTierId } from '../config/gameConfig';
import type { LineWin } from './types';

/** All arithmetic is on integers (cents). Throws rather than ever producing a fractional amount. */
export function assertCents(value: number, label = 'amount'): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative integer (cents), got ${value}`);
  return value;
}

/** Bet per payline, in cents. */
export function betPerLine(denominationDollars: number, multiplier: number): number {
  return assertCents(denominationDollars * multiplier * CENTS, 'bet per line');
}

/** Total Bet = Denomination × Multiplier × 20 paylines, in cents. */
export function totalBet(denominationDollars: number, multiplier: number, lines = PAYLINE_COUNT): number {
  return betPerLine(denominationDollars, multiplier) * lines;
}

export function linePayout(win: Pick<LineWin, 'multiplier'>, betPerLineCents: number): number {
  return assertCents(win.multiplier * betPerLineCents, 'line payout');
}

export function totalPayout(wins: readonly LineWin[], betPerLineCents: number): number {
  return wins.reduce((sum, win) => sum + linePayout(win, betPerLineCents), 0);
}

/** Presentation tier from payout relative to the wager (cosmetic only). */
export function winTier(payout: number, wager: number): WinTierId {
  if (payout <= 0) return 'none';
  const multiple = payout / wager;
  return WIN_TIERS.find((tier) => multiple >= tier.minMultiple)?.id ?? 'small';
}
