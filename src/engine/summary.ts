import { PAYLINE_COUNT } from '../config/gameConfig';
import { maximumPayout, theoreticalRtp } from './analysis';
import { pct } from '../utils/format';

let cache: { rtp: number; rtpLabel: string; maxLineMultiples: number; maxTotalMultiple: number; maxStops: number[] } | null = null;

/** Cached exact analysis (a few ms) shared by the holograms, paytable and diagnostics panel. */
export function analysisSummary() {
  if (!cache) {
    const rtp = theoreticalRtp();
    const max = maximumPayout();
    cache = { rtp, rtpLabel: pct(rtp, 2), maxLineMultiples: max.lineBetMultiples, maxTotalMultiple: max.lineBetMultiples / PAYLINE_COUNT, maxStops: max.stops };
  }
  return cache;
}
