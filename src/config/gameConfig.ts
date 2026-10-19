/**
 * NEURAL JACKPOT — single source of truth for everything that affects the maths:
 * symbols, reel strips, paylines, paytable, denominations and multipliers.
 *
 * Change a number here and the UI paytable, the diagnostics panel, the theoretical RTP,
 * the unit tests and the simulation harness all follow. No other file hardcodes odds.
 *
 * Money convention: all balances and payouts are integer CENTS. A "bet per line" is
 * denomination × multiplier (in cents); paytable values are multiples of the bet per line.
 */

// ───────────────────────────── Symbols ─────────────────────────────

export const SYMBOL_IDS = ['BLANK', 'GROK', 'CHATGPT', 'MUSE', 'ANTHROPIC', 'GEMINI'] as const;
export type SymbolId = (typeof SYMBOL_IDS)[number];
export type PayingSymbolId = Exclude<SymbolId, 'BLANK'>;

export interface SymbolDef {
  id: SymbolId;
  name: string;
  /** Initial relative strip weight (out of the 100 virtual stops on each reel). */
  weight: number;
  /**
   * Logo asset. Paths are served from /public. ⚠️ MUSE is the user-supplied placeholder:
   * replace `public/assets/meta_muse-icon.webp` (or change this path) to swap the brand mark.
   */
  asset: string | null;
  /**
   * 'invert-white' — the source logo is black-on-transparent, so it is recoloured to a lit white
   *                  mark (alpha shape untouched) to stay legible on obsidian glass.
   * 'original'     — logo is drawn exactly as supplied.
   * 'medallion'    — opaque artwork, cropped into a circular medallion.
   */
  treatment: 'invert-white' | 'original' | 'medallion' | 'none';
  /** Signature glow used for win reactions and hologram accents (CSS hex). */
  glow: string;
  /** Secondary glow colour for the gradient reactions (Gemini is multicolour). */
  glow2?: string;
}

/** Asset URL that works under any deploy base path (also safe when run under Node for tests). */
const BASE = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
const asset = (file: string) => `${BASE}assets/${file}`;

export const SYMBOLS: Record<SymbolId, SymbolDef> = {
  BLANK: { id: 'BLANK', name: 'Blank', weight: 40, asset: null, treatment: 'none', glow: '#3a4a5a' },
  GROK: { id: 'GROK', name: 'Grok', weight: 25, asset: asset('grok-icon.webp'), treatment: 'invert-white', glow: '#e8f2ff', glow2: '#9fc4ff' },
  CHATGPT: { id: 'CHATGPT', name: 'ChatGPT', weight: 15, asset: asset('chatgpt-icon.webp'), treatment: 'invert-white', glow: '#33e6b4', glow2: '#12b5a0' },
  // MUSE glow is user-customisable.
  MUSE: { id: 'MUSE', name: 'Muse', weight: 10, asset: asset('meta_muse-icon.webp'), treatment: 'medallion', glow: '#b69cff', glow2: '#7a6bff' },
  ANTHROPIC: { id: 'ANTHROPIC', name: 'Anthropic', weight: 7, asset: asset('anthropic-icon.svg'), treatment: 'original', glow: '#ffa23a', glow2: '#ff7a2e' },
  GEMINI: { id: 'GEMINI', name: 'Gemini', weight: 3, asset: asset('Google-gemini-icon.svg.webp'), treatment: 'original', glow: '#7aa8ff', glow2: '#d68bff' },
};

export const PAYING_SYMBOLS: PayingSymbolId[] = ['GROK', 'CHATGPT', 'MUSE', 'ANTHROPIC', 'GEMINI'];

// ───────────────────────────── Reels ─────────────────────────────

export const REEL_COUNT = 5;
export const ROW_COUNT = 3;

/** Letter codes used to keep the strips readable below. */
export const STRIP_CODES: Record<string, SymbolId> = {
  '.': 'BLANK',
  G: 'GROK',
  C: 'CHATGPT',
  M: 'MUSE',
  A: 'ANTHROPIC',
  '*': 'GEMINI',
};

/**
 * Virtual reel strips: 100 stops per reel built from the weights above
 * (40 blank · 25 Grok · 15 ChatGPT · 10 Muse · 7 Anthropic · 3 Gemini).
 * Every reel has the same symbol counts but a different ordering. Each stop is equally likely.
 * Stop N is shown on the centre row; N+1 is the top row and N−1 the bottom row (strip wraps).
 */
