import { useMemo, useState, type ReactElement } from 'react';
import { BarChart3, BookOpen, Activity, History, Table2, X } from 'lucide-react';
import { PAYLINES, PAYLINE_COUNT, PAYING_SYMBOLS, PAYTABLE, SYMBOLS, SYMBOL_IDS, WIN_TIERS, REEL_COUNT, ROW_COUNT, type SymbolId } from '../config/gameConfig';
import { lineBreakdown, simulate, symbolFrequencies, type SimulationResult } from '../engine/analysis';
import { analysisSummary } from '../engine/summary';
import { actions, updateSettings, useGame, type PanelId } from '../store/gameStore';
import { dateTime, int, money, pct, time } from '../utils/format';

const Logo = ({ id, size = 28 }: { id: SymbolId; size?: number }) => {
  const def = SYMBOLS[id];
  if (!def.asset) return <span className="logo blank" style={{ width: size, height: size }} aria-label="Blank" />;
  return <img className={`logo ${def.treatment}`} src={def.asset} alt={def.name} width={size} height={size} style={{ borderRadius: def.treatment === 'medallion' ? '50%' : 0 }} />;
};

function PaylineMini({ rows, n }: { rows: readonly number[]; n: number }) {
  return (
    <div className="payline-mini" title={`Payline ${n}`} aria-label={`Payline ${n}`} role="img">
      <svg viewBox="0 0 50 30" width="50" height="30">
        {Array.from({ length: REEL_COUNT }, (_, r) => Array.from({ length: ROW_COUNT }, (_, c) => <rect key={`${r}${c}`} x={r * 10 + 1.5} y={c * 10 + 1.5} width="7" height="7" rx="1.5" className="cell" />))}
        <polyline points={rows.map((row, r) => `${r * 10 + 5},${row * 10 + 5}`).join(' ')} className="line" />
      </svg>
      <span>{n}</span>
    </div>
  );
}

export function PaytablePanel() {
  const betPerLine = useGame((s) => s.snapshot.betPerLine);
  const summary = analysisSummary();
  return (
    <div className="panel-body">
      <p className="sub">Multipliers of the <strong>bet per line</strong> ({money(betPerLine)} at your current bet). Matches pay left → right from reel 1 on any of the {PAYLINE_COUNT} paylines; the longest run on a line pays once.</p>
      <table className="table paytable" data-testid="paytable">
        <thead>
          <tr><th>Symbol</th><th>3 of a kind</th><th>4 of a kind</th><th>5 of a kind</th></tr>
        </thead>
        <tbody>
          {[...PAYING_SYMBOLS].reverse().map((id) => (
            <tr key={id}>
              <td><span className="sym-cell"><Logo id={id} /> {SYMBOLS[id].name}</span></td>
              {PAYTABLE[id].map((m, i) => (
                <td key={i} className="num"><strong>{int(m)}×</strong><span className="sub"> {money(m * betPerLine)}</span></td>
              ))}
            </tr>
          ))}
          <tr>
            <td><span className="sym-cell"><Logo id="BLANK" /> Blank</span></td>
            <td colSpan={3} className="sub">Never pays. No wilds, scatters or bonus symbols.</td>
          </tr>
        </tbody>
      </table>
      <p className="sub">Best possible spin: <strong>{int(summary.maxLineMultiples)}× bet per line</strong> = {summary.maxTotalMultiple.toFixed(1)}× your total bet (exhaustively verified over every reel stop combination).</p>
      <h3>20 fixed paylines</h3>
      <div className="paylines">{PAYLINES.map((rows, i) => <PaylineMini key={i} rows={rows} n={i + 1} />)}</div>
    </div>
  );
}

