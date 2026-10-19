import { DENOMINATIONS, DEPOSIT_OPTIONS, MULTIPLIERS, PAYLINE_COUNT } from '../config/gameConfig';
import { CreditWallet, InsufficientFundsError } from './CreditWallet';
import { totalBet, betPerLine } from './PayoutCalculator';
import { ProbabilityEngine } from './ProbabilityEngine';
import { evaluateGrid } from './PaylineEvaluator';
import { totalPayout } from './PayoutCalculator';
import { SessionManager, type CompletedSession, type StorageLike } from './SessionManager';
import type { SpinOutcome } from './types';

/**
 * GameEngine — the framework-free state machine:
 *
 *   IDLE → BET_PLACED → SPINNING → EVALUATING → PAYOUT → IDLE
 *
 * It owns the wallet, asks the ProbabilityEngine for the outcome, and guards every transition:
 *  • one debit per spin (a spin only starts from IDLE, and the spin id is single-use);
 *  • the outcome is chosen at spin start and re-validated against the grid before any credit;
 *  • each spin id settles exactly once, so stale animation callbacks and double clicks are no-ops.
 * Rendering is a pure consumer of these events.
 */
export type Phase = 'IDLE' | 'BET_PLACED' | 'SPINNING' | 'EVALUATING' | 'PAYOUT';
export type CashOutState = 'none' | 'pending' | 'ready';

export type SpinBlocker = 'busy' | 'cashing-out' | 'insufficient' | null;

export interface ActiveSpin {
  id: number;
  outcome: SpinOutcome;
  /** True when this spin was restored after a reload and settled without animation. */
  recovered?: boolean;
}

export interface EngineSnapshot {
  phase: Phase;
  wallet: ReturnType<CreditWallet['snapshot']>;
  denomination: number;
  multiplier: number;
  betPerLine: number;
  totalBet: number;
  lastWin: number;
  activeSpin: ActiveSpin | null;
  cashOut: CashOutState;
  spinBlocker: SpinBlocker;
  shortfall: number;
  sessionProfit: number;
  data: SessionManager['data'];
  revision: number;
}

export type EngineEvent =
  | { type: 'spin-started'; spin: ActiveSpin }
  | { type: 'spin-settled'; spin: ActiveSpin; payout: number }
  | { type: 'rejected'; reason: 'busy' | 'cashing-out' | 'insufficient' | 'invalid'; detail?: string }
  | { type: 'deposited'; amount: number }
  | { type: 'cash-out-ready' }
  | { type: 'cashed-out'; session: CompletedSession }
  | { type: 'recovered'; spin: ActiveSpin };

export class GameEngine {
  readonly wallet: CreditWallet;
  readonly session: SessionManager;
  private phase: Phase = 'IDLE';
  private active: ActiveSpin | null = null;
  private cashOutState: CashOutState = 'none';
  private lastWin = 0;
  private revision = 0;
  private readonly listeners = new Set<(snap: EngineSnapshot, event?: EngineEvent) => void>();

  constructor(
    storage: StorageLike | null,
    private readonly probability: ProbabilityEngine = new ProbabilityEngine(),
  ) {
    this.session = new SessionManager(storage);
    this.wallet = new CreditWallet(this.session.data.wallet);
    this.lastWin = this.session.data.stats.lastWin;
  }

  // ───── subscriptions ─────

