# NEURAL JACKPOT: The AI Wars
## Reusable Three.js Game Development Prompt

### Your Role

Act as a senior AAA game developer, Three.js graphics engineer, casino game mathematician, UI/UX designer, and technical artist.

Build a fully functional, visually stunning, browser-based 3D slot machine called **NEURAL JACKPOT: The AI Wars**.

This must be a playable game, not a mockup, animation demo, or static prototype.

The game uses simulated money only. No real purchases, deposits, payments, or withdrawals.

Prioritize:
1. Photorealistic 3D presentation
2. Authentic slot-machine mechanics
3. Transparent, mathematically correct probabilities
4. Responsive and satisfying interactions
5. Polished animations, sound effects, and lighting
6. Maintainable, modular production-quality code

---

## 1. Creative Direction

**Theme:** A futuristic AI-powered casino machine where leading AI companies battle for control of the jackpot.

Think of a luxury Las Vegas slot machine redesigned by an advanced artificial intelligence laboratory in 2049.

Visual influences:
- Apple Vision Pro and Liquid Glass
- Blade Runner 2049
- NVIDIA technology demonstrations
- Premium casino slot-machine hardware
- High-end sci-fi industrial design

### Materials and Lighting

Create a physically believable 3D machine featuring:

- Brushed black titanium chassis
- Curved transparent glass surrounding the reels
- Subtle animated neural-network patterns embedded in the hardware
- Deep obsidian and graphite surfaces
- Cyan, violet, and electric-blue accent lighting
- Real-time reflections and soft shadows
- Bloom on illuminated elements
- Floating holographic numerical readouts
- Metallic knobs and tactile buttons
- Premium polished-glass interface panels

Avoid cartoon graphics, overwhelming RGB lighting, and cheap mobile-casino aesthetics.

The machine should feel like an expensive physical object sitting in a futuristic casino.

---

## 2. Technology Stack

Use:

- TypeScript
- React
- Three.js
- React Three Fiber
- Drei
- React Three Postprocessing
- Zustand for state management
- GSAP for animation sequencing
- Web Audio API for sound effects
- Vite or Next.js for the development environment

Use real 3D geometry for the reels and slot-machine enclosure.

Use HTML/CSS overlays selectively for sharp interactive labels, financial displays, and accessibility.

All important game mechanics must operate independently from the rendering engine.

---

## 3. Slot Machine Layout

Implement a traditional 5-reel, 3-row video slot machine with 20 fixed paylines.

The reels spin vertically, displaying AI-company symbols.

The game window presents 15 visible symbols simultaneously.

### Reel Symbols

Use these six symbols: (@assets)

| Symbol | Visual | Relative frequency |
|---|---|---|
| BLANK | Empty dark glass tile | Very high |
| GROK | Authentic xAI/Grok branding | High |
| CHATGPT | Authentic OpenAI ChatGPT logo | Medium |
| MUSE | User-supplied Muse logo | Medium |
| ANTHROPIC | Authentic Anthropic logo | Low |
| GEMINI | Authentic Google Gemini logo | Very low |

Use official SVG or high-resolution transparent logo assets where legally permitted.

Do not substitute generic lettering or emoji for real logos.

The Muse logo must be loaded from a configurable user-provided asset, rather than guessing the brand identity.

Keep symbols crisp, correctly proportioned, and centered on each reel.

Symbols should be rendered as polished physical or illuminated tiles that belong in the futuristic machine.

---

## 4. Real Slot Probability Engine

Implement an authentic probability-driven slot system.

**Do not use fake predetermined win/loss streaks or purely decorative random results.**

Requirements:

- Use configurable virtual reel strips containing symbol IDs.
- Reels must stop on outcomes selected by the probability engine.
- Use a cryptographically secure random source where available.
- Sample reel stop positions uniformly.
- Evaluate outcomes using the actual displayed grid and paylines.
- Calculate payouts using a documented paytable.
- Keep probability calculations independent from animation.
- Never alter the result to manufacture a dramatic win or loss.
- Credit wins only after outcome validation.
- Make the simulation reproducible using seeded RNG in tests.

### Symbol Frequency Design

Initial relative strip weights for each reel:

- BLANK: 40
- GROK: 25
- CHATGPT: 15
- MUSE: 10
- ANTHROPIC: 7
- GEMINI: 3

