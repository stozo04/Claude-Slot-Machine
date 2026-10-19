import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { actions, skipAnimation, startSpin, unlockAudio, useGame } from './store/gameStore';
import { animation } from './animation/AnimationController';
import { TopBar } from './ui/TopBar';
import { GameControls } from './ui/GameControls';
import { DepositModal } from './ui/DepositModal';
import { CashOutModal } from './ui/CashOutModal';
import { DOCK, DOCK_ICONS, PanelDrawer } from './ui/Panels';
import { WIN_TIERS } from './config/gameConfig';
import { money } from './utils/format';

const SlotMachine3D = lazy(() => import('./three/SlotMachine3D'));

function Toasts() {
  const toasts = useGame((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => <div key={t.id} className={`toast glass ${t.tone}`}>{t.text}</div>)}
    </div>
  );
}

/** Visually-hidden live region so screen-reader users hear each spin result. */
function ResultAnnouncer() {
  const last = useGame((s) => s.snapshot.data.history[0]);
  const text = last
    ? last.payout > 0
      ? `Spin ${last.id}: ${WIN_TIERS.find((t) => t.id === last.tier)?.label ?? 'Win'}, you won ${money(last.payout)} on ${last.winningLines} ${last.winningLines === 1 ? 'line' : 'lines'}.`
      : `Spin ${last.id}: no win.`
    : '';
  return <div className="sr-only" role="status" aria-live="polite" aria-atomic="true" aria-label="Reel result" data-testid="announcer">{text}</div>;
}

export default function App() {
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const panel = useGame((s) => s.panel);
  const depositOpen = useGame((s) => s.depositOpen);
  const cashOutOpen = useGame((s) => s.cashOutOpen);

  // Space spins (or skips the running animation) unless a control/dialog has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      const t = e.target as HTMLElement | null;
      if (t && t.closest('button, input, select, textarea, [role="dialog"], a')) return;
      const s = useGame.getState();
      if (s.depositOpen || s.cashOutOpen || s.panel) return;
      e.preventDefault();
      if (animation.isSpinning || animation.isPresentingWin) skipAnimation();
      else startSpin();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Browser autoplay policy: the first pointer/key gesture unlocks audio.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  return (
    <div className="app">
      <div className="stage" aria-hidden={false}>
        <Suspense fallback={null}>
          <SlotMachine3D onReady={onReady} />
        </Suspense>
      </div>
      {!ready && (
        <div className="loading" role="status">
          <div className="loader-ring" />
          <p>INITIALIZING NEURAL CORE</p>
        </div>
      )}
      <TopBar />
      <nav className="dock" aria-label="Information panels">
        {DOCK.map((d) => {
          const Icon = DOCK_ICONS[d.id as keyof typeof DOCK_ICONS];
          return (
            <button key={d.id} className={`dock-btn glass ${panel === d.id ? 'on' : ''}`} onClick={() => actions.openPanel(panel === d.id ? null : d.id)} aria-label={d.label} aria-pressed={panel === d.id} title={d.label} data-testid={`dock-${d.id}`}>
              <Icon size={18} />
              <span>{d.label.replace('Probability d', 'D')}</span>
            </button>
          );
        })}
      </nav>
      {panel && <PanelDrawer id={panel} />}
      <GameControls />
      <ResultAnnouncer />
      <Toasts />
      {depositOpen && <DepositModal />}
      {cashOutOpen && <CashOutModal />}
    </div>
  );
}