const RAW_STRIPS: string[] = [
  // reel 1
  'G.AMC.G..GC.MG.A.CG.G.M*C.G..GCA.MG..CG..GMC.AG..GC.MG..*CG.AG.MC.G..GC.MGA..CG.G.MC.G.A.G*C.MG..CG.',
  // reel 2
  '.GM.CG.A.G.CM.G.G.C*.AGM.CG..G.CM.GA.G.C.GM.CG..AG.CM.G*.G.C.GM.ACG..G.CM.G.GA.C.GM.CG.*.G.CAM.G.G.C',
  // reel 3
  '.G.C.MGA..GC.G.MC.G.AG.C*M.G.G.C.G.MAC.G.G.C.MG.AG.C.G.MC.G*.G.AC.MG.G.C.GM.C.GA.G.CM.G.G.C*A.G.MC.G',
  // reel 4
  'C.GA..G*MC.G..CG.MAG.C.G..GCM.G.A.CG.MG.*C.G.AG.CM.G..CG.MG.AC.G..GCM.G.*.CGA.MG.C.G..GCM.AG..CG.MG.',
  // reel 5
  '.MGC.G..GC*.AM.G.CG..MGC.AG..CG.M.G.CG.A.MGC.*G..CG.M.GAC.G..MGC.G.A.CG.M.G.C*G..MGAC.G..CG.M.G.CAG.',
];

export const REEL_STRIPS: readonly (readonly SymbolId[])[] = RAW_STRIPS.map((raw) =>
  [...raw].map((ch) => {
    const id = STRIP_CODES[ch];
    if (!id) throw new Error(`Unknown strip code "${ch}"`);
    return id;
  }),
);

// ───────────────────────────── Paylines ─────────────────────────────

/** 20 fixed paylines. Each entry is the row (0 = top, 1 = middle, 2 = bottom) per reel. */
export const PAYLINES: readonly (readonly number[])[] = [
  [1, 1, 1, 1, 1], // 1  middle
  [0, 0, 0, 0, 0], // 2  top
  [2, 2, 2, 2, 2], // 3  bottom
  [0, 1, 2, 1, 0], // 4  V
  [2, 1, 0, 1, 2], // 5  inverted V
  [0, 0, 1, 0, 0], // 6
  [2, 2, 1, 2, 2], // 7
  [1, 0, 0, 0, 1], // 8
  [1, 2, 2, 2, 1], // 9
  [0, 1, 1, 1, 0], // 10
  [2, 1, 1, 1, 2], // 11
  [1, 0, 1, 0, 1], // 12
  [1, 2, 1, 2, 1], // 13
  [0, 1, 0, 1, 0], // 14
  [2, 1, 2, 1, 2], // 15
  [1, 1, 0, 1, 1], // 16
  [1, 1, 2, 1, 1], // 17
  [0, 2, 0, 2, 0], // 18
  [2, 0, 2, 0, 2], // 19
  [0, 2, 1, 2, 0], // 20
];
export const PAYLINE_COUNT = PAYLINES.length;

// ───────────────────────────── Paytable ─────────────────────────────

/**
 * Multipliers of the BET PER LINE, for [3-of-a-kind, 4-of-a-kind, 5-of-a-kind], matched left to
 * right starting on reel 1. Only the longest run on a line pays (no double-paying 3+4+5), and a
 * line pays at most once. BLANK never pays. Different lines add up.
 */
export const PAYTABLE: Record<PayingSymbolId, readonly [number, number, number]> = {
  GROK: [15, 60, 250],
  CHATGPT: [30, 150, 750],
  MUSE: [50, 250, 1500],
  ANTHROPIC: [100, 500, 2500],
  GEMINI: [250, 1250, 5000],
};
export const MIN_MATCH = 3;

// ───────────────────────────── Betting & credits ─────────────────────────────

export const DENOMINATIONS = [1, 5, 10] as const; // dollars per line unit
export const MULTIPLIERS = [1, 5, 10] as const; // 10 = MAX BET
export const MAX_MULTIPLIER = 10;
export const DEPOSIT_OPTIONS = [100, 500, 1000, 5000] as const; // dollars of fictional credit
export const CENTS = 100;

// ───────────────────────────── Presentation ─────────────────────────────

/** Spin timing in seconds. Reel i stops at STOP_BASE + i × STOP_STAGGER (+ settle). ≈ 2.5–4 s total. */
export const SPIN_TIMING = {
  accel: 0.45,
  stopBase: 1.55,
  stopStagger: 0.42,
  decel: 0.95,
  settle: 0.38,
  cruiseCellsPerSecond: 34,
  skipTimeScale: 4,
} as const;

/** Win tiers by payout ÷ total wager. Purely presentational — never touches the odds. */
export const WIN_TIERS = [
  { id: 'overload', minMultiple: 25, label: 'NEURAL OVERLOAD' },
  { id: 'mega', minMultiple: 10, label: 'MEGA WIN' },
  { id: 'big', minMultiple: 4, label: 'BIG WIN' },
  { id: 'nice', minMultiple: 1, label: 'NICE WIN' },
  { id: 'small', minMultiple: 0, label: 'WIN' },
] as const;
export type WinTierId = (typeof WIN_TIERS)[number]['id'] | 'none';

export const STORAGE_KEY = 'neural-jackpot:v2';
export const SETTINGS_KEY = 'neural-jackpot:settings:v1';
export const HISTORY_LIMIT = 100;
export const SESSION_HISTORY_LIMIT = 50;
