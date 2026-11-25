export type MusicMode = 'off' | 'intro' | 'victory' | 'defeat';

/**
 * Procedural Web Audio synthesizer for live race audio:
 * - Layered engine synthesis (RPM & throttle mapped)
 * - Tire drift screech & nitro boost jet
 * - Multi-layered realistic metal-crunch + low-thud car/wall collision SFX
 * - Gear shift mechanical clunk & start-light beeps
 */
export class RacingAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineSubOsc: OscillatorNode | null = null;
  private engineMainOsc: OscillatorNode | null = null;
  private engineHarmOsc: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private screechFilter: BiquadFilterNode | null = null;
  private screechGain: GainNode | null = null;
  private nitroGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private suspended = false;
  private running = false;
  private lastImpactTime = 0;
  private lastUpdateMs = 0;

  public unlock(): void {
    if (this.running) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();

    // Soft mastering compressor prevents distortion/clipping at sustained max speed + nitro
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.12;

    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.28;
    master.connect(compressor);
    compressor.connect(ctx.destination);

    // Smooth 3-voice GT exhaust synth:
    // - Sub sine (0.5x) for deep low-end warmth
    // - Main sawtooth (1.0x) for sporty engine body
    // - Musical fifth triangle (1.5x) for rich 6-cyl harmonic character (no harsh beating at top speed!)
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 260;
    engineFilter.Q.value = 0.95; // Low-Q warm rolloff eliminates high-speed resonant buzz

    // Subtle high-shelf attenuation tames any residual sawtooth fizz at redline
    const engineWarmth = ctx.createBiquadFilter();
    engineWarmth.type = 'highshelf';
    engineWarmth.frequency.value = 1100;
    engineWarmth.gain.value = -9;

    const engineGain = ctx.createGain();
    engineGain.gain.value = 0.0001;

    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.value = 28;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.58;

    const mainOsc = ctx.createOscillator();
    mainOsc.type = 'sawtooth';
    mainOsc.frequency.value = 56;
    const mainGain = ctx.createGain();
    mainGain.gain.value = 0.34;

    const harmOsc = ctx.createOscillator();
    harmOsc.type = 'triangle';
    harmOsc.frequency.value = 84;
    const harmGain = ctx.createGain();
    harmGain.gain.value = 0.24;

    subOsc.connect(subGain);
    mainOsc.connect(mainGain);
    harmOsc.connect(harmGain);
    subGain.connect(engineFilter);
    mainGain.connect(engineFilter);
    harmGain.connect(engineFilter);
    engineFilter.connect(engineWarmth);
    engineWarmth.connect(engineGain);
    engineGain.connect(master);

    subOsc.start();
    mainOsc.start();
    harmOsc.start();

    // Shared white noise buffer for high-speed wind rush, tire screech, nitro jet & collision crunch
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    // Smooth aerodynamic high-speed wind & road rush layer (makes 180+ km/h feel fast & realistic!)
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = noiseBuffer;
    windSrc.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 340;
    windFilter.Q.value = 0.7;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.0001;
    windSrc.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    windSrc.start();

    const screechSrc = ctx.createBufferSource();
    screechSrc.buffer = noiseBuffer;
    screechSrc.loop = true;
    const screechFilter = ctx.createBiquadFilter();
    screechFilter.type = 'bandpass';
    screechFilter.frequency.value = 1350;
    screechFilter.Q.value = 6.5;
    const screechGain = ctx.createGain();
    screechGain.gain.value = 0.0001;
    screechSrc.connect(screechFilter);
    screechFilter.connect(screechGain);
    screechGain.connect(master);
    screechSrc.start();

    const nitroSrc = ctx.createBufferSource();
    nitroSrc.buffer = noiseBuffer;
    nitroSrc.loop = true;
    const nitroFilter = ctx.createBiquadFilter();
    nitroFilter.type = 'bandpass';
    nitroFilter.frequency.value = 480;
    nitroFilter.Q.value = 1.2;
    const nitroGain = ctx.createGain();
    nitroGain.gain.value = 0.0001;
    nitroSrc.connect(nitroFilter);
    nitroFilter.connect(nitroGain);
    nitroGain.connect(master);
    nitroSrc.start();

    this.ctx = ctx;
    this.masterGain = master;
    this.engineSubOsc = subOsc;
    this.engineMainOsc = mainOsc;
    this.engineHarmOsc = harmOsc;
    this.engineFilter = engineFilter;
    this.engineGain = engineGain;
    this.windFilter = windFilter;
    this.windGain = windGain;
    this.screechFilter = screechFilter;
    this.screechGain = screechGain;
    this.nitroGain = nitroGain;
    this.noiseBuffer = noiseBuffer;
    this.running = true;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.28, this.ctx.currentTime, 0.04);
      if (muted && this.ctx.state === 'running') {
        void this.ctx.suspend();
      } else if (!muted && !this.suspended && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
    }
  }

  public setSuspended(suspended: boolean): void {
    if (this.suspended === suspended) return;
    this.suspended = suspended;
    if (!this.ctx) return;
    if (suspended) {
      if (this.ctx.state === 'running') {
        void this.ctx.suspend();
      }
    } else if (!this.muted && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  public update(
    rpm: number,
    maxRpm: number,
    throttle: number,
    speedRatio: number,
    drift: number,
    nitro: boolean,
    active: boolean,
    isDirtSurface = false
  ): void {
    if (
      !this.running ||
      !this.ctx ||
      this.muted ||
      this.suspended ||
      this.ctx.state !== 'running' ||
      !this.engineSubOsc ||
      !this.engineMainOsc ||
      !this.engineHarmOsc ||
      !this.engineFilter ||
      !this.engineGain ||
      !this.windFilter ||
      !this.windGain ||
      !this.screechFilter ||
      !this.screechGain ||
      !this.nitroGain
    ) {
      return;
    }
    const perfNow = performance.now();
    if (active && perfNow - this.lastUpdateMs < 32) {
      return;
    }
    this.lastUpdateMs = perfNow;
    const now = this.ctx.currentTime;
    if (!active) {
      this.engineGain.gain.setTargetAtTime(0.0001, now, 0.12);
      this.windGain.gain.setTargetAtTime(0.0001, now, 0.1);
      this.screechGain.gain.setTargetAtTime(0.0001, now, 0.06);
      this.nitroGain.gain.setTargetAtTime(0.0001, now, 0.06);
      return;
    }

    // Normalized & softly compressed RPM ratio so sustained top speed never screams or buzzes
    const safeMax = Math.max(6500, maxRpm);
    const rpmNorm = Math.min(1, Math.max(0, (rpm - 950) / (safeMax - 950)));
    const shapedRpm = Math.pow(rpmNorm, 0.86);
    const clampedSpeed = Math.min(1.15, Math.max(0, speedRatio));

    // Rich GT baritone pitch range: 44 Hz idle -> 136 Hz top gear redline (+7 Hz under nitro)
    const baseFreq = 44 + shapedRpm * 92 + (nitro ? 7 : 0);
    this.engineSubOsc.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.045);
    this.engineMainOsc.frequency.setTargetAtTime(baseFreq, now, 0.045);
    this.engineHarmOsc.frequency.setTargetAtTime(baseFreq * 1.5, now, 0.045);

    // Warm low-Q filter opens smoothly with RPM & throttle, softly capped at ~840 Hz for clean max-speed roar
    const filterCutoff = Math.min(
      880,
      180 + shapedRpm * 460 + throttle * 185 + (nitro ? 75 : 0)
    );
    this.engineFilter.frequency.setTargetAtTime(filterCutoff, now, 0.055);

    // Balanced engine level: slightly eased at full top speed so wind rush & exhaust blend smoothly
    const topSpeedEase = clampedSpeed > 0.8 ? (clampedSpeed - 0.8) * 0.045 : 0;
    const targetEngineGain = Math.max(0.12, 0.16 + throttle * 0.11 + shapedRpm * 0.035 - topSpeedEase);
    this.engineGain.gain.setTargetAtTime(targetEngineGain, now, 0.055);

    // Aerodynamic high-speed wind rush builds smoothly above 40% top speed
    const windAmt = Math.max(0, (clampedSpeed - 0.38) / 0.68);
    this.windFilter.frequency.setTargetAtTime(280 + windAmt * 380, now, 0.08);
    this.windGain.gain.setTargetAtTime(
      windAmt > 0.02 ? Math.min(0.14, windAmt * windAmt * 0.125) : 0.0001,
      now,
      0.08
    );

    // Responsive tire screech on tarmac (1350Hz narrow) or loose gravel spray on off-road (680Hz wider)
    this.screechFilter.frequency.setTargetAtTime(
      isDirtSurface ? 660 + drift * 220 : 1280 + drift * 340,
      now,
      0.05
    );
    this.screechFilter.Q.setTargetAtTime(isDirtSurface ? 1.8 : 5.8, now, 0.05);
    this.screechGain.gain.setTargetAtTime(
      drift > 0.12 ? Math.min(0.24, (drift - 0.08) * 0.28) : 0.0001,
      now,
      0.045
    );
    this.nitroGain.gain.setTargetAtTime(nitro ? 0.2 : 0.0001, now, 0.06);
  }

  public playJumpLaunch(): void {
    if (!this.running || !this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    // Rising air-whoosh + suspension spring release
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(340, now + 0.18);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.24);
  }

  public playBeep(high = false): void {
    if (!this.running || !this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(high ? 880 : 440, now);
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (high ? 0.35 : 0.18));
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + (high ? 0.36 : 0.2));
  }

  /**
   * Multi-layered realistic car-to-car & barrier collision SFX:
   * Layer 1: Low-end chassis thud (pitch-dropping punch)
   * Layer 2: Filtered metallic crunch noise burst
   * Layer 3: High-mid metal scrape / body clang resonance (stronger for car-vs-car hits)
   */
  public playImpact(strength: number, kind: 'car' | 'wall' = 'car'): void {
    if (!this.running || !this.ctx || !this.masterGain || this.muted || strength < 0.08) return;
    const now = this.ctx.currentTime;
    if (now - this.lastImpactTime < 0.11) return;
    this.lastImpactTime = now;

    const clamped = Math.min(1, Math.max(0.15, strength));
    const dur = 0.16 + clamped * 0.2;

    // Layer 1: Punchy low-end body thud
    const thudOsc = this.ctx.createOscillator();
    const thudGain = this.ctx.createGain();
    thudOsc.type = 'triangle';
    thudOsc.frequency.setValueAtTime(kind === 'car' ? 118 : 96, now);
    thudOsc.frequency.exponentialRampToValueAtTime(28, now + dur * 0.85);
    thudGain.gain.setValueAtTime(0.42 + clamped * 0.45, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    thudOsc.connect(thudGain);
    thudGain.connect(this.masterGain);
    thudOsc.start(now);
    thudOsc.stop(now + dur + 0.02);

    // Layer 2: Filtered crunch / bodywork crash noise burst
    if (this.noiseBuffer) {
      const noiseSrc = this.ctx.createBufferSource();
      noiseSrc.buffer = this.noiseBuffer;
      const offset = Math.random() * 1.2;

      const crunchFilter = this.ctx.createBiquadFilter();
      crunchFilter.type = 'bandpass';
      crunchFilter.frequency.setValueAtTime(kind === 'car' ? 1350 : 880, now);
      crunchFilter.frequency.exponentialRampToValueAtTime(340, now + dur);
      crunchFilter.Q.value = kind === 'car' ? 1.8 : 1.2;

      const crunchGain = this.ctx.createGain();
      crunchGain.gain.setValueAtTime(0.32 + clamped * 0.48, now);
      crunchGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      noiseSrc.connect(crunchFilter);
      crunchFilter.connect(crunchGain);
      crunchGain.connect(this.masterGain);
      noiseSrc.start(now, offset, dur + 0.03);
    }

    // Layer 3: Metallic clang overtone for crisp car-on-car impacts
    if (kind === 'car' && clamped > 0.22) {
      const clangOsc = this.ctx.createOscillator();
      const clangFilter = this.ctx.createBiquadFilter();
      const clangGain = this.ctx.createGain();
      clangOsc.type = 'sawtooth';
      clangOsc.frequency.setValueAtTime(280 + clamped * 160, now);
      clangOsc.frequency.exponentialRampToValueAtTime(115, now + 0.14);
      clangFilter.type = 'bandpass';
      clangFilter.frequency.value = 920;
      clangFilter.Q.value = 4.2;
      clangGain.gain.setValueAtTime(0.18 + clamped * 0.22, now);
      clangGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      clangOsc.connect(clangFilter);
      clangFilter.connect(clangGain);
      clangGain.connect(this.masterGain);
      clangOsc.start(now);
      clangOsc.stop(now + 0.16);
    }
  }

  public playGearShift(isUpshift: boolean): void {
    if (!this.running || !this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    if (isUpshift) {
      osc.frequency.setValueAtTime(165, now);
      osc.frequency.exponentialRampToValueAtTime(92, now + 0.065);
    } else {
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(210, now + 0.075);
    }
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.085);
  }

  public dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.running = false;
  }
}

