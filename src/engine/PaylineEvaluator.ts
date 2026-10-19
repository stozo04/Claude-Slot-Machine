import { MIN_MATCH, PAYLINES, PAYTABLE, type PayingSymbolId } from '../config/gameConfig';
import type { Grid, LineWin } from './types';

/**
 * PaylineEvaluator — evaluates the ACTUAL displayed grid against the 20 fixed paylines.
 *
 * Rules (also shown in the in-game Rules panel):
 *  • Symbols must match consecutively from reel 1 (leftmost) along the payline.
 *  • 3, 4 or 5 matching symbols pay. The longest run on a line pays; a line pays at most once.
 *  • BLANK never pays, and cannot start a winning run.
 *  • Wins on different paylines are added together.
 */
export function evaluateGrid(grid: Grid, paylines: readonly (readonly number[])[] = PAYLINES): LineWin[] {
  const wins: LineWin[] = [];
  paylines.forEach((rows, line) => {
    const first = grid[0][rows[0]];
    if (first === 'BLANK') return;
    let count = 1;
    while (count < grid.length && grid[count][rows[count]] === first) count++;
    if (count < MIN_MATCH) return;
    const multiplier = PAYTABLE[first as PayingSymbolId][count - MIN_MATCH];
    wins.push({
      line,
      symbol: first,
      count,
      multiplier,
      cells: Array.from({ length: count }, (_, reel) => ({ reel, row: rows[reel] })),
    });
  });
  return wins;
}
