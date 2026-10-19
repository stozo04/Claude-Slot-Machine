import gsap from 'gsap';
import { PAYLINES, REEL_COUNT, ROW_COUNT, SPIN_TIMING, type SymbolId, type WinTierId } from '../config/gameConfig';
import { reelEngine } from '../engine/ReelEngine';
import type { SpinOutcome } from '../engine/types';

/**
 * AnimationController — plays a pre-decided outcome back as motion. It never chooses anything.
 *
 * Reels advance along their virtual strip; at the start of the deceleration the strip coordinate is
 * re-based (invisible behind full-speed motion blur) so the reel glides the final stretch into the
 * exact stop selected by the ProbabilityEngine. Frame-rate and timing only change how it looks:
 * every reel is snapped to its exact integer stop when its timeline completes.
 *
 * The 3D scene reads this object's mutable fields every frame (no React re-renders).
 */

export interface ReelVisual {
  /** Strip coordinate at the centre row (continuous). Integer when at rest. */
  pos: number;
  /** Signed speed in cells/second (screen-speed, already multiplied by any skip time-scale). */
  vel: number;
  /** 0..1 vibration amplitude when a reel locks in. */
  shake: number;
  spinning: boolean;
}

export interface CellHighlight {
  /** 0..1 */
  level: number;
  symbol: SymbolId;
}

type Listener = (payload?: unknown) => void;

export interface SpinHandlers {
  onReelStop?: (reel: number) => void;
  onAllStopped: () => void;
}

const mod = (n: number, m: number) => ((n % m) + m) % m;

export class AnimationController {
  readonly reels: ReelVisual[] = Array.from({ length: REEL_COUNT }, () => ({ pos: 0, vel: 0, shake: 0, spinning: false }));
  /** highlight[reel][row] */
  readonly highlight: CellHighlight[][] = Array.from({ length: REEL_COUNT }, () => Array.from({ length: ROW_COUNT }, () => ({ level: 0, symbol: 'BLANK' as SymbolId })));
  /** Paylines currently drawn, and how brightly (0..1). */
  visibleLines: { line: number; symbol: SymbolId; level: number }[] = [];
  /** Neural energy: 0.25 idle → 1 while spinning / winning. */
  energy = 0.25;
  /** 0..1 camera pull-back for large wins. */
  cameraPull = 0;
  /** 0..1 NEURAL OVERLOAD intensity. */
  overload = 0;
  /** 0..1 spin-button lamp. */
  winPulse = 0;
  /** Current tier being presented (for particles / colour). */
  presentingTier: WinTierId = 'none';
  presentingSymbol: SymbolId | null = null;
  /** Bumped on each win presentation start so particle systems can re-emit. */
  burstCounter = 0;
  /** Cells that are part of a win in the current presentation. */
  winCells: { reel: number; row: number; symbol: SymbolId }[] = [];
  /** Count-up value (cents) shown on win displays. */
  winDisplay = { value: 0, target: 0 };
  timeScale = 1;
  reducedMotion = false;

  private spinTimeline: gsap.core.Timeline | null = null;
  private winTimeline: gsap.core.Timeline | null = null;
  private currentSpinId = -1;
  private listeners = new Map<string, Set<Listener>>();
  private energyTween: gsap.core.Tween | null = null;