/**
 * Procedural Web Audio Game Music Sequencer for Intro Screen & Level Complete Screen.
 * Zero external MP3 dependencies; auto-unlocks on first user gesture and respects global mute.
 */
class GameMusicPlayer {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private mode: MusicMode = 'off';
  private muted = false;
  private timerId: number | null = null;
  private stepIndex = 0;
  private victoryFanfarePlayed = false;
  private defeatStingPlayed = false;

  private ensureContext(): boolean {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return true;
    }
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return false;

    const ctx = new AudioCtx();
    const master = ctx.createGain();
    master.gain.value = this.muted || this.mode === 'off' ? 0.0001 : 0.22;
    master.connect(ctx.destination);

    // Short crisp noise buffer for hi-hats & snares
    const len = Math.floor(ctx.sampleRate * 0.4);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      ch[i] = Math.random() * 2 - 1;
    }

    this.ctx = ctx;
    this.masterGain = master;
    this.noiseBuffer = buf;
    return true;
  }

  public unlock(): void {
    if (!this.ensureContext()) return;
    if (this.mode !== 'off' && this.timerId === null) {
      this.startLoop();
    }
    this.applyVolume();
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyVolume();
  }

  public setMode(nextMode: MusicMode): void {
    if (this.mode === nextMode) return;
    this.mode = nextMode;
    this.stepIndex = 0;
    if (nextMode === 'victory') {
      this.victoryFanfarePlayed = false;
    } else if (nextMode === 'defeat') {
      this.defeatStingPlayed = false;
    }

    if (nextMode === 'off') {
      this.stopLoop();
      this.applyVolume();
      return;
    }

    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      this.applyVolume();
      this.startLoop();
    }
  }

  private applyVolume(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const target =
      this.muted || this.mode === 'off'
        ? 0.0001
        : this.mode === 'victory'
        ? 0.24
        : this.mode === 'defeat'
        ? 0.19
        : 0.20;
    this.masterGain.gain.setTargetAtTime(target, now, 0.08);
  }

  private stopLoop(): void {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private startLoop(): void {
    this.stopLoop();
    if (!this.ctx || this.mode === 'off') return;
    // 16th-note step interval (~126 BPM -> 119ms/step for Intro, ~132 BPM -> 114ms/step for Victory)
    const stepMs = this.mode === 'victory' ? 114 : this.mode === 'defeat' ? 160 : 120;
    this.playCurrentStep();
    this.timerId = window.setInterval(() => {
      if (this.mode === 'off' || !this.ctx || this.ctx.state !== 'running') return;
      this.playCurrentStep();
    }, stepMs);
  }

  private midiToHz(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  private playSynthNote(
    midi: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    cutoff = 2400,
    delaySec = 0
  ): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime + delaySec;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(this.midiToHz(midi), now);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(320, cutoff * 0.45), now + duration);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private playKick(volume = 0.38): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(135, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.11);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  private playHat(open = false, volume = 0.09): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 6800;
    const gain = this.ctx.createGain();
    const dur = open ? 0.11 : 0.04;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(now, 0, dur + 0.01);
  }

  private playSnare(volume = 0.16): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2100;
    filter.Q.value = 1.2;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(now, 0, 0.13);
  }

  private playCurrentStep(): void {
    if (this.mode === 'intro') {
      // Energetic D-minor / F-major arcade motorsport theme (32-step groove)
      const step = this.stepIndex % 32;
      const bar = Math.floor(step / 8); // 4 chords across 32 steps: Dm, Bb, F, C
      const bassRoots = [38, 34, 41, 36]; // D2, Bb1, F2, C2
      const chordVoicings = [
        [62, 65, 69], // Dm
        [58, 62, 65], // Bb
        [60, 65, 69], // F
        [60, 64, 67], // C
      ];
      const leadMelody: Array<number | null> = [
        74, null, 77, null, 81, null, 77, 76,
        74, null, 70, null, 74, null, 77, null,
        81, null, 77, null, 76, null, 72, 74,
        76, null, 79, null, 81, null, 79, null,
      ];

      // Driving 4-on-the-floor kick + snappy snare on backbeats + 8th hi-hats
      if (step % 4 === 0) this.playKick(0.32);
      if (step % 8 === 4) this.playSnare(0.14);
      if (step % 2 === 1) this.playHat(step % 4 === 2, 0.065);

      // Pumping octave synth bass
      const bassRoot = bassRoots[bar];
      const bassMidi = step % 2 === 0 ? bassRoot : bassRoot + 12;
      this.playSynthNote(bassMidi, 0.11, 0.22, 'sawtooth', 950);

      // Bright pad/stab chord hits on bar starts and syncopated beats
      if (step % 8 === 0 || step % 8 === 3 || step % 8 === 6) {
        for (const note of chordVoicings[bar]) {
          this.playSynthNote(note, 0.22, 0.075, 'triangle', 2200);
        }
      }

      // Catchy arcade synth lead hook
      const lead = leadMelody[step];
      if (lead !== null) {
        this.playSynthNote(lead, 0.19, 0.12, 'square', 2800);
      }
    } else if (this.mode === 'victory') {
      // One-shot triumphant brassy fanfare right as Level Complete opens!
      if (!this.victoryFanfarePlayed) {
        this.victoryFanfarePlayed = true;
        const fanfare = [
          { midi: 72, delay: 0.0, dur: 0.14 }, // C5
          { midi: 76, delay: 0.11, dur: 0.14 }, // E5
          { midi: 79, delay: 0.22, dur: 0.16 }, // G5
          { midi: 84, delay: 0.35, dur: 0.52 }, // C6!
        ];
        for (const n of fanfare) {
          this.playSynthNote(n.midi, n.dur, 0.18, 'sawtooth', 3600, n.delay);
          this.playSynthNote(n.midi - 12, n.dur, 0.12, 'triangle', 2400, n.delay);
        }
      }

      // Uplifting C-major championship victory celebration loop (32 steps: C, G, Am, F)
      const step = this.stepIndex % 32;
      const bar = Math.floor(step / 8);
      const bassRoots = [48, 43, 45, 41]; // C3, G2, A2, F2
      const chords = [
        [60, 64, 67, 72], // C
        [59, 62, 67, 71], // G
        [60, 64, 69, 72], // Am
        [60, 65, 69, 72], // F
      ];
      const victoryLead: Array<number | null> = [
        79, null, 84, null, 83, null, 79, null,
        83, null, 86, null, 83, null, 79, 81,
        84, null, 81, null, 79, null, 76, null,
        81, null, 84, null, 86, null, 84, null,
      ];

      if (step % 4 === 0) this.playKick(0.30);
      if (step % 8 === 4) this.playSnare(0.15);
      if (step % 2 === 0) this.playHat(step % 8 === 6, 0.07);

      // Bouncy celebratory bassline
      if (step % 2 === 0) {
        this.playSynthNote(bassRoots[bar] - 12, 0.16, 0.22, 'sawtooth', 1100);
      }

      // Bright triumphant synth brass chords
      if (step % 8 === 0 || step % 8 === 4) {
        for (const note of chords[bar]) {
          this.playSynthNote(note, 0.32, 0.075, 'sawtooth', 2600);
        }
      }

      // Sparkling victory melody
      const vNote = victoryLead[step];
      if (vNote !== null) {
        this.playSynthNote(vNote, 0.21, 0.13, 'triangle', 3400);
      }
    } else if (this.mode === 'defeat') {
      // One-shot unmistakable descending defeat brass sting on Race Lost!
      if (!this.defeatStingPlayed) {
        this.defeatStingPlayed = true;
        const sting = [
          { midi: 67, delay: 0.0, dur: 0.20 }, // G4
          { midi: 65, delay: 0.18, dur: 0.20 }, // F4
          { midi: 63, delay: 0.36, dur: 0.22 }, // Eb4
          { midi: 60, delay: 0.56, dur: 0.68 }, // C4 (low resolve)
        ];
        for (const n of sting) {
          this.playSynthNote(n.midi, n.dur, 0.17, 'sawtooth', 1450, n.delay);
          this.playSynthNote(n.midi - 12, n.dur, 0.14, 'triangle', 900, n.delay);
        }
      }

      // Low-key moody C-minor pit-lane pulse after the initial sting
      if (this.stepIndex >= 6) {
        const step = this.stepIndex % 16;
        const bassRoots = [36, 36, 32, 31]; // C2, C2, Ab1, G1
        const bar = Math.floor(step / 4);
        if (step % 4 === 0) {
          this.playKick(0.22);
          this.playSynthNote(bassRoots[bar], 0.36, 0.18, 'triangle', 680);
        }
        if (step === 0 || step === 8) {
          const pad = step === 0 ? [60, 63, 67] : [56, 60, 63];
          for (const p of pad) {
            this.playSynthNote(p, 0.55, 0.055, 'triangle', 1100);
          }
        }
      }
    }

    this.stepIndex += 1;
  }
}

export const gameMusic = new GameMusicPlayer();
