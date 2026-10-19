import { create } from 'zustand';
import { SETTINGS_KEY } from '../config/gameConfig';
import { animation } from '../animation/AnimationController';
import { sound } from '../audio/SoundManager';
import { GameEngine, type EngineEvent, type EngineSnapshot } from '../engine/GameEngine';
import { ProbabilityEngine } from '../engine/ProbabilityEngine';
import { reelEngine } from '../engine/ReelEngine';
import { SecureRandom } from '../engine/rng';
import type { CompletedSession } from '../engine/SessionManager';
import { money } from '../utils/format';

export type PanelId = 'paytable' | 'rules' | 'history' | 'stats' | 'diagnostics' | 'settings';
export type Quality = 'high' | 'balanced' | 'low';

export interface Settings {
  volume: number;
  muted: boolean;
  reducedMotion: boolean;
  quality: Quality;
}

export interface Toast {
  id: number;
  tone: 'info' | 'warn' | 'good';
  text: string;
}

interface UiState {
  snapshot: EngineSnapshot;
  settings: Settings;
  panel: PanelId | null;
  depositOpen: boolean;
  receipt: CompletedSession | null;
  cashOutOpen: boolean;
  toasts: Toast[];
  audioUnlocked: boolean;
  /** Bumps on each rejected spin so the console can flash the deposit button. */
  nudge: number;
}

const safeStorage = (() => {
  try {
    const s = window.localStorage;
    s.setItem('__probe', '1');
    s.removeItem('__probe');
    return s;
  } catch {
    return null;
  }
})();

export const engine = new GameEngine(safeStorage, new ProbabilityEngine(reelEngine, new SecureRandom()));

function loadSettings(): Settings {
  const prefersReduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const defaults: Settings = { volume: 0.6, muted: false, reducedMotion: prefersReduced, quality: coarse ? 'balanced' : 'high' };
  try {
    const raw = safeStorage?.getItem(SETTINGS_KEY);
    return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<Settings>) } : defaults;
  } catch {
    return defaults;
  }
}

let toastId = 0;

export const useGame = create<UiState>(() => ({
  snapshot: engine.snapshot(),
  settings: loadSettings(),
  panel: null,
  depositOpen: false,
  receipt: null,
  cashOutOpen: false,
  toasts: [],
  audioUnlocked: false,
  nudge: 0,
}));

const set = useGame.setState;

export function toast(text: string, tone: Toast['tone'] = 'info', ms = 4200) {
  const id = ++toastId;
  set((s) => ({ toasts: [...s.toasts.slice(-2), { id, tone, text }] }));
  setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}

// ───────────────────────── settings ─────────────────────────

