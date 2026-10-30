/** Gentle synthesised sounds, so there is nothing to download. */
export class Sound {
  private ctx: AudioContext | null = null;

  constructor(public muted = false) {}

  /** Must be called from a user gesture so iOS lets audio play. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private tone(freq: number, start: number, length: number, type: OscillatorType = 'sine', volume = 0.18): void {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime + start;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + length + 0.05);
  }

  tap(): void {
    this.tone(660, 0, 0.1, 'sine', 0.08);
  }

  /** Two pieces joining: a soft wooden click. */
  join(): void {
    this.tone(220, 0, 0.08, 'triangle', 0.25);
    this.tone(440, 0.01, 0.06, 'sine', 0.1);
  }

  /** A piece settling into its place on the board. */
  place(): void {
    this.join();
    this.tone(784, 0.06, 0.35, 'sine', 0.09);
  }

  win(): void {
    const tune = [523, 659, 784, 1047, 784, 1047];
    tune.forEach((f, i) => this.tone(f, i * 0.18, 0.55, 'triangle', 0.14));
    tune.forEach((f, i) => this.tone(f / 2, i * 0.18, 0.55, 'sine', 0.07));
  }
}