export function RulesPanel() {
  return (
    <div className="panel-body rules">
      <ol>
        <li><strong>Play money only.</strong> Deposits add fictional credits. Nothing is bought, paid or withdrawn.</li>
        <li><strong>Total Bet = Denomination × Multiplier × 20 paylines.</strong> Example: $5 × 5× × 20 = $500. All 20 lines are always active; the wager is taken once when you press SPIN.</li>
        <li>Five reels × three rows show 15 symbols. Wins need <strong>3, 4 or 5 matching symbols in a row from the leftmost reel</strong> along a payline.</li>
        <li>A line pays its <strong>longest</strong> run once (no stacking 3+4+5). Different paylines add together. Blanks never pay.</li>
        <li>Each reel stops on a position chosen uniformly at random by a secure random generator <em>before</em> the reels start moving. The animation only plays that result back — it can never change it.</li>
        <li>Odds do not depend on your balance, bet size, streaks or history. Every spin is independent.</li>
        <li><strong>Cash out</strong> waits for any spin to finish, shows your final balance, then resets it to $0 after you confirm and saves the session to history.</li>
        <li>Keyboard: <kbd>Space</kbd> spins (or skips the current animation). <kbd>Esc</kbd> closes dialogs.</li>
      </ol>
      <p className="sub">Win presentations (lights, particles, camera moves) are purely cosmetic: GROK white pulses · CHATGPT teal ripples · MUSE violet glow · ANTHROPIC amber energy · GEMINI prismatic light.</p>
    </div>
  );
}

function MiniGrid({ grid }: { grid: SymbolId[][] }) {
  return (
    <div className="mini-grid" aria-hidden>
      {Array.from({ length: ROW_COUNT }, (_, row) => (
        <div key={row} className="mini-row">
          {grid.map((col, reel) => <Logo key={reel} id={col[row]} size={14} />)}
        </div>
      ))}
    </div>
  );
}

