import { ShieldCheck } from 'lucide-react';
import { DEPOSIT_OPTIONS } from '../config/gameConfig';
import { actions, useGame } from '../store/gameStore';
import { money } from '../utils/format';
import { Modal } from './primitives';

export function DepositModal() {
  const balance = useGame((s) => s.snapshot.wallet.balance);
  return (
    <Modal title="Deposit credits" onClose={actions.closeDeposit}>
      <p className="notice">
        <ShieldCheck size={16} aria-hidden /> <strong>Fictional credits only.</strong> No real funds, payments or withdrawals are involved — this is a simulation.
      </p>
      <div className="deposit-grid">
        {DEPOSIT_OPTIONS.map((amt) => (
          <button key={amt} className="deposit-option" onClick={() => actions.deposit(amt)} aria-label={`Add ${money(amt * 100)} in credits`} data-testid={`deposit-${amt}`}>
            <span className="amt">{money(amt * 100)}</span>
            <span className="sub">in play credits</span>
          </button>
        ))}
      </div>
      <p className="sub center">Current balance: {money(balance)}</p>
    </Modal>
  );
}
