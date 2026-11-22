/**
 * Procedural sound cues built with the Web Audio API, so there are no audio
 * files to load. Each rarity tier has its own cue and rarer tiers ring
 * longer and brighter. The context is created on the first user gesture to
 * satisfy browser autoplay rules.
 */

type Wave = OscillatorType;

interface ToneOptions {
  type?: Wave;
  gain?: number;
  attack?: number;
  detune?: number;
  vibrato?: number;
  /** Adds an inharmonic partial for a struck-bell timbre. */
  bell?: boolean;
}

class AudioCues {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private wet: GainNode | null = null;
  private muted = false;

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  /** Call inside a click or keypress handler before playing anything async. */
  prime(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);

      // A short feedback delay gives the chimes a little space.
      const delayNode = ctx.createDelay(1);
      delayNode.delayTime.value = 0.19;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.32;
      const wet = ctx.createGain();
      wet.gain.value = 0.28;
      wet.connect(delayNode);
      delayNode.connect(feedback);
      feedback.connect(delayNode);
      delayNode.connect(master);

      this.ctx = ctx;
      this.master = master;
      this.wet = wet;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private tone(freq: number, at: number, duration: number, options: ToneOptions = {}): void {
    const { ctx, master, wet } = this;
    if (!ctx || !master || !wet) return;
    const { type = 'sine', gain = 0.5, attack = 0.008, detune = 0, vibrato = 0, bell = false } = options;
    const start = ctx.currentTime + at;
    const end = start + duration;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(gain, start + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    env.connect(master);
    env.connect(wet);

    const partials: Array<[number, number]> = bell ? [[1, 1], [2.76, 0.28], [5.4, 0.08]] : [[1, 1]];
    for (const [ratio, level] of partials) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq * ratio, start);
      osc.detune.value = detune;
      const partialGain = ctx.createGain();
      partialGain.gain.value = level;
      if (vibrato > 0) {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 5.5;
        const depth = ctx.createGain();
        depth.gain.value = vibrato;
        lfo.connect(depth);
        depth.connect(osc.frequency);
        lfo.start(start);
        lfo.stop(end);
      }
      osc.connect(partialGain);
      partialGain.connect(env);
      osc.start(start);
      osc.stop(end + 0.05);
    }
  }

  private get ready(): boolean {
    return !this.muted && this.ctx !== null;
  }

  select(): void {
    if (!this.ready) return;
    this.tone(880, 0, 0.12, { type: 'triangle', gain: 0.12 });
  }

  reject(): void {
    if (!this.ready) return;
    this.tone(196, 0, 0.32, { type: 'triangle', gain: 0.32 });
    this.tone(147, 0.09, 0.42, { type: 'triangle', gain: 0.28 });
  }

  /** Clock tick for the last seconds of a round. */
  tick(): void {
    if (!this.ready) return;
    this.tone(1320, 0, 0.06, { type: 'square', gain: 0.05 });
  }

  flip(): void {
    if (!this.ready) return;
    this.tone(330, 0, 0.18, { type: 'sine', gain: 0.18 });
    this.tone(495, 0.06, 0.2, { type: 'sine', gain: 0.12 });
  }

  /** Tier reveal cue, 1 (Common) to 6 (Serialized). */
  tier(order: number): void {
    if (!this.ready) return;
    switch (order) {
      case 1:
        this.tone(220, 0, 0.5, { type: 'triangle', gain: 0.4 });
        this.tone(330, 0.04, 0.4, { type: 'sine', gain: 0.18 });
        break;
      case 2:
        this.tone(523.25, 0, 0.7, { bell: true, gain: 0.34 });
        this.tone(783.99, 0.1, 0.9, { bell: true, gain: 0.3 });
        break;
      case 3:
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, i * 0.08, 1.1, { bell: true, gain: 0.3 }));
        break;
      case 4:
        this.tone(110, 0, 1.6, { type: 'sine', gain: 0.4, attack: 0.25 });
        [440, 554.37, 659.25, 880, 1318.5].forEach((f, i) => this.tone(f, 0.05 + i * 0.08, 1.3, { bell: true, gain: 0.28 }));
        break;
      case 5:
        this.tone(116.5, 0, 2, { type: 'sine', gain: 0.36, attack: 0.3, vibrato: 2 });
        [466.16, 523.25, 587.33, 659.25, 739.99, 830.61, 932.33].forEach((f, i) =>
          this.tone(f, i * 0.07, 1.4, { bell: true, gain: 0.24, detune: i % 2 ? 9 : -9, vibrato: 3 }),
        );
        break;
      default: {
        this.tone(130.81, 0, 2.6, { type: 'sine', gain: 0.4, attack: 0.35 });
        this.tone(196, 0, 2.6, { type: 'sine', gain: 0.22, attack: 0.4 });
        [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98, 2093].forEach((f, i) =>
          this.tone(f, i * 0.07, 1.8, { bell: true, gain: 0.26 }),
        );
        for (let i = 0; i < 10; i++) {
          this.tone(2200 + Math.random() * 2200, 0.55 + i * 0.09, 0.35, { gain: 0.08 });
        }
      }
    }
  }
}

export const audioCues = new AudioCues();