These are starting weights, not a complete certified reel design.

Build explicit reel strips from these weights. Each strip may have a different ordering to create interesting combinations.

Evaluate 3, 4, and 5 matching symbols, left to right, on the 20 fixed paylines.

BLANK symbols do not pay.

Do not introduce wilds, scatters, or bonus symbols in version one.

### Paytable

Create a configurable paytable expressed as multipliers of the bet per line.

Display the actual paytable in the UI.

Ensure each paying combination and overlapping win is evaluated consistently and documented.

### Return to Player (RTP)

Target approximately **94% theoretical RTP**, with the actual value derived from the selected reel strips and paytable.

Do not assume the suggested symbol weights automatically create 94% RTP.

Before finalizing the game:

1. Compute or independently validate the theoretical expected return.
2. Tune reel strips and payouts until the theoretical RTP is within 93.5% to 94.5%.
3. Run at least 1,000,000 simulated spins.
4. Compare empirical RTP with theoretical RTP and report sampling uncertainty.
5. Report hit frequency, win distribution, and maximum possible payout.
6. Include unit tests for reel sampling, payline evaluation, and credit accounting.

Never secretly change odds depending on player balance, bet size, losses, or previous spins.

Implement a developer diagnostics panel showing RTP statistics and symbol frequencies.

---

## 5. Credit System

The user starts with zero credits.

Provide a prominent **DEPOSIT CREDITS** button.

When clicked, show a premium glass modal offering:

- $100
- $500
- $1,000
- $5,000

All deposits use fictional in-game credits.

Show clear language indicating that no real funds are involved.

Maintain:

- Available credits
- Current wager
- Last win
- Total winnings
- Total amount wagered
- Session profit/loss
- Spin history

Use integer monetary units internally to prevent floating-point accounting errors.

### Cash Out

Provide a **CASH OUT** button.

Cash Out should:

1. Stop the game from accepting new spins.
2. Wait for an active spin to settle.
3. Display the player's final virtual balance.
4. Animate a futuristic payout receipt or holographic credit transfer.
5. Reset the available balance after user confirmation.
6. Save the completed session in local history.

No actual money is transferred.

---

## 6. Betting Controls

### Denomination

Allow users to select:

- $1
- $5
- $10

### Bet Multiplier

Allow users to select:

- 1x
- 5x
- MAX BET 10x

Use the following wager calculation:

**Total Bet = Denomination × Multiplier × 20 Paylines**

Example:

- Denomination: $5
- Multiplier: 5x
- Active paylines: 20
- Total wager: $500

Display the current wager prominently before every spin.

### Spin Button

Create a large, physically modeled, illuminated SPIN button.

Behaviors:

- Press to initiate the spin.
- Disable while spinning.
- Disable if credits are insufficient.
- Subtract the wager once, at spin initiation.
- Animate five reels independently.
- Stop reels sequentially from left to right.
- Evaluate winning paylines.
- Animate and credit the payout once.
- Show a helpful message if the player cannot afford another spin.

Support keyboard interaction using the Space key when appropriate.

---

## 7. Reel Animation and Physics

The reels must feel physically convincing.

Requirements:

- Three-dimensional cylindrical reels with real depth
- Visible curved symbol surfaces
- Smooth rotational acceleration
- High-speed motion blur
- Natural deceleration
- Slight overshoot and mechanical settling
- Sequential stopping with staggered timing
- Subtle vibration when each reel locks into place
- Mechanical click effects
- Appropriate motion, sound, and lighting feedback

Use an animation duration of approximately 2.5–4 seconds.

The mathematical outcome must be determined before animation begins.

The rendering system then animates the reels into the exact selected stopping positions.

Never allow animation frames, timing variations, or skipped frames to influence outcomes.

### Win Presentation

For wins:

- Illuminate the winning paylines.
- Highlight matching symbols.
- Show the payout with a count-up animation.
- Trigger subtle particles and light effects.
- Scale the presentation based on the win relative to the wager.

For unusually large wins, create a cinematic moment with richer lighting, sound, and controlled camera movement.

Keep animations tasteful and skippable.

---

## 8. AI-Themed Visual Effects

Add subtle environmental storytelling.

### Neural Energy

