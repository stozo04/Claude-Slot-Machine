import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAYLINES, PAYLINE_COUNT, PAYTABLE, PAYING_SYMBOLS, REEL_STRIPS, SYMBOLS, SYMBOL_IDS, type SymbolId } from '../src/config/gameConfig';
import { ReelEngine, reelEngine } from '../src/engine/ReelEngine';
import { evaluateGrid } from '../src/engine/PaylineEvaluator';
import { betPerLine, totalBet, totalPayout, winTier } from '../src/engine/PayoutCalculator';
import { ProbabilityEngine } from '../src/engine/ProbabilityEngine';
import { SeededRandom, SecureRandom } from '../src/engine/rng';
import { CreditWallet, InsufficientFundsError } from '../src/engine/CreditWallet';
import { GameEngine } from '../src/engine/GameEngine';
import type { StorageLike } from '../src/engine/SessionManager';
import { lineBreakdown, maximumPayout, simulate, symbolFrequencies, theoreticalRtp } from '../src/engine/analysis';
import type { Grid } from '../src/engine/types';

const memoryStorage = (): StorageLike & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
};
const uniform = (id: SymbolId, reels = 5): Grid => Array.from({ length: reels }, () => [id, id, id]);
const blankGrid = (): Grid => uniform('BLANK');

// ───────── reel strips & sampling ─────────

test('every reel strip has 100 stops built from the configured weights', () => {
  assert.equal(REEL_STRIPS.length, 5);
  for (const strip of REEL_STRIPS) {
    assert.equal(strip.length, 100);
    for (const id of SYMBOL_IDS) assert.equal(strip.filter((s) => s === id).length, SYMBOLS[id].weight, `${id} count`);
  }
  assert.equal(SYMBOL_IDS.reduce((n, id) => n + SYMBOLS[id].weight, 0), 100);
});

test('reels use different orderings', () => {
  assert.equal(new Set(REEL_STRIPS.map((s) => s.join())).size, 5);
});

test('stop → window mapping: centre = stop, top = stop+1, bottom = stop−1, wrapping', () => {
  const strip = REEL_STRIPS[0];
  assert.deepEqual(reelEngine.windowAt(0, 0), [strip[1], strip[0], strip[99]]);
  assert.deepEqual(reelEngine.windowAt(0, 99), [strip[0], strip[99], strip[98]]);
  assert.throws(() => reelEngine.gridFromStops([0, 0, 0, 0, 100]), RangeError);
});

test('secure sampling stays in range and covers every stop (rejection sampling is unbiased)', () => {
  const rng = new SecureRandom();
  for (const max of [1, 3, 7, 100]) for (let i = 0; i < 200; i++) assert.ok(rng.int(max) >= 0 && rng.int(max) < max);
  const counts = new Array(100).fill(0);
  const n = 200_000;
  for (let i = 0; i < n; i++) counts[rng.int(100)]++;
  const expected = n / 100;
  const chi = counts.reduce((s, c) => s + (c - expected) ** 2 / expected, 0);
  assert.ok(chi < 160, `chi-square ${chi} (df 99) is implausibly high`); // p ≈ 1e-4 cut-off
  assert.throws(() => rng.int(0), RangeError);
});

test('seeded RNG reproduces spins exactly; different seeds differ', () => {
  const a = new ProbabilityEngine(reelEngine, new SeededRandom(7));
  const b = new ProbabilityEngine(reelEngine, new SeededRandom(7));
  const c = new ProbabilityEngine(reelEngine, new SeededRandom(8));
  const seqA = Array.from({ length: 50 }, () => a.spin(100));
  assert.deepEqual(seqA, Array.from({ length: 50 }, () => b.spin(100)));
  assert.notDeepEqual(seqA, Array.from({ length: 50 }, () => c.spin(100)));
});

test('sampled stops are uniform per reel (seeded, chi-square)', () => {
  const engine = new ProbabilityEngine(reelEngine, new SeededRandom(99));
  const n = 100_000;
  const counts = Array.from({ length: 5 }, () => new Array(100).fill(0));
  for (let i = 0; i < n; i++) engine.drawStops().forEach((s, r) => counts[r][s]++);
  for (const reel of counts) {
    const chi = reel.reduce((s, c) => s + (c - n / 100) ** 2 / (n / 100), 0);
    assert.ok(chi < 160, `chi-square ${chi}`);
  }
});

// ───────── payline evaluation ─────────

test('there are exactly 20 distinct, valid paylines', () => {
  assert.equal(PAYLINES.length, 20);
  assert.equal(new Set(PAYLINES.map((p) => p.join())).size, 20);
  for (const line of PAYLINES) {
    assert.equal(line.length, 5);
    assert.ok(line.every((r) => r >= 0 && r <= 2));
  }
});

