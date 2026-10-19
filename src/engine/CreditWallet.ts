import { assertCents } from './PayoutCalculator';

export interface WalletSnapshot {
  /** Spendable credits, cents. */
  balance: number;
  /** Credits deposited this session. */
  deposited: number;
  /** Total amount wagered this session. */
  wagered: number;
  /** Total winnings credited this session. */
  won: number;
}

export class InsufficientFundsError extends Error {
  constructor(
    public readonly needed: number,
    public readonly available: number,
  ) {
    super(`Insufficient credits: need ${needed}, have ${available}`);
    this.name = 'InsufficientFundsError';
  }
}

/**
 * CreditWallet — fictional credits in integer cents. No floating point ever touches a balance.
 * Every mutation validates its input, so a bad call can never corrupt the books.
 */
export class CreditWallet {
  private state: WalletSnapshot;

  constructor(initial: WalletSnapshot = { balance: 0, deposited: 0, wagered: 0, won: 0 }) {
    this.state = { ...initial };
    Object.values(this.state).forEach((v) => assertCents(v, 'wallet field'));
  }

  snapshot(): WalletSnapshot {
    return { ...this.state };
  }

  get balance() {
    return this.state.balance;
  }

  canAfford(amount: number): boolean {
    return Number.isSafeInteger(amount) && amount > 0 && this.state.balance >= amount;
  }

  deposit(amount: number) {
    assertCents(amount, 'deposit');
    if (amount === 0) throw new RangeError('Deposit must be positive');
    this.state.balance += amount;
    this.state.deposited += amount;
  }

  /** Remove a wager from the balance. Called exactly once per spin, at spin start. */
  debit(amount: number) {
    assertCents(amount, 'wager');
    if (amount === 0) throw new RangeError('Wager must be positive');
    if (this.state.balance < amount) throw new InsufficientFundsError(amount, this.state.balance);
    this.state.balance -= amount;
    this.state.wagered += amount;
  }

  /** Add a validated payout. Zero is a valid (no-op) payout. */
  credit(amount: number) {
    assertCents(amount, 'payout');
    this.state.balance += amount;
    this.state.won += amount;
  }

  /** Cash out: returns the final balance and zeroes the wallet for a fresh session. */
  closeSession(): WalletSnapshot {
    const final = this.snapshot();
    this.state = { balance: 0, deposited: 0, wagered: 0, won: 0 };
    return final;
  }
}
