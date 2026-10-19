import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { actions, useGame } from '../store/gameStore';
import { dateTime, int, money } from '../utils/format';
import { Modal } from './primitives';

/** Futuristic receipt: waits for the spin to settle, shows the final balance, resets on confirm. */
export function CashOutModal() {
  const snap = useGame((s) => s.snapshot);
  const receipt = useGame((s) => s.receipt);
  const [scan, setScan] = useState(0);
  useEffect(() => {
    if (!receipt) return;
    setScan(0);
    const id = setInterval(() => setScan((s) => Math.min(100, s + 4)), 40);
    return () => clearInterval(id);
  }, [receipt]);

  if (receipt) {
    return (
      <Modal title="Credits transferred" onClose={actions.closeReceipt} labelledBy="receipt-title">
        <div className="receipt holo" aria-live="polite">
          <div className="receipt-scan" style={{ transform: `translateY(${scan * 3}px)`, opacity: scan < 100 ? 1 : 0 }} />
          <CheckCircle2 size={34} aria-hidden />
          <p className="receipt-amount num" data-testid="receipt-amount">{money(receipt.finalBalance)}</p>
          <p className="sub">Holographic credit transfer complete. No real money moved.</p>
          <dl className="receipt-list">
            <div><dt>Deposited</dt><dd>{money(receipt.deposited)}</dd></div>
            <div><dt>Wagered</dt><dd>{money(receipt.wagered)}</dd></div>
            <div><dt>Won</dt><dd>{money(receipt.won)}</dd></div>
            <div><dt>Spins</dt><dd>{int(receipt.spins)}</dd></div>
            <div><dt>Session result</dt><dd className={receipt.profit >= 0 ? 'pos' : 'neg'}>{money(receipt.profit, { signed: true })}</dd></div>
            <div><dt>Closed</dt><dd>{dateTime(receipt.endedAt)}</dd></div>
          </dl>
          <button className="btn primary" data-autofocus onClick={actions.closeReceipt}>Back to the arcade</button>
        </div>
      </Modal>
    );
  }

  if (snap.cashOut === 'pending') {
    return (
      <Modal title="Cashing out" onClose={actions.cancelCashOut}>
        <p className="notice"><Loader2 className="spin-icon" size={16} aria-hidden /> Finishing your current spin — new spins are paused.</p>
        <button className="btn ghost" onClick={actions.cancelCashOut}>Cancel cash out</button>
      </Modal>
    );
  }

  const d = snap.wallet;
  return (
    <Modal title="Cash out" onClose={actions.cancelCashOut}>
      <div className="receipt holo">
        <p className="seg-label">Final virtual balance</p>
        <p className="receipt-amount num" data-testid="cashout-balance">{money(d.balance)}</p>
        <dl className="receipt-list">
          <div><dt>Deposited</dt><dd>{money(d.deposited)}</dd></div>
          <div><dt>Wagered</dt><dd>{money(d.wagered)}</dd></div>
          <div><dt>Won</dt><dd>{money(d.won)}</dd></div>
          <div><dt>Session result</dt><dd className={snap.sessionProfit >= 0 ? 'pos' : 'neg'}>{money(snap.sessionProfit, { signed: true })}</dd></div>
        </dl>
        <p className="sub">Confirming saves this session to your history and resets your balance to $0. Fictional credits — nothing is paid out.</p>
        <div className="row">
          <button className="btn ghost" onClick={actions.cancelCashOut}>Keep playing</button>
          <button className="btn primary" data-autofocus onClick={actions.confirmCashOut} aria-label="Confirm cash out" data-testid="cashout-confirm">Confirm cash out</button>
        </div>
      </div>
    </Modal>
  );
}
