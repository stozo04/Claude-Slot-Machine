import { Banknote, FastForward, Landmark, Play } from 'lucide-react';
import { DENOMINATIONS, MULTIPLIERS, PAYLINE_COUNT } from '../config/gameConfig';
import { actions, skipAnimation, startSpin, useGame } from '../store/gameStore';
import { money } from '../utils/format';
import { WinCounter } from './primitives';

function Segmented<T extends number>({ label, values, value, format, onChange, disabled, testPrefix }: { label: string; values: readonly T[]; value: T; format: (v: T) => string; onChange: (v: T) => void; disabled: boolean; testPrefix: string }) {
  return (
    <div className="seg-group" role="group" aria-label={label}>
      <span className="seg-label">{label}</span>
      <div className="segmented">
        {values.map((v) => (
          <button key={v} type="button" className={v === value ? 'on' : ''} aria-pressed={v === value} disabled={disabled} onClick={() => onChange(v)} data-testid={`${testPrefix}-${v}`}>
            {format(v)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function GameControls() {
  const snap = useGame((s) => s.snapshot);
  const nudge = useGame((s) => s.nudge);
  const busy = snap.phase !== 'IDLE';
  const cashing = snap.cashOut !== 'none';
  const locked = busy || cashing;
  const blocker = snap.spinBlocker;
  const canSpin = blocker === null;
  const noCredits = snap.wallet.balance === 0;

  let hint = '';
  if (cashing) hint = 'Cash out in progress';
  else if (busy) hint = snap.phase === 'SPINNING' ? 'Spinning… press Space to skip' : 'Settling…';
  else if (blocker === 'insufficient') hint = noCredits ? 'Deposit credits to play' : `Need ${money(snap.shortfall)} more — lower your bet or deposit`;

  return (
    <footer className="console glass" data-console>
      <div className="console-grid">
        <div className="console-block money-actions">
          <button key={`d${nudge}`} className={`btn primary ${noCredits || blocker === 'insufficient' ? 'attention' : ''}`} onClick={actions.openDeposit} disabled={cashing} data-testid="deposit-open">
            <Landmark size={16} aria-hidden /> Deposit credits
          </button>
          <button className="btn ghost" onClick={actions.requestCashOut} disabled={cashing || (snap.wallet.deposited === 0 && snap.wallet.balance === 0)} data-testid="cashout-open">
            <Banknote size={16} aria-hidden /> Cash out
          </button>
        </div>

        <div className="console-block bet-controls">
          <Segmented label="Denomination" values={DENOMINATIONS} value={snap.denomination as (typeof DENOMINATIONS)[number]} format={(v) => `$${v}`} onChange={actions.setDenomination} disabled={locked} testPrefix="denom" />
          <Segmented label="Bet multiplier" values={MULTIPLIERS} value={snap.multiplier as (typeof MULTIPLIERS)[number]} format={(v) => (v === 10 ? 'MAX 10×' : `${v}×`)} onChange={actions.setMultiplier} disabled={locked} testPrefix="mult" />
        </div>

        <div className="console-block total-bet" aria-live="polite">
          <span className="seg-label">Total bet</span>
          <span className="num big" data-testid="total-bet">{money(snap.totalBet)}</span>
          <span className="sub">{money(snap.betPerLine)} × {PAYLINE_COUNT} lines</span>
        </div>

        <div className="console-block win-block">
          <span className="seg-label">Last win</span>
          <span className="num big" data-testid="console-win">
            {busy && snap.phase === 'PAYOUT' ? <WinCounter /> : money(snap.lastWin)}
          </span>
          <span className="sub">Total won {money(snap.wallet.won)}</span>
        </div>

        <div className="console-block spin-block">
          {snap.phase === 'SPINNING' ? (
            <button className="spin-btn skip" onClick={skipAnimation} data-testid="skip">
              <FastForward size={22} aria-hidden />
              <span>SKIP</span>
            </button>
          ) : snap.phase === 'PAYOUT' ? (
            <button className="spin-btn skip" onClick={skipAnimation} data-testid="skip" aria-label="Skip win presentation">
              <FastForward size={22} aria-hidden />
              <span>SKIP</span>
            </button>
          ) : (
            <button className="spin-btn" onClick={startSpin} disabled={!canSpin} aria-label="Spin" data-testid="spin">
              <Play size={22} aria-hidden fill="currentColor" />
              <span>SPIN</span>
            </button>
          )}
          <span className="hint" role="status" data-testid="hint">{hint}</span>
        </div>
      </div>
    </footer>
  );
}