test('blank never pays; a full blank grid has no wins', () => {
  assert.deepEqual(evaluateGrid(blankGrid()), []);
  assert.deepEqual(evaluateGrid(uniform('BLANK')), []);
});

test('3, 4 and 5 of a kind pay the longest run once per line, matching the paytable', () => {
  for (const sym of PAYING_SYMBOLS) {
    for (const count of [3, 4, 5]) {
      const grid = blankGrid();
      for (let r = 0; r < count; r++) grid[r] = [sym, sym, sym];
      const wins = evaluateGrid(grid);
      assert.equal(wins.length, 20, `${sym}×${count} should win on all 20 lines`);
      for (const w of wins) {
        assert.equal(w.count, count);
        assert.equal(w.multiplier, PAYTABLE[sym][count - 3]);
        assert.equal(w.cells.length, count);
      }
      assert.equal(totalPayout(wins, 100), 20 * PAYTABLE[sym][count - 3] * 100);
    }
  }
});

test('fewer than 3 matches never pays; wins must start on reel 1; gaps break runs', () => {
  const two = blankGrid();
  two[0] = ['GROK', 'GROK', 'GROK'];
  two[1] = ['GROK', 'GROK', 'GROK'];
  assert.equal(evaluateGrid(two).length, 0);
  const offset = blankGrid();
  for (let r = 1; r < 5; r++) offset[r] = ['GROK', 'GROK', 'GROK'];
  assert.equal(evaluateGrid(offset).length, 0, 'run not starting on reel 1');
  const gap = uniform('CHATGPT');
  gap[2] = ['BLANK', 'BLANK', 'BLANK'];
  assert.equal(evaluateGrid(gap).length, 0, 'a blank in reel 3 stops the run at 2');
});

test('a line is evaluated along its own rows (single-line win, mixed symbols)', () => {
  // Payline 4 (index 3) is the V: rows 0,1,2,1,0 — place Anthropic exactly there and nothing else pays.
  const grid = blankGrid();
  [[0, 0], [1, 1], [2, 2], [3, 1], [4, 0]].forEach(([reel, row]) => (grid[reel][row] = 'ANTHROPIC'));
  const wins = evaluateGrid(grid);
  assert.equal(wins.length, 1);
  assert.equal(wins[0].line, 3);
  assert.equal(wins[0].count, 5);
  assert.equal(wins[0].multiplier, PAYTABLE.ANTHROPIC[2]);
});

test('overlapping wins add up consistently', () => {
  const grid = blankGrid();
  grid[0] = ['GROK', 'GROK', 'BLANK'];
  grid[1] = ['GROK', 'GROK', 'BLANK'];
  grid[2] = ['GROK', 'GROK', 'BLANK'];
  const wins = evaluateGrid(grid);
  // every payline staying on rows 0/1 for reels 1-3 wins 3×Grok at least
  const sum = wins.reduce((s, w) => s + w.multiplier, 0);
  assert.equal(sum, wins.length * PAYTABLE.GROK[0]);
  assert.ok(wins.length > 1);
});

// ───────── payouts & credits ─────────

test('bet maths: total bet = denomination × multiplier × 20 paylines (integer cents)', () => {
  assert.equal(totalBet(5, 5), 50_000); // $500
  assert.equal(totalBet(1, 1), 2_000);
  assert.equal(totalBet(10, 10), 200_000);
  assert.equal(betPerLine(5, 5), 2_500);
  assert.throws(() => betPerLine(1.1, 1), RangeError, 'fractional cents are refused');
});

test('win tiers scale with payout ÷ wager', () => {
  assert.equal(winTier(0, 100), 'none');
  assert.equal(winTier(50, 100), 'small');
  assert.equal(winTier(100, 100), 'nice');
  assert.equal(winTier(400, 100), 'big');
  assert.equal(winTier(1000, 100), 'mega');
  assert.equal(winTier(2500, 100), 'overload');
});

test('wallet: integer accounting, overdraft rejected, no partial mutation', () => {
  const w = new CreditWallet();
  w.deposit(100_000);
  w.debit(2_000);
  w.credit(4_500);
  assert.deepEqual(w.snapshot(), { balance: 102_500, deposited: 100_000, wagered: 2_000, won: 4_500 });
  assert.throws(() => w.debit(102_501), InsufficientFundsError);
  assert.equal(w.balance, 102_500);
  assert.throws(() => w.credit(1.5), RangeError);
  assert.throws(() => w.credit(-1), RangeError);
  assert.throws(() => w.deposit(0), RangeError);
  assert.throws(() => w.debit(Number.NaN), RangeError);
  assert.deepEqual(w.closeSession(), { balance: 102_500, deposited: 100_000, wagered: 2_000, won: 4_500 });
  assert.deepEqual(w.snapshot(), { balance: 0, deposited: 0, wagered: 0, won: 0 });
});