When idle, thin strands of light move through the machine like neural impulses.

During a spin, energy flows upward through the frame, activating circuits and lighting.

### AI Symbol Reactions

When a paying combination occurs:

- Grok: white electric pulses
- ChatGPT: emerald or teal neural ripples
- Muse: customizable signature glow
- Anthropic: warm amber energy
- Gemini: multicolor prismatic light

These are purely cosmetic and must not affect outcome probabilities.

### Grand Win

For major payouts, activate a spectacular but refined **NEURAL OVERLOAD** sequence.

The chassis glows, holographic energy sweeps through the reels, and the camera pulls back slightly to reveal the complete machine.

Do not make every win excessively dramatic.

---

## 9. User Interface

Design an Apple-inspired glass interface surrounding the 3D machine.

### Top Display

- NEURAL JACKPOT title
- Current virtual balance
- Session profit/loss
- Settings button
- Sound controls

### Main Stage

- Fully interactive 3D slot machine
- Five spinning reels
- Highlighted paylines
- Animated win display
- Cinematic environment

### Bottom Control Console

- Deposit Credits
- Cash Out
- Denomination selector
- Bet multiplier selector
- Total Bet
- SPIN button

### Secondary Panels

- Paytable
- Game rules
- Recent spin history
- Session statistics
- Probability diagnostics

Prioritize usability. A new player should understand the controls without instructions.

---

## 10. Audio Design

Create a coherent soundscape:

- Ambient futuristic machinery
- Subtle electronic hum
- Tactile denomination-selector clicks
- Mechanical reel acceleration
- Spinning-reel audio
- Individual reel-stop sounds
- Soft payout tones
- Cinematic large-win effects

Support mute, volume controls, and browser audio-permission requirements.

Do not autoplay sound before user interaction.

---

## 11. Game Architecture

Separate implementation into modules:

- GameEngine
- ReelEngine
- ProbabilityEngine
- PaylineEvaluator
- PayoutCalculator
- CreditWallet
- SessionManager
- AnimationController
- SoundManager
- SlotMachine3D
- GameControls
- StatisticsPanel

Game state should use clear transitions:

IDLE → BET_PLACED → SPINNING → EVALUATING → PAYOUT → IDLE

Handle deposit, cash-out, and insufficient-balance conditions explicitly.

Persist virtual session data using local storage.

Protect against duplicate clicks, double debits, stale animation callbacks, and repeated payout settlement.

---

## 12. Performance and Quality

Target:

- 60 FPS on modern desktop hardware
- Usable experience on tablets
- Graceful mobile responsiveness
- High-DPI symbol rendering
- Efficient materials and draw calls
- Sensible texture memory
- Reduced-motion accessibility
- Keyboard-accessible controls
- No runtime errors

Use performance-aware postprocessing.

Optimize visual quality without sacrificing input responsiveness.

---

## 13. Deliverables

Provide:

1. A fully running, interactive Three.js game
2. Complete source code
3. Reusable components and organized architecture
4. A configuration file containing reel strips, paytable, denominations, and multipliers
5. A documented probability model
6. A simulation harness and test results
7. A responsive interface
8. Instructions for running locally
9. Clearly identified placeholder assets that require user input

### Verification

Run automated tests and launch the application.

Verify actual interaction flows:

- Deposit credits
- Choose denomination
- Change multiplier
- Spin reels
- Settle winnings
- Handle insufficient credits
- Cash out
- Reload and recover session
- Inspect payout statistics

Do not claim features are complete unless they work.

---

## 14. Acceptance Criteria

The game is complete when:

- The player sees a visually impressive 3D futuristic slot machine.
- All six symbol types are represented.
- All five reels animate convincingly.
- Real randomized outcomes follow the configured model.
- The paytable and theoretical RTP are mathematically consistent.
- Deposits and cash-outs work with virtual credits.
- All denominations and multipliers function correctly.
- Winning combinations trigger correct payouts.
- The statistics panel accurately represents gameplay.
- Performance is smooth.
- The application runs locally without errors.

**Final Creative Goal**

The player should feel they have discovered an extraordinary AI-powered casino machine from the future.

The presentation is cinematic, elegant, tactile, and technologically sophisticated.

The underlying mathematics is transparent, testable, and reliable.

Build the actual experience, not just a concept.
