import type { SymbolId, WinTierId } from '../config/gameConfig';

/** grid[reel][row], row 0 = top. */
export type Grid = SymbolId[][];

export interface Cell {
  reel: number;
  row: number;
}

export interface LineWin {
  /** 0-based payline index. */
  line: number;
  symbol: SymbolId;
  /** Number of matching symbols from the left (3, 4 or 5). */
  count: number;
  /** Paytable multiplier of the bet per line. */
  multiplier: number;
  /** Winning cells in reel order. */
  cells: Cell[];
}

export interface SpinOutcome {
  /** Stop index per reel (the symbol shown on the centre row). Selected BEFORE any animation. */
  stops: number[];
  grid: Grid;
  wins: LineWin[];
  betPerLine: number;
  wager: number;
  payout: number;
  tier: WinTierId;
}

export interface SpinRecord {
  id: number;
  at: number;
  wager: number;
  payout: number;
  stops: number[];
  grid: SymbolId[][];
  winningLines: number;
  tier: WinTierId;
}