// ───────── game engine state machine ─────────

function forcedEngine(stopsQueue: number[][], storage: StorageLike | null = memoryStorage()) {
  let i = 0;
  const probability = new ProbabilityEngine(reelEngine, new SeededRandom(1));
  probability.drawStops = () => stopsQueue[i++ % stopsQueue.length];
  return new GameEngine(storage, probability);
}

test('spin lifecycle debits once, credits once, and walks the phases in order', () => {
  const engine = forcedEngine([[0, 0, 0, 0, 0]]);
  engine.deposit(1000);
  const phases: string[] = [];
  engine.subscribe((s) => phases.push(s.phase));
  const spin = engine.spin()!;
  assert.ok(spin);
  assert.equal(engine.wallet.balance, 100_000 - 2_000);
  assert.equal(engine.spin(), null, 'second click while spinning is rejected');
  assert.equal(engine.wallet.balance, 98_000, 'no double debit');
  assert.ok(engine.reelsStopped(spin.id));
  assert.equal(engine.reelsStopped(spin.id), false, 'duplicate callback ignored');
  assert.equal(engine.wallet.balance, 98_000 + spin.outcome.payout, 'paid exactly once');
  assert.equal(engine.currentPhase, 'PAYOUT');
  assert.equal(engine.spin(), null, 'cannot spin during payout');
  assert.ok(engine.finishPayout(spin.id));
  assert.equal(engine.finishPayout(spin.id), false);
  assert.equal(engine.currentPhase, 'IDLE');
  assert.deepEqual([...new Set(phases)], ['SPINNING', 'PAYOUT', 'IDLE']); // BET_PLACED/EVALUATING are transient within one call
});

test('stale callbacks for an old spin cannot settle a new spin', () => {
  const engine = forcedEngine([[0, 0, 0, 0, 0], [10, 20, 30, 40, 50]]);
  engine.deposit(1000);
  const a = engine.spin()!;
  engine.reelsStopped(a.id);
  engine.finishPayout(a.id);
  const b = engine.spin()!;
  assert.equal(engine.reelsStopped(a.id), false);
  assert.equal(engine.finishPayout(a.id), false);
  assert.equal(engine.currentPhase, 'SPINNING');
  assert.ok(engine.reelsStopped(b.id));
});

test('insufficient credits blocks the spin without touching the balance', () => {
  const engine = forcedEngine([[0, 0, 0, 0, 0]]);
  engine.deposit(100);
  engine.setDenomination(10);
  engine.setMultiplier(10); // $2,000
  assert.equal(engine.snapshot().spinBlocker, 'insufficient');
  assert.equal(engine.snapshot().shortfall, 200_000 - 10_000);
  assert.equal(engine.spin(), null);
  assert.equal(engine.wallet.balance, 10_000);
});

test('bet selectors are locked mid-spin and validate their inputs', () => {
  const engine = forcedEngine([[0, 0, 0, 0, 0]]);
  engine.deposit(1000);
  assert.equal(engine.setDenomination(3), false);
  assert.equal(engine.setMultiplier(2), false);
  assert.ok(engine.setDenomination(5));
  assert.ok(engine.setMultiplier(5));
  assert.equal(engine.snapshot().totalBet, 50_000);
  engine.spin();
  assert.equal(engine.setMultiplier(10), false);
  assert.equal(engine.deposit(7), false);
});

test('a known max-win stop set pays exactly the exact maximum', () => {
  const { lineBetMultiples, stops } = maximumPayout(reelEngine);
  const engine = forcedEngine([stops]);
  engine.deposit(1000);
  const spin = engine.spin()!;
  assert.equal(spin.outcome.payout, lineBetMultiples * 100, 'payout = multiples × $1 bet per line');
  engine.reelsStopped(spin.id);
  assert.equal(engine.wallet.balance, 100_000 - 2_000 + spin.outcome.payout);
});

test('cash out waits for the active spin, blocks new spins, then resets after confirmation', () => {
  const storage = memoryStorage();
  const engine = forcedEngine([[0, 0, 0, 0, 0]], storage);
  engine.deposit(500);
  const spin = engine.spin()!;
  assert.ok(engine.requestCashOut());
  assert.equal(engine.snapshot().cashOut, 'pending');
  assert.equal(engine.confirmCashOut(), null, 'cannot confirm while spinning');
  engine.reelsStopped(spin.id);
  assert.equal(engine.snapshot().cashOut, 'pending', 'still pending during payout');
  engine.finishPayout(spin.id);
  assert.equal(engine.snapshot().cashOut, 'ready');
  assert.equal(engine.spin(), null, 'no spins while cashing out');
  assert.equal(engine.deposit(100), false);
  const finalBalance = engine.wallet.balance;
  const done = engine.confirmCashOut()!;
  assert.equal(done.finalBalance, finalBalance);
  assert.equal(done.profit, finalBalance - 50_000);
  assert.equal(engine.wallet.balance, 0);
  assert.equal(engine.snapshot().data.sessions.length, 1);
  assert.equal(engine.snapshot().data.stats.spins, 0, 'fresh session');
  // persisted
  assert.equal(JSON.parse(storage.map.get('neural-jackpot:v2')!).sessions.length, 1);
});