export function HistoryPanel() {
  const data = useGame((s) => s.snapshot.data);
  const [tab, setTab] = useState<'spins' | 'sessions'>('spins');
  return (
    <div className="panel-body">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'spins'} className={tab === 'spins' ? 'on' : ''} onClick={() => setTab('spins')}>Recent spins</button>
        <button role="tab" aria-selected={tab === 'sessions'} className={tab === 'sessions' ? 'on' : ''} onClick={() => setTab('sessions')}>Past sessions ({data.sessions.length})</button>
      </div>
      {tab === 'spins' ? (
        data.history.length === 0 ? <p className="sub">No spins yet this session.</p> : (
          <table className="table" data-testid="history">
            <thead><tr><th>#</th><th>Time</th><th>Result</th><th>Bet</th><th>Win</th></tr></thead>
            <tbody>
              {data.history.slice(0, 60).map((r) => (
                <tr key={r.id} className={r.payout > 0 ? 'won' : ''}>
                  <td className="num">{r.id}</td>
                  <td>{time(r.at)}</td>
                  <td><MiniGrid grid={r.grid} /></td>
                  <td className="num">{money(r.wager)}</td>
                  <td className={`num ${r.payout > 0 ? 'pos' : ''}`}>{r.payout > 0 ? money(r.payout, { signed: true }) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : data.sessions.length === 0 ? <p className="sub">Cash out to save your first completed session.</p> : (
        <table className="table" data-testid="sessions">
          <thead><tr><th>Closed</th><th>Spins</th><th>Deposited</th><th>Final</th><th>Result</th></tr></thead>
          <tbody>
            {data.sessions.map((s) => (
              <tr key={s.id}>
                <td>{dateTime(s.endedAt)}</td>
                <td className="num">{int(s.spins)}</td>
                <td className="num">{money(s.deposited)}</td>
                <td className="num">{money(s.finalBalance)}</td>
                <td className={`num ${s.profit >= 0 ? 'pos' : 'neg'}`}>{money(s.profit, { signed: true })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** StatisticsPanel — session numbers derived only from spins actually played. */
export function StatisticsPanel() {
  const snap = useGame((s) => s.snapshot);
  const { wallet, data } = snap;
  const st = data.stats;
  const rtp = wallet.wagered > 0 ? wallet.won / wallet.wagered : 0;
  const hit = st.spins > 0 ? st.hits / st.spins : 0;
  return (
    <div className="panel-body">
      <div className="stat-grid" data-testid="stats">
        <Metric label="Spins" value={int(st.spins)} />
        <Metric label="Hit frequency" value={st.spins ? pct(hit, 1) : '—'} />
        <Metric label="Total wagered" value={money(wallet.wagered)} />
        <Metric label="Total winnings" value={money(wallet.won)} />
        <Metric label="Session RTP" value={wallet.wagered ? pct(rtp, 1) : '—'} />
        <Metric label="Profit / loss" value={money(snap.sessionProfit, { signed: true })} tone={snap.sessionProfit} />
        <Metric label="Biggest win" value={money(st.biggestWin)} />
        <Metric label="Deposited" value={money(wallet.deposited)} />
      </div>
      <h3>Win tiers this session</h3>
      <ul className="tier-list">
        {[...WIN_TIERS].reverse().map((t) => <li key={t.id}><span>{t.label}</span><strong>{int(st.tiers[t.id])}</strong></li>)}
        <li><span>No win</span><strong>{int(st.tiers.none)}</strong></li>
      </ul>
      <h3>Lifetime (this browser)</h3>
      <p className="sub">{int(data.lifetime.spins + 0)} spins · {money(data.lifetime.wagered)} wagered · {money(data.lifetime.won)} won · {data.sessions.length} completed sessions</p>
      <p className="sub">Short sessions swing wildly around the theoretical return — that is normal variance, not a sign the odds changed.</p>
    </div>
  );
}

const Metric = ({ label, value, tone }: { label: string; value: string; tone?: number }) => (
  <div className="metric"><label>{label}</label><span className={`num ${tone ? (tone > 0 ? 'pos' : 'neg') : ''}`}>{value}</span></div>
);

/** Developer diagnostics: exact maths, observed frequencies, and an in-browser Monte-Carlo run. */
export function DiagnosticsPanel() {
  const snap = useGame((s) => s.snapshot);
  const summary = analysisSummary();
  const rows = useMemo(() => lineBreakdown(), []);
  const design = useMemo(() => symbolFrequencies(), []);
  const [sim, setSim] = useState<SimulationResult | null>(null);
  const [running, setRunning] = useState(false);
  const st = snap.data.stats;
  const cells = st.spins * REEL_COUNT * ROW_COUNT;
  const observedRtp = snap.wallet.wagered ? snap.wallet.won / snap.wallet.wagered : 0;

  const run = (n: number) => {
    setRunning(true);
    setTimeout(() => {
      setSim(simulate(n, 20261019));
      setRunning(false);
    }, 40);
  };

  return (
    <div className="panel-body diag" data-testid="diagnostics">
      <div className="stat-grid">
        <Metric label="Theoretical RTP (exact)" value={pct(summary.rtp, 4)} />
        <Metric label="Session RTP (observed)" value={snap.wallet.wagered ? pct(observedRtp, 2) : '—'} />
        <Metric label="Max payout" value={`${summary.maxTotalMultiple.toFixed(1)}× bet`} />
        <Metric label="Session hit rate" value={st.spins ? pct(st.hits / st.spins, 1) : '—'} />
      </div>
      <p className="sub">Exact RTP is computed from the real reel strips and paytable (per-line expectation × linearity). Target band 93.5–94.5%.</p>

      <h3>Symbol frequency (per reel strip vs visible cells this session)</h3>
      <table className="table">
        <thead><tr><th>Symbol</th><th>Strip weight</th><th>Observed</th></tr></thead>
        <tbody>
          {SYMBOL_IDS.map((id) => (
            <tr key={id}>
              <td><span className="sym-cell"><Logo id={id} size={18} /> {SYMBOLS[id].name}</span></td>
              <td className="num">{pct(design[id], 1)}</td>
              <td className="num">{cells ? pct(st.symbolCounts[id] / cells, 1) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>RTP contribution by paytable row</h3>
      <table className="table">
        <thead><tr><th>Symbol</th><th>×3</th><th>×4</th><th>×5</th><th>Σ</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.symbol}>
              <td>{SYMBOLS[r.symbol].name}</td>
              {r.rtp.map((v, i) => <td key={i} className="num">{pct(v, 2)}</td>)}
              <td className="num"><strong>{pct(r.rtp[0] + r.rtp[1] + r.rtp[2], 2)}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Monte-Carlo simulation</h3>
      <p className="sub">Runs seeded spins through the real engine in your browser. It never touches your balance.</p>
      <div className="row">
        <button className="btn ghost" disabled={running} onClick={() => run(100_000)} data-testid="sim-100k">100k spins</button>
        <button className="btn ghost" disabled={running} onClick={() => run(1_000_000)} data-testid="sim-1m">1,000,000 spins</button>
      </div>
      {running && <p className="sub">Simulating…</p>}
      {sim && !running && (
        <div className="sim" data-testid="sim-result">
          <Metric label={`Empirical RTP (${int(sim.spins)} spins)`} value={pct(sim.empiricalRtp, 3)} />
          <Metric label="Standard error" value={`±${pct(sim.standardError, 3)}`} />
          <Metric label="95% interval" value={`${pct(sim.confidence95[0], 2)} – ${pct(sim.confidence95[1], 2)}`} />
          <Metric label="Theory inside interval?" value={sim.confidence95[0] <= sim.theoreticalRtp && sim.theoreticalRtp <= sim.confidence95[1] ? 'Yes' : 'No'} />
          <Metric label="Hit frequency" value={pct(sim.hitFrequency, 2)} />
          <Metric label="Largest win seen" value={`${sim.maxObservedMultiple.toFixed(1)}× bet`} />
        </div>
      )}
    </div>
  );
}

export function SettingsPanel() {
  const s = useGame((x) => x.settings);
  return (
    <div className="panel-body settings">
      <label className="setting"><span>Volume</span><input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => updateSettings({ volume: Number(e.target.value), muted: false })} aria-label="Volume" /></label>
      <label className="setting"><span>Mute all sound</span><input type="checkbox" checked={s.muted} onChange={(e) => updateSettings({ muted: e.target.checked })} /></label>
      <label className="setting"><span>Reduced motion <em>(shorter spins, no camera moves / particles)</em></span><input type="checkbox" checked={s.reducedMotion} onChange={(e) => updateSettings({ reducedMotion: e.target.checked })} /></label>
      <label className="setting"><span>Graphics quality</span>
        <select value={s.quality} onChange={(e) => updateSettings({ quality: e.target.value as 'high' | 'balanced' | 'low' })}>
          <option value="high">High (reflections, MSAA, chromatic)</option>
          <option value="balanced">Balanced</option>
          <option value="low">Low (best performance)</option>
        </select>
      </label>
      <p className="sub">Sound is synthesised in your browser and only starts after your first click or key press.</p>
    </div>
  );
}

const PANELS: Record<PanelId, { title: string; icon: typeof Table2; body: () => ReactElement }> = {
  paytable: { title: 'Paytable', icon: Table2, body: PaytablePanel },
  rules: { title: 'Game rules', icon: BookOpen, body: RulesPanel },
  history: { title: 'Spin history', icon: History, body: HistoryPanel },
  stats: { title: 'Session statistics', icon: BarChart3, body: StatisticsPanel },
  diagnostics: { title: 'Probability diagnostics', icon: Activity, body: DiagnosticsPanel },
  settings: { title: 'Settings', icon: X, body: SettingsPanel },
};

export const DOCK: { id: PanelId; label: string }[] = [
  { id: 'paytable', label: 'Paytable' },
  { id: 'rules', label: 'Rules' },
  { id: 'history', label: 'History' },
  { id: 'stats', label: 'Statistics' },
  { id: 'diagnostics', label: 'Probability diagnostics' },
];
export const DOCK_ICONS = { paytable: Table2, rules: BookOpen, history: History, stats: BarChart3, diagnostics: Activity } as const;

export function PanelDrawer({ id }: { id: PanelId }) {
  const def = PANELS[id];
  const Body = def.body;
  return (
    <aside className="drawer glass" role="dialog" aria-label={def.title} data-testid={`panel-${id}`}>
      <header className="modal-head">
        <h2>{def.title}</h2>
        <button className="icon-btn" onClick={() => actions.openPanel(null)} aria-label="Close panel"><X size={18} /></button>
      </header>
      <div className="drawer-scroll"><Body /></div>
    </aside>
  );
}
