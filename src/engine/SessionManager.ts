import { HISTORY_LIMIT, SESSION_HISTORY_LIMIT, STORAGE_KEY, SYMBOL_IDS, type SymbolId, type WinTierId } from '../config/gameConfig';
import type { WalletSnapshot } from './CreditWallet';
import type { SpinOutcome, SpinRecord } from './types';

export interface SessionStats {
  spins: number;
  hits: number;
  biggestWin: number;
  lastWin: number;
  /** Count of every symbol that has appeared in a displayed cell (15 per spin). */
  symbolCounts: Record<SymbolId, number>;
  tiers: Record<WinTierId, number>;
}

export interface CompletedSession {
  id: string;
  startedAt: number;
  endedAt: number;
  deposited: number;
  finalBalance: number;
  profit: number;
  wagered: number;
  won: number;
  spins: number;
  biggestWin: number;
}

export interface PendingSpin {
  id: number;
  outcome: SpinOutcome;
}

export interface PersistedGame {
  version: 2;
  sessionId: string;
  startedAt: number;
  wallet: WalletSnapshot;
  denomination: number;
  multiplier: number;
  stats: SessionStats;
  history: SpinRecord[];
  sessions: CompletedSession[];
  lifetime: { spins: number; wagered: number; won: number; deposited: number };
  spinCounter: number;
  pending: PendingSpin | null;
  settledSpinIds: number[];
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function emptyStats(): SessionStats {
  return {
    spins: 0,
    hits: 0,
    biggestWin: 0,
    lastWin: 0,
    symbolCounts: Object.fromEntries(SYMBOL_IDS.map((s) => [s, 0])) as Record<SymbolId, number>,
    tiers: { none: 0, small: 0, nice: 0, big: 0, mega: 0, overload: 0 },
  };
}

export const newSessionId = () => `S${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`.toUpperCase();

/**
 * SessionManager — the session ledger (stats, spin history, completed sessions) and persistence.
 * It records facts; it never decides outcomes or moves money.
 */
export class SessionManager {
  data: PersistedGame;

  constructor(
    private readonly storage: StorageLike | null,
    private readonly key: string = STORAGE_KEY,
    private readonly now: () => number = Date.now,
  ) {
    this.data = this.load() ?? this.fresh();
  }

  private fresh(): PersistedGame {
    return {
      version: 2,
      sessionId: newSessionId(),
      startedAt: this.now(),
      wallet: { balance: 0, deposited: 0, wagered: 0, won: 0 },
      denomination: 1,
      multiplier: 1,
      stats: emptyStats(),
      history: [],
      sessions: [],
      lifetime: { spins: 0, wagered: 0, won: 0, deposited: 0 },
      spinCounter: 0,
      pending: null,
      settledSpinIds: [],
    };
  }

  private load(): PersistedGame | null {
    try {
      const raw = this.storage?.getItem(this.key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PersistedGame;
      if (parsed?.version !== 2 || !parsed.wallet) return null;
      return { ...this.fresh(), ...parsed, stats: { ...emptyStats(), ...parsed.stats } };
    } catch {
      return null;
    }
  }

  save() {
    try {
      this.storage?.setItem(this.key, JSON.stringify(this.data));
    } catch {
      /* storage full / unavailable: the game keeps running in memory */
    }
  }

  recordSpin(id: number, outcome: SpinOutcome) {
    const record: SpinRecord = {
      id,
      at: this.now(),
      wager: outcome.wager,
      payout: outcome.payout,
      stops: outcome.stops,
      grid: outcome.grid,
      winningLines: outcome.wins.length,
      tier: outcome.tier,
    };
    const s = this.data.stats;
    s.spins++;
    s.lastWin = outcome.payout;
    if (outcome.payout > 0) s.hits++;
    if (outcome.payout > s.biggestWin) s.biggestWin = outcome.payout;
    s.tiers[outcome.tier]++;
    for (const col of outcome.grid) for (const sym of col) s.symbolCounts[sym]++;
    this.data.history = [record, ...this.data.history].slice(0, HISTORY_LIMIT);
    this.data.lifetime.spins++;
    this.data.lifetime.wagered += outcome.wager;
    this.data.lifetime.won += outcome.payout;
    this.data.settledSpinIds = [id, ...this.data.settledSpinIds].slice(0, 20);
  }

  /** Close the running session into history and start a fresh one. */
  completeSession(final: WalletSnapshot): CompletedSession {
    const done: CompletedSession = {
      id: this.data.sessionId,
      startedAt: this.data.startedAt,
      endedAt: this.now(),
      deposited: final.deposited,
      finalBalance: final.balance,
      profit: final.balance - final.deposited,
      wagered: final.wagered,
      won: final.won,
      spins: this.data.stats.spins,
      biggestWin: this.data.stats.biggestWin,
    };
    this.data.lifetime.deposited += final.deposited;
    this.data.sessions = [done, ...this.data.sessions].slice(0, SESSION_HISTORY_LIMIT);
    this.data.sessionId = newSessionId();
    this.data.startedAt = this.now();
    this.data.stats = emptyStats();
    this.data.history = [];
    return done;
  }
}