  on(event: string, fn: Listener): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
    return () => this.listeners.get(event)?.delete(fn);
  }

  private emit(event: string, payload?: unknown) {
    this.listeners.get(event)?.forEach((fn) => fn(payload));
  }

  get isSpinning() {
    return this.reels.some((r) => r.spinning);
  }

  /** Put the reels at rest on the given stops (initial render, reload, recovery). */
  rest(stops: readonly number[]) {
    this.killAll();
    stops.forEach((s, i) => {
      this.reels[i].pos = s;
      this.reels[i].vel = 0;
      this.reels[i].shake = 0;
      this.reels[i].spinning = false;
    });
    this.clearHighlights();
    this.setEnergy(0.25, 0.6);
  }

  // ───────────────────────── spin ─────────────────────────

  playSpin(spinId: number, stops: readonly number[], handlers: SpinHandlers) {
    this.killAll();
    this.currentSpinId = spinId;
    this.clearHighlights();
    this.setEnergy(1, 0.5);
    const rm = this.reducedMotion;
    const speedScale = rm ? 0.5 : 1;
    const { accel, stopBase, stopStagger, decel, settle, cruiseCellsPerSecond } = SPIN_TIMING;
    const tl = gsap.timeline({ defaults: { ease: 'none' } });
    this.spinTimeline = tl;
    let stopped = 0;

    stops.forEach((stop, i) => {
      const reel = this.reels[i];
      const len = reelEngine.stripLength(i);
      const startDelay = i * 0.05 * speedScale;
      const arrive = (stopBase + i * stopStagger) * speedScale; // when decel completes
      const ta = accel * speedScale;
      const td = decel * speedScale;
      const ts = rm ? 0.2 : settle;
      const tc = Math.max(0.05, arrive - ta - td);
      const v = cruiseCellsPerSecond * (0.94 + 0.06 * Math.sin(i * 2.1 + 1)) / (rm ? 1.3 : 1);
      const dDec = (v * td) / 3;
      const p0 = reel.pos;
      const pCruiseEnd = p0 + v * (ta / 2 + tc);
      // Re-base so that decel ends exactly on `stop` (modulo strip length).
      const finalPos = pCruiseEnd + dDec + mod(stop - (pCruiseEnd + dDec), len);
      const decelStart = finalPos - dDec;
      const total = ta + tc + td + ts;
      const proxy = { t: 0 };
      let arrived = false;

      reel.spinning = true;
      tl.to(
        proxy,
        {
          t: total,
          duration: total,
          onUpdate: () => {
            const t = proxy.t;
            if (t < ta) {
              reel.pos = p0 + (v * t * t) / (2 * ta);
              reel.vel = (v * t) / ta;
            } else if (t < ta + tc) {
              reel.pos = p0 + (v * ta) / 2 + v * (t - ta);
              reel.vel = v;
            } else if (t < ta + tc + td) {
              const u = (t - ta - tc) / td;
              reel.pos = decelStart + dDec * (1 - (1 - u) ** 3);
              reel.vel = v * (1 - u) ** 2;
            } else {
              const u = Math.min(1, (t - ta - tc - td) / ts);
              if (!arrived) {
                arrived = true;
                reel.vel = 0;
                reel.shake = rm ? 0 : 1;
                if (this.currentSpinId === spinId) {
                  handlers.onReelStop?.(i);
                  this.emit('reel-stop', i);
                }
              }
              // Slight mechanical overshoot that settles back onto the stop.
              reel.pos = rm ? finalPos : finalPos + 0.11 * Math.sin(Math.PI * 2 * u) * (1 - u) ** 1.6;
              reel.shake = rm ? 0 : (1 - u) ** 2;
            }
            reel.vel *= this.timeScale;
          },
          onComplete: () => {
            reel.pos = mod(stop, len); // exact integer stop, whatever the frame rate did
            reel.vel = 0;
            reel.shake = 0;
            reel.spinning = false;
            stopped++;
            if (stopped === stops.length && this.currentSpinId === spinId) {
              this.spinTimeline = null;
              this.setEnergy(0.55, 0.8);
              handlers.onAllStopped();
            }
          },
        },
        startDelay,
      );
    });
    this.timeScale = 1;
    tl.timeScale(1);
  }

  /** Fast-forward the remaining spin (reels still stop left → right, outcome unchanged). */
  skipSpin() {
    if (!this.spinTimeline) return;
    this.timeScale = SPIN_TIMING.skipTimeScale;
    this.spinTimeline.timeScale(SPIN_TIMING.skipTimeScale);
  }

  // ───────────────────────── wins ─────────────────────────

  /** Present a settled win. Calls onDone once when finished or skipped. */
  playWin(outcome: SpinOutcome, onDone: () => void) {
    this.winTimeline?.kill();
    this.clearHighlights();
    const wins = outcome.wins;
    const tier = outcome.tier;
    this.presentingTier = tier;
    const dominant = wins.reduce<{ symbol: SymbolId; value: number } | null>((best, w) => (!best || w.multiplier > best.value ? { symbol: w.symbol, value: w.multiplier } : best), null);
    this.presentingSymbol = dominant?.symbol ?? null;
    this.winDisplay.value = 0;
    this.winDisplay.target = outcome.payout;
    this.burstCounter++;
    const rm = this.reducedMotion;
    const t = { small: 1.7, nice: 2.4, big: 3.6, mega: 4.8, overload: 7.2, none: 0 }[tier] * (rm ? 0.6 : 1);
    const countDur = Math.min(t * 0.7, tier === 'small' ? 0.9 : tier === 'nice' ? 1.4 : tier === 'big' ? 2.2 : tier === 'mega' ? 3 : 4.4);

    // Union of winning cells, tagged with the symbol that won there.
    const cellMap = new Map<string, SymbolId>();
    for (const w of wins) for (const c of w.cells) cellMap.set(`${c.reel}:${c.row}`, w.symbol);
    this.winCells = [...cellMap.entries()].map(([key, symbol]) => {
      const [reel, row] = key.split(':').map(Number);
      return { reel, row, symbol };
    });

    const tl = gsap.timeline({ onComplete: () => finish() });
    this.winTimeline = tl;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      tl.kill();
      this.winTimeline = null;
      this.winDisplay.value = this.winDisplay.target;
      this.emit('win-count', this.winDisplay.value);
      gsap.to(this, { cameraPull: 0, overload: 0, winPulse: 0, duration: 0.6, ease: 'power2.out' });
      this.visibleLines = [];
      this.fadeHighlights();
      this.setEnergy(0.25, 1.5);
      this.emit('win-end');
      onDone();
    };
    this.finishWin = finish;

    // 1. Everything lights up.
    this.visibleLines = wins.map((w) => ({ line: w.line, symbol: w.symbol, level: 0 }));
    const ramp = { k: 0 };
    tl.to(ramp, {
      k: 1,
      duration: 0.45,
      ease: 'power2.out',
      onUpdate: () => {
        cellMap.forEach((symbol, key) => {
          const [r, row] = key.split(':').map(Number);
          this.highlight[r][row].level = ramp.k;
          this.highlight[r][row].symbol = symbol;
        });
        this.visibleLines.forEach((l) => (l.level = ramp.k));
        this.winPulse = ramp.k;
      },
    });
    tl.add(() => this.emit('win-start', { tier, payout: outcome.payout }), 0);

    // 2. Count-up.
    tl.to(this.winDisplay, { value: outcome.payout, duration: countDur, ease: 'power2.out', onUpdate: () => this.emit('win-count', Math.round(this.winDisplay.value)) }, 0.1);

    // 3. Cinematic extras for big wins.
    if (!rm && (tier === 'mega' || tier === 'overload')) {
      tl.to(this, { cameraPull: tier === 'overload' ? 1 : 0.6, duration: 1.1, ease: 'power2.inOut' }, 0.1);
      tl.to(this, { cameraPull: 0, duration: 1.2, ease: 'power2.inOut' }, Math.max(1.4, t - 1.4));
    }
    if (tier === 'overload') {
      tl.to(this, { overload: 1, duration: 1.2, ease: 'power2.in' }, 0.1);
      tl.to(this, { overload: 0, duration: 1.6, ease: 'power2.out' }, t - 1.8);
    }

    // 4. Cycle individual lines (only worth it with several wins).
    if (wins.length > 1 && t > 2) {
      const cycleStart = 1.3;
      const per = Math.max(0.55, Math.min(1, (t - cycleStart - 0.2) / wins.length));
      wins.forEach((w, idx) => {
        tl.add(() => {
          this.visibleLines = [{ line: w.line, symbol: w.symbol, level: 1 }];
          this.clearHighlights();
          for (const c of w.cells) {
            this.highlight[c.reel][c.row].level = 1;
            this.highlight[c.reel][c.row].symbol = w.symbol;
          }
        }, cycleStart + idx * per);
      });
      tl.add(() => {
        this.visibleLines = wins.map((w) => ({ line: w.line, symbol: w.symbol, level: 0.7 }));
        cellMap.forEach((symbol, key) => {
          const [r, row] = key.split(':').map(Number);
          this.highlight[r][row].level = 0.8;
          this.highlight[r][row].symbol = symbol;
        });
      }, cycleStart + wins.length * per);
    }

    tl.to({}, { duration: t }, 0); // hold to total length
  }

  private finishWin: (() => void) | null = null;

  /** Skip the win presentation; credits are already booked, this just finishes the show. */
  skipWin() {
    if (this.winTimeline) this.finishWin?.();
  }

  get isPresentingWin() {
    return !!this.winTimeline;
  }

  // ───────────────────────── helpers ─────────────────────────

  private clearHighlights() {
    for (const col of this.highlight) for (const c of col) c.level = 0;
    this.visibleLines = [];
  }

  private fadeHighlights() {
    for (const col of this.highlight) for (const c of col) gsap.to(c, { level: 0, duration: 0.5 });
  }

  setEnergy(target: number, duration: number) {
    this.energyTween?.kill();
    this.energyTween = gsap.to(this, { energy: target, duration, ease: 'power2.out' });
  }

  killAll() {
    this.spinTimeline?.kill();
    this.winTimeline?.kill();
    this.spinTimeline = null;
    this.winTimeline = null;
    this.timeScale = 1;
    this.currentSpinId = -1;
    this.reels.forEach((r) => {
      r.spinning = false;
      r.vel = 0;
      r.shake = 0;
    });
    this.winPulse = 0;
    this.cameraPull = 0;
    this.overload = 0;
  }

  dispose() {
    this.killAll();
    this.energyTween?.kill();
    this.listeners.clear();
  }
}

export const animation = new AnimationController();
export { PAYLINES };