test('session persists and restores; an in-flight spin is settled exactly once after a reload', () => {
  const storage = memoryStorage();
  const first = forcedEngine([[3, 9, 27, 41, 62]], storage);
  first.deposit(1000);
  first.setDenomination(5);
  const spin = first.spin()!; // "crash" before the animation finishes
  const expectedBalance = 100_000 - 10_000 + spin.outcome.payout;

  const second = forcedEngine([[0, 0, 0, 0, 0]], storage);
  assert.equal(second.wallet.balance, 100_000 - 10_000, 'wager was already debited');
  const recovered = second.recoverPendingSpin()!;
  assert.equal(recovered.id, spin.id);
  assert.equal(second.wallet.balance, expectedBalance);
  assert.equal(second.currentPhase, 'IDLE');
  assert.equal(second.snapshot().data.stats.spins, 1);

  const third = forcedEngine([[0, 0, 0, 0, 0]], storage);
  assert.equal(third.recoverPendingSpin(), null, 'nothing left to recover');
  assert.equal(third.wallet.balance, expectedBalance);
  assert.equal(third.snapshot().denomination, 5);
});

test('reload during the payout presentation does not pay twice', () => {
  const storage = memoryStorage();
  const first = forcedEngine([[18, 58, 43, 4, 40]], storage);
  first.deposit(1000);
  const spin = first.spin()!;
  first.reelsStopped(spin.id); // PAYOUT, credited — reload now
  const balance = first.wallet.balance;
  const second = forcedEngine([[0, 0, 0, 0, 0]], storage);
  assert.equal(second.recoverPendingSpin(), null);
  assert.equal(second.wallet.balance, balance);
});

test('corrupt storage is ignored safely', () => {
  const storage = memoryStorage();
  storage.setItem('neural-jackpot:v2', '{not json');
  const engine = forcedEngine([[0, 0, 0, 0, 0]], storage);
  assert.equal(engine.wallet.balance, 0);
});

// ───────── probability model ─────────

test('theoretical RTP is within the 93.5%–94.5% target band', () => {
  const rtp = theoreticalRtp();
  assert.ok(rtp >= 0.935 && rtp <= 0.945, `RTP ${rtp}`);
});

test('exact RTP formula agrees with brute-force enumeration over a reduced reel set', () => {
  // 3-stop mini strips on five reels (3^5 = 243 outcomes) so we can enumerate everything exactly.
  const mini: SymbolId[][] = [
    ['GROK', 'BLANK', 'GROK'],
    ['GROK', 'CHATGPT', 'BLANK'],
    ['GROK', 'GROK', 'BLANK'],
    ['GROK', 'BLANK', 'CHATGPT'],
    ['GROK', 'CHATGPT', 'GROK'],
  ];
  const engine = new ReelEngine(mini);
  let total = 0;
  let count = 0;
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++) for (let d = 0; d < 3; d++) for (let e = 0; e < 3; e++) {
    total += evaluateGrid(engine.gridFromStops([a, b, c, d, e])).reduce((s, w) => s + w.multiplier, 0);
    count++;
  }
  const empirical = total / count / PAYLINE_COUNT;
  assert.ok(Math.abs(empirical - theoreticalRtp(engine)) < 1e-12, `${empirical} vs ${theoreticalRtp(engine)}`);
});

test('symbol frequencies match the configured weights', () => {
  const f = symbolFrequencies();
  assert.equal(f.BLANK, 0.4);
  assert.equal(f.GEMINI, 0.03);
  const rows = lineBreakdown();
  assert.equal(rows.length, 5);
});

test('exact maximum payout is reproduced by the real evaluator', () => {
  const { lineBetMultiples, stops } = maximumPayout(reelEngine);
  const wins = evaluateGrid(reelEngine.gridFromStops(stops));
  assert.equal(wins.reduce((s, w) => s + w.multiplier, 0), lineBetMultiples);
  assert.ok(lineBetMultiples > 0);
});

test('100k-spin seeded simulation lands within 4 standard errors of theory and is reproducible', () => {
  const a = simulate(100_000, 12345);
  const b = simulate(100_000, 12345);
  assert.deepEqual(a, b);
  assert.ok(Math.abs(a.zScore) < 4, `z = ${a.zScore}`);
  assert.ok(Math.abs(a.symbolFrequency.BLANK - 0.4) < 0.005);
});