  subscribe(listener: (snap: EngineSnapshot, event?: EngineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event?: EngineEvent) {
    this.revision++;
    this.persist();
    const snap = this.snapshot();
    this.listeners.forEach((l) => l(snap, event));
  }

  private persist() {
    const d = this.session.data;
    d.wallet = this.wallet.snapshot();
    // Once PAYOUT is reached the credit is already booked and recorded, so nothing is left to recover.
    const inFlight = this.phase === 'BET_PLACED' || this.phase === 'SPINNING' || this.phase === 'EVALUATING';
    d.pending = this.active && inFlight ? { id: this.active.id, outcome: this.active.outcome } : null;
    this.session.save();
  }

  // ───── queries ─────

  get currentPhase() {
    return this.phase;
  }

  spinBlocker(): SpinBlocker {
    if (this.phase !== 'IDLE') return 'busy';
    if (this.cashOutState !== 'none') return 'cashing-out';
    if (!this.wallet.canAfford(this.currentTotalBet())) return 'insufficient';
    return null;
  }

  currentTotalBet(): number {
    const d = this.session.data;
    return totalBet(d.denomination, d.multiplier);
  }

  snapshot(): EngineSnapshot {
    const d = this.session.data;
    const wallet = this.wallet.snapshot();
    const bet = this.currentTotalBet();
    return {
      phase: this.phase,
      wallet,
      denomination: d.denomination,
      multiplier: d.multiplier,
      betPerLine: betPerLine(d.denomination, d.multiplier),
      totalBet: bet,
      lastWin: this.lastWin,
      activeSpin: this.active,
      cashOut: this.cashOutState,
      spinBlocker: this.spinBlocker(),
      shortfall: Math.max(0, bet - wallet.balance),
      sessionProfit: wallet.balance - wallet.deposited,
      data: d,
      revision: this.revision,
    };
  }

  // ───── credits ─────

  deposit(dollars: number): boolean {
    if (!(DEPOSIT_OPTIONS as readonly number[]).includes(dollars)) return this.reject('invalid', 'Unsupported deposit amount');
    if (this.cashOutState !== 'none') return this.reject('cashing-out');
    this.wallet.deposit(dollars * 100);
    this.emit({ type: 'deposited', amount: dollars * 100 });
    return true;
  }

  // ───── betting ─────

  setDenomination(value: number): boolean {
    if (!(DENOMINATIONS as readonly number[]).includes(value)) return this.reject('invalid');
    if (this.phase !== 'IDLE') return this.reject('busy');
    this.session.data.denomination = value;
    this.emit();
    return true;
  }

  setMultiplier(value: number): boolean {
    if (!(MULTIPLIERS as readonly number[]).includes(value)) return this.reject('invalid');
    if (this.phase !== 'IDLE') return this.reject('busy');
    this.session.data.multiplier = value;
    this.emit();
    return true;
  }

  // ───── spin lifecycle ─────

  /** IDLE → BET_PLACED → SPINNING. Debits exactly once and fixes the outcome. */
  spin(): ActiveSpin | null {
    const blocker = this.spinBlocker();
    if (blocker) {
      this.reject(blocker);
      return null;
    }
    const d = this.session.data;
    const line = betPerLine(d.denomination, d.multiplier);
    this.phase = 'BET_PLACED';
    try {
      this.wallet.debit(line * PAYLINE_COUNT);
    } catch (e) {
      this.phase = 'IDLE';
      if (e instanceof InsufficientFundsError) {
        this.reject('insufficient');
        return null;
      }
      throw e;
    }
    const outcome = this.probability.spin(line, PAYLINE_COUNT);
    const id = ++d.spinCounter;
    this.lastWin = 0;
    this.active = { id, outcome };
    this.phase = 'SPINNING';
    this.emit({ type: 'spin-started', spin: this.active });
    return this.active;
  }

  /** The reels finished animating. SPINNING → EVALUATING → PAYOUT (credits exactly once). */
  reelsStopped(spinId: number): boolean {
    const spin = this.active;
    if (!spin || spin.id !== spinId || this.phase !== 'SPINNING') return false; // stale or duplicate callback
    this.phase = 'EVALUATING';
    // Validate before crediting: recompute from the displayed stops and compare to the drawn outcome.
    const grid = this.probability.resolve(spin.outcome.stops, spin.outcome.betPerLine, PAYLINE_COUNT);
    const payout = totalPayout(evaluateGrid(grid.grid), spin.outcome.betPerLine);
    if (payout !== spin.outcome.payout || this.session.data.settledSpinIds.includes(spinId)) {
      throw new Error(`Outcome validation failed for spin ${spinId}`);
    }
    this.wallet.credit(payout);
    this.session.recordSpin(spinId, spin.outcome);
    this.lastWin = payout;
    this.phase = 'PAYOUT';
    this.emit({ type: 'spin-settled', spin, payout });
    return true;
  }

  /** The win presentation is done (or skipped). PAYOUT → IDLE. */
  finishPayout(spinId: number): boolean {
    if (this.phase !== 'PAYOUT' || !this.active || this.active.id !== spinId) return false;
    this.phase = 'IDLE';
    this.active = null;
    if (this.cashOutState === 'pending') {
      this.cashOutState = 'ready';
      this.emit({ type: 'cash-out-ready' });
    } else this.emit();
    return true;
  }

  /** Settle a debited-but-unfinished spin found in storage after a reload. */
  recoverPendingSpin(): ActiveSpin | null {
    const pending = this.session.data.pending;
    if (!pending || this.phase !== 'IDLE') return null;
    if (this.session.data.settledSpinIds.includes(pending.id)) {
      this.session.data.pending = null; // already credited before the reload
      this.emit();
      return null;
    }
    this.active = { id: pending.id, outcome: pending.outcome, recovered: true };
    this.phase = 'SPINNING';
    if (!this.reelsStopped(pending.id)) return null;
    this.finishPayout(pending.id);
    this.emit({ type: 'recovered', spin: { id: pending.id, outcome: pending.outcome, recovered: true } });
    return { id: pending.id, outcome: pending.outcome, recovered: true };
  }

  // ───── cash out ─────

  /** Stops new spins; waits for any active spin to settle; then reports 'ready'. */
  requestCashOut(): boolean {
    if (this.cashOutState !== 'none') return false;
    if (this.wallet.snapshot().deposited === 0 && this.wallet.balance === 0) return this.reject('invalid', 'Nothing to cash out');
    if (this.phase === 'IDLE') {
      this.cashOutState = 'ready';
      this.emit({ type: 'cash-out-ready' });
    } else {
      this.cashOutState = 'pending';
      this.emit();
    }
    return true;
  }

  cancelCashOut() {
    if (this.cashOutState === 'none') return;
    this.cashOutState = 'none';
    this.emit();
  }

  /** Confirm: archive the session, reset the balance. No money moves — it is all fictional. */
  confirmCashOut(): CompletedSession | null {
    if (this.cashOutState !== 'ready' || this.phase !== 'IDLE') return null;
    const final = this.wallet.closeSession();
    const done = this.session.completeSession(final);
    this.cashOutState = 'none';
    this.lastWin = 0;
    this.emit({ type: 'cashed-out', session: done });
    return done;
  }

  private reject(reason: 'busy' | 'cashing-out' | 'insufficient' | 'invalid', detail?: string): false {
    const listeners = this.listeners;
    const snap = this.snapshot();
    listeners.forEach((l) => l(snap, { type: 'rejected', reason, detail }));
    return false;
  }
}