function applySettings(s: Settings) {
  sound.setVolume(s.volume);
  sound.setMuted(s.muted);
  animation.reducedMotion = s.reducedMotion;
  try {
    safeStorage?.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function updateSettings(patch: Partial<Settings>) {
  const next = { ...useGame.getState().settings, ...patch };
  set({ settings: next });
  applySettings(next);
}

/** Must run from a user gesture: starts the AudioContext and the ambient bed. */
export function unlockAudio() {
  sound.unlock();
  if (!useGame.getState().audioUnlocked) {
    sound.startAmbient();
    set({ audioUnlocked: true });
  }
}

// ───────────────────────── game flow (engine ⇄ animation ⇄ audio) ─────────────────────────

function onEngineEvent(snap: EngineSnapshot, event?: EngineEvent) {
  set({ snapshot: snap });
  if (!event) return;
  switch (event.type) {
    case 'rejected':
      sound.denied();
      if (event.reason === 'insufficient') {
        const need = snap.shortfall;
        toast(
          snap.wallet.balance === 0
            ? 'No credits yet — deposit fictional credits to play.'
            : `You need ${money(need)} more for this bet. Lower the denomination or multiplier, or deposit more credits.`,
          'warn',
        );
        set((s) => ({ nudge: s.nudge + 1 }));
      } else if (event.reason === 'cashing-out') toast('Cash out in progress — new spins are paused.', 'info');
      else if (event.detail) toast(event.detail, 'warn');
      break;
    case 'deposited':
      sound.deposit();
      toast(`${money(event.amount)} of fictional credits added.`, 'good');
      break;
    case 'cash-out-ready':
      set({ cashOutOpen: true });
      break;
    case 'cashed-out':
      sound.cashOut();
      set({ receipt: event.session, cashOutOpen: true });
      break;
    case 'recovered':
      animation.rest(event.spin.outcome.stops);
      toast(`Recovered an interrupted spin${event.spin.outcome.payout ? ` — ${money(event.spin.outcome.payout)} credited` : ''}.`, 'info', 6000);
      break;
    default:
      break;
  }
}

engine.subscribe(onEngineEvent);

export function startSpin() {
  unlockAudio();
  const spin = engine.spin();
  if (!spin) return;
  const id = spin.id;
  sound.spinStart();
  sound.startReelLoop();
  sound.setAmbientIntensity(1);
  animation.playSpin(id, spin.outcome.stops, {
    onReelStop: (reel) => sound.reelStop(reel),
    onAllStopped: () => {
      sound.stopReelLoop();
      sound.setAmbientIntensity(0.2);
      if (!engine.reelsStopped(id)) return; // stale or duplicate callback
      if (spin.outcome.payout > 0) {
        sound.win(spin.outcome.tier);
        animation.playWin(spin.outcome, () => {
          engine.finishPayout(id);
        });
      } else {
        setTimeout(() => engine.finishPayout(id), 250);
      }
    },
  });
  // Poll reel speed for the spinning loop pitch while reels move.
  const tick = () => {
    if (!animation.isSpinning) return;
    const speeds = animation.reels.filter((r) => r.spinning);
    const maxV = Math.max(0, ...speeds.map((r) => r.vel));
    sound.updateReelLoop(Math.min(1, maxV / 40), speeds.length);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Space / skip button: fast-forward the spin or the win show. Never changes any outcome. */
export function skipAnimation() {
  if (animation.isSpinning) animation.skipSpin();
  else if (animation.isPresentingWin) animation.skipWin();
}

export const actions = {
  deposit(dollars: number) {
    unlockAudio();
    if (engine.deposit(dollars)) set({ depositOpen: false });
  },
  setDenomination(v: number) {
    unlockAudio();
    if (engine.setDenomination(v)) sound.detent([1, 5, 10].indexOf(v));
  },
  setMultiplier(v: number) {
    unlockAudio();
    if (engine.setMultiplier(v)) sound.detent([1, 5, 10].indexOf(v) + 1);
  },
  requestCashOut() {
    unlockAudio();
    if (engine.requestCashOut() && engine.snapshot().cashOut === 'pending') toast('Cash out requested — finishing the current spin…', 'info');
  },
  cancelCashOut() {
    engine.cancelCashOut();
    set({ cashOutOpen: false, receipt: null });
  },
  confirmCashOut() {
    engine.confirmCashOut();
  },
  closeReceipt() {
    set({ receipt: null, cashOutOpen: false });
  },
  openDeposit() {
    unlockAudio();
    sound.click();
    set({ depositOpen: true });
  },
  closeDeposit: () => set({ depositOpen: false }),
  openPanel(panel: PanelId | null) {
    unlockAudio();
    sound.click();
    set({ panel });
  },
  toggleMute() {
    unlockAudio();
    updateSettings({ muted: !useGame.getState().settings.muted });
  },
};

// ───────────────────────── boot ─────────────────────────

export function boot() {
  applySettings(useGame.getState().settings);
  const recovered = engine.recoverPendingSpin();
  const last = engine.snapshot().data.history[0];
  animation.rest(recovered?.outcome.stops ?? last?.stops ?? [7, 23, 41, 58, 76]);
  set({ snapshot: engine.snapshot() });
  if (import.meta.env.DEV) {
    // Dev-only test hooks (stripped from production builds). They never run in the shipped game.
    const prob = (engine as unknown as { probability: ProbabilityEngine }).probability;
    (window as unknown as Record<string, unknown>).__NEURAL__ = {
      engine,
      animation,
      sound,
      forceNext(stops: number[]) {
        const original = prob.drawStops.bind(prob);
        prob.drawStops = () => {
          prob.drawStops = original;
          return stops;
        };
      },
    };
  }
}
