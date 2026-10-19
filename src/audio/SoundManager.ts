import type { WinTierId } from '../config/gameConfig';

/**
 * SoundManager — all audio is synthesised with the Web Audio API (no sample files to ship).
 * The AudioContext is only created after a user gesture (browser autoplay policy); until then
 * every call is a harmless no-op. Master volume + mute are applied on one gain node.
 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private ambientNodes: AudioNode[] = [];
  private ambientGain: GainNode | null = null;
  private reelLoop: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private volume = 0.6;
  private muted = false;
  private ambientWanted = false;

  /** Call from any user-gesture handler. Safe to call repeatedly. */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.sfxBus = this.ctx.createGain();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.sfxBus.connect(comp);
      comp.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.applyVolume();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.ambientWanted && this.ambientNodes.length === 0) this.startAmbient();
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v));
    this.applyVolume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.applyVolume();
  }

  private applyVolume() {
    if (!this.ctx || !this.master) return;
    const target = this.muted ? 0 : this.volume ** 1.5;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.03);
  }

  // ───────── building blocks ─────────

  private noise(): AudioBuffer {
    if (!this.noiseBuffer && this.ctx) {
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
    }
    return this.noiseBuffer!;
  }

  private tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; when?: number; slideTo?: number; attack?: number; bus?: AudioNode } = {}) {
    if (!this.ctx || !this.sfxBus) return;
    const t0 = this.ctx.currentTime + (opts.when ?? 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur);
    const peak = opts.gain ?? 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (opts.attack ?? 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(opts.bus ?? this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private burst(dur: number, opts: { freq?: number; q?: number; type?: BiquadFilterType; gain?: number; when?: number } = {}) {
    if (!this.ctx || !this.sfxBus) return;
    const t0 = this.ctx.currentTime + (opts.when ?? 0);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise();
    const f = this.ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.value = opts.freq ?? 2000;
    f.Q.value = opts.q ?? 1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(opts.gain ?? 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxBus);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.02);
  }

  // ───────── ambience ─────────

  startAmbient() {
    this.ambientWanted = true;
    if (!this.ctx || !this.sfxBus || this.ambientNodes.length) return;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 3);
    out.connect(this.master!);
    this.ambientGain = out;
    const nodes: AudioNode[] = [out];

    // Machine hum: two detuned low oscillators through a lowpass, slowly breathing.
    const hum = ctx.createGain();
    hum.gain.value = 0.11;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    [55, 55.4, 110.3].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 2 ? 'sine' : 'sawtooth';
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = i === 2 ? 0.5 : 0.35;
      o.connect(og);
      og.connect(lp);
      o.start();
      nodes.push(o, og);
    });
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.12;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 60;
    lfo.connect(lfoGain);
    lfoGain.connect(lp.frequency);
    lfo.start();
    lp.connect(hum);
    hum.connect(out);
    nodes.push(lfo, lfoGain, lp, hum);

    // Air / electronics shimmer.
    const air = ctx.createBufferSource();
    air.buffer = this.noise();
    air.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 4200;
    bp.Q.value = 0.7;
    const ag = ctx.createGain();
    ag.gain.value = 0.012;
    air.connect(bp);
    bp.connect(ag);
    ag.connect(out);
    air.start();
    nodes.push(air, bp, ag);

    // Soft sub-pad shimmer.
    const pad = ctx.createOscillator();
    pad.type = 'sine';
    pad.frequency.value = 329.63;
    const padGain = ctx.createGain();
    padGain.gain.value = 0.012;
    const padLfo = ctx.createOscillator();
    padLfo.frequency.value = 0.07;
    const padLfoGain = ctx.createGain();
    padLfoGain.gain.value = 0.01;
    padLfo.connect(padLfoGain);
    padLfoGain.connect(padGain.gain);
    pad.connect(padGain);
    padGain.connect(out);
    pad.start();
    padLfo.start();
    nodes.push(pad, padGain, padLfo, padLfoGain);
    this.ambientNodes = nodes;
  }

  stopAmbient() {
    this.ambientWanted = false;
    for (const n of this.ambientNodes) {
      try {
        (n as OscillatorNode).stop?.();
      } catch {
        /* already stopped */
      }
      n.disconnect();
    }
    this.ambientNodes = [];
  }

  /** 0..1 — lets the ambience swell while reels spin. */
  setAmbientIntensity(level: number) {
    if (!this.ctx || !this.ambientGain) return;
    this.ambientGain.gain.setTargetAtTime(0.5 + level * 0.5, this.ctx.currentTime, 0.4);
  }

  // ───────── UI ─────────

  click() {
    this.tone(1800, 0.04, { type: 'square', gain: 0.05 });
    this.burst(0.03, { freq: 5000, gain: 0.08, type: 'highpass' });
  }

  /** Tactile detent for the denomination / multiplier selectors. */
  detent(step = 0) {
    this.burst(0.025, { freq: 3200 + step * 500, q: 4, gain: 0.22 });
    this.tone(220 + step * 60, 0.07, { type: 'triangle', gain: 0.12 });
  }

  deposit() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.35, { when: i * 0.07, gain: 0.1, type: 'sine' }));
    this.burst(0.2, { freq: 7000, type: 'highpass', gain: 0.05, when: 0.2 });
  }

  denied() {
    this.tone(180, 0.16, { type: 'sawtooth', gain: 0.1, slideTo: 120 });
    this.tone(150, 0.2, { type: 'square', gain: 0.05, when: 0.1, slideTo: 100 });
  }

  cashOut() {
    [880, 1174.66, 1567.98].forEach((f, i) => this.tone(f, 0.5, { when: i * 0.12, gain: 0.09 }));
    this.burst(0.7, { freq: 6000, type: 'highpass', gain: 0.05, when: 0.1 });
  }

  // ───────── reels ─────────

  spinStart() {
    this.tone(70, 0.55, { type: 'sawtooth', gain: 0.18, slideTo: 260 });
    this.burst(0.5, { freq: 900, q: 0.8, gain: 0.12 });
    this.tone(1400, 0.2, { type: 'sine', gain: 0.05, slideTo: 2600 });
  }

  startReelLoop() {
    if (!this.ctx || !this.sfxBus || this.reelLoop) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise();
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 400;
    filter.Q.value = 2.2;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.16, this.ctx.currentTime + 0.4);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxBus);
    src.start();
    this.reelLoop = { src, filter, gain };
  }

  /** speed 0..1 relative to full reel speed; `activeReels` 0..5 scales loudness. */
  updateReelLoop(speed: number, activeReels: number) {
    if (!this.ctx || !this.reelLoop) return;
    const t = this.ctx.currentTime;
    this.reelLoop.filter.frequency.setTargetAtTime(280 + speed * 1500, t, 0.05);
    this.reelLoop.gain.gain.setTargetAtTime(0.03 + 0.04 * activeReels * Math.min(1, speed * 1.5), t, 0.08);
  }

  stopReelLoop() {
    if (!this.ctx || !this.reelLoop) return;
    const { src, gain } = this.reelLoop;
    gain.gain.cancelScheduledValues(this.ctx.currentTime);
    gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
    src.stop(this.ctx.currentTime + 0.4);
    this.reelLoop = null;
  }

  reelStop(index: number) {
    // Mechanical click + low thunk, panned a touch across the machine.
    this.burst(0.05, { freq: 2600 + index * 180, q: 3, gain: 0.32 });
    this.tone(95 - index * 4, 0.16, { type: 'sine', gain: 0.4, slideTo: 48 });
    this.tone(1200, 0.025, { type: 'square', gain: 0.07 });
  }

  // ───────── wins ─────────

  win(tier: WinTierId) {
    if (tier === 'none') return;
    const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1318.5, 1567.98];
    const notes = { small: 3, nice: 4, big: 6, mega: 7, overload: 8 }[tier];
    for (let i = 0; i < notes; i++) this.tone(scale[i], 0.5, { when: i * 0.09, gain: 0.09 + (tier === 'overload' ? 0.03 : 0), type: 'sine' });
    if (tier === 'big' || tier === 'mega' || tier === 'overload') {
      this.tone(130.81, 1.2, { type: 'sawtooth', gain: 0.1, slideTo: 261.63 });
      this.burst(1.0, { freq: 8000, type: 'highpass', gain: 0.07, when: 0.1 });
    }
    if (tier === 'overload') this.overload();
  }

  private overload() {
    this.tone(55, 3.2, { type: 'sawtooth', gain: 0.2, slideTo: 220, attack: 0.6 });
    this.tone(82.4, 3.2, { type: 'triangle', gain: 0.18, slideTo: 330, attack: 0.5 });
    [0, 0.25, 0.5, 0.75, 1.0, 1.25].forEach((t, i) => this.tone(659.25 * 2 ** (i / 6), 0.8, { when: 0.5 + t, gain: 0.07 }));
    this.burst(2.4, { freq: 600, q: 0.6, gain: 0.18, type: 'lowpass' });
    this.burst(1.2, { freq: 9000, type: 'highpass', gain: 0.1, when: 1.3 });
    this.tone(40, 1.6, { type: 'sine', gain: 0.5, slideTo: 28, when: 1.4 });
  }

  /** Short rising tick used while a win total counts up. */
  countTick(progress: number) {
    this.tone(900 + progress * 900, 0.03, { type: 'triangle', gain: 0.035 });
  }
}

export const sound = new SoundManager();
