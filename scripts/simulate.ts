/**
 * Simulation harness: `npm run simulate [spins] [seed]`.
 * Runs seeded Monte-Carlo spins through the real ReelEngine + PaylineEvaluator and compares the
 * empirical RTP with the exact theoretical RTP. Writes docs/simulation-report.json.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { PAYLINE_COUNT, PAYTABLE, PAYING_SYMBOLS } from '../src/config/gameConfig';
import { lineBreakdown, maximumPayout, simulate, symbolFrequencies, theoreticalRtp } from '../src/engine/analysis';

const spins = Number(process.argv[2] ?? 1_000_000);
const seed = Number(process.argv[3] ?? 20261019);

const started = Date.now();
const result = simulate(spins, seed);
const max = maximumPayout();
const pct = (x: number, d = 4) => `${(x * 100).toFixed(d)}%`;

console.log(`\nNEURAL JACKPOT — simulation (${spins.toLocaleString()} spins, seed ${seed}, ${((Date.now() - started) / 1000).toFixed(1)}s)\n`);
console.log(`Theoretical RTP : ${pct(theoreticalRtp())}`);
console.log(`Empirical RTP   : ${pct(result.empiricalRtp)}   (±${pct(result.standardError)} s.e.)`);
console.log(`95% CI          : ${pct(result.confidence95[0])} … ${pct(result.confidence95[1])}  → theory ${result.confidence95[0] <= result.theoreticalRtp && result.theoreticalRtp <= result.confidence95[1] ? 'INSIDE' : 'OUTSIDE'} interval (z = ${result.zScore.toFixed(2)})`);
console.log(`Hit frequency   : ${pct(result.hitFrequency, 2)} of spins pay something`);
console.log(`Max payout      : ${max.lineBetMultiples}× bet-per-line = ${(max.lineBetMultiples / PAYLINE_COUNT).toFixed(1)}× total bet (stops ${max.stops.join(',')}); max observed in run ${result.maxObservedMultiple.toFixed(1)}× total bet`);
console.log('\nWin distribution (return as a multiple of total wager):');
for (const [bucket, n] of Object.entries(result.distribution)) console.log(`  ${bucket.padEnd(9)} ${((n / spins) * 100).toFixed(3).padStart(8)}%   (${n.toLocaleString()})`);
console.log('\nSymbol frequency (visible cells) vs strip design:');
const design = symbolFrequencies();
for (const [id, f] of Object.entries(result.symbolFrequency)) console.log(`  ${id.padEnd(10)} observed ${pct(f, 3).padStart(8)}   design ${pct(design[id as keyof typeof design], 1)}`);
console.log('\nRTP by paytable row (exact):');
for (const row of lineBreakdown()) console.log(`  ${row.symbol.padEnd(10)} ×3 ${pct(row.rtp[0], 3).padStart(8)}  ×4 ${pct(row.rtp[1], 3).padStart(8)}  ×5 ${pct(row.rtp[2], 3).padStart(8)}   pays ${PAYTABLE[row.symbol].join(' / ')}`);
void PAYING_SYMBOLS;

mkdirSync('docs', { recursive: true });
writeFileSync('docs/simulation-report.json', JSON.stringify({ ...result, maximum: max, exactBreakdown: lineBreakdown() }, null, 2));
console.log('\nWrote docs/simulation-report.json');
