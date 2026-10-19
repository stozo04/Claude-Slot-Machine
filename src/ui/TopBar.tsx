import { Settings, Volume2, VolumeX, Cpu } from 'lucide-react';
import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { actions, updateSettings, useGame } from '../store/gameStore';
import { money } from '../utils/format';

/** Balance that rolls to its new value instead of jumping. */
export function RollingMoney({ cents, testId, className }: { cents: number; testId?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef({ v: cents });
  const reduced = useGame((s) => s.settings.reducedMotion);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced || Math.abs(shown.current.v - cents) < 1) {
      shown.current.v = cents;
      el.textContent = money(cents);
      return;
    }
    const tween = gsap.to(shown.current, {
      v: cents,
      duration: Math.min(1.4, 0.4 + Math.abs(cents - shown.current.v) / 200000),
      ease: 'power2.out',
      onUpdate: () => {
        el.textContent = money(Math.round(shown.current.v));
      },
      onComplete: () => {
        el.textContent = money(cents);
      },
    });
    return () => {
      tween.kill();
    };
  }, [cents, reduced]);
  return <span ref={ref} data-testid={testId} className={className}>{money(cents)}</span>;
}

export function TopBar() {
  const snap = useGame((s) => s.snapshot);
  const settings = useGame((s) => s.settings);
  const profit = snap.sessionProfit;
  return (
    <header className="topbar glass" data-topbar>
      <div className="brand">
        <Cpu size={20} aria-hidden />
        <div>
          <h1>NEURAL JACKPOT</h1>
          <span>THE AI WARS · play money only</span>
        </div>
      </div>
      <div className="stats">
        <div className="stat">
          <label>Balance</label>
          <RollingMoney cents={snap.wallet.balance} testId="balance" className="num" />
        </div>
        <div className="stat">
          <label>Session P/L</label>
          <span data-testid="profit" className={`num ${profit > 0 ? 'pos' : profit < 0 ? 'neg' : ''}`}>{money(profit, { signed: true })}</span>
        </div>
        <div className="stat hide-sm">
          <label>Last win</label>
          <span data-testid="last-win" className="num">{money(snap.lastWin)}</span>
        </div>
      </div>
      <div className="top-actions">
        <button className="icon-btn" onClick={actions.toggleMute} aria-pressed={settings.muted} aria-label={settings.muted ? 'Unmute sound' : 'Mute sound'} title={settings.muted ? 'Unmute' : 'Mute'}>
          {settings.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <input
          className="volume hide-sm"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.volume}
          aria-label="Volume"
          onChange={(e) => {
            updateSettings({ volume: Number(e.target.value), muted: false });
          }}
        />
        <button className="icon-btn" onClick={() => actions.openPanel('settings')} aria-label="Settings" title="Settings">
          <Settings size={18} />
        </button>
      </div>
    </header>
  );
}
