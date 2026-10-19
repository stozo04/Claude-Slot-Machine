# NEURAL JACKPOT — The AI Wars

A browser-based 3D slot machine: 5 reels × 3 rows, 20 fixed paylines, play-money only.
React 19 · TypeScript · Three.js / React Three Fiber · Drei · postprocessing · GSAP · Zustand · Web Audio.

**Play:** https://stozo04.github.io/neural-jackpot-slot-machine/

> Simulated credits only. No real money, purchases, deposits or withdrawals.

## Run locally

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (reels, paylines, payouts, wallet, state machine, recovery)
npm run simulate   # 1,000,000 seeded spins → docs/simulation-report.json
npm run build
```

## How it works

| Module | File |
|---|---|
| Config (strips, paytable, paylines, bets) | `src/config/gameConfig.ts` |
| ProbabilityEngine / ReelEngine / PaylineEvaluator / PayoutCalculator | `src/engine/` |
| CreditWallet / SessionManager / GameEngine (IDLE → BET_PLACED → SPINNING → EVALUATING → PAYOUT) | `src/engine/` |
| AnimationController (GSAP) · SoundManager (Web Audio) | `src/animation/`, `src/audio/` |
| 3D machine (`SlotMachine3D`, reel shader, chassis, effects) | `src/three/` |
| UI (`GameControls`, `StatisticsPanel`, modals) | `src/ui/` |

- Outcomes are chosen by the engine **before** animation using `crypto.getRandomValues` with rejection sampling; the 3D reels only play the result back.
- A line pays its longest left-to-right run of 3/4/5 matching symbols; blanks never pay; no wilds/scatters.
- Total bet = denomination × multiplier × 20 lines; all money is integer cents.
- **Exact theoretical RTP: 94.07%** (target 93.5–94.5%). 1M-spin seeded simulation: 93.93% ± 0.29% (95% CI contains theory), hit frequency 37.4%, max payout 253× total bet. See `docs/simulation-report.json` and the in-game Diagnostics panel.
- Session, balance, history and in-flight spins persist in `localStorage`; an interrupted spin is settled exactly once on reload.

## Assets

Logos live in `public/assets/` and are referenced from `src/config/gameConfig.ts`. **MUSE** uses the user-supplied `meta_muse-icon.webp` — replace that file (or change the path) to swap it. Brand marks belong to their respective owners and are used here for a non-commercial demo.
