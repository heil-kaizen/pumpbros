// ============================================================================
//  Audio — fully procedural SFX via WebAudio (no asset files needed).
//  Lazily creates the AudioContext on first user gesture (browser policy).
// ============================================================================

class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
  }

  _ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
  }

  resume() {
    this._ensure();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  _tone(freq, dur, type = 'square', vol = 0.5, slideTo = null) {
    if (!this.enabled) return;
    this._ensure();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + dur);
  }

  _noise(dur, vol = 0.5, filterFreq = 1200) {
    if (!this.enabled) return;
    this._ensure();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur);
  }

  jump()   { this._tone(420, 0.12, 'square', 0.35, 720); }
  hitLight(){ this._noise(0.08, 0.4, 2200); this._tone(220, 0.06, 'square', 0.2); }
  hitHeavy(){ this._noise(0.16, 0.6, 1400); this._tone(120, 0.12, 'sawtooth', 0.3, 60); }
  shoot()  { this._tone(880, 0.1, 'sawtooth', 0.3, 200); }
  ko()     { this._tone(180, 0.5, 'sawtooth', 0.5, 40); this._noise(0.4, 0.4, 800); }
  shield() { this._tone(300, 0.1, 'sine', 0.25); }
  select() { this._tone(660, 0.07, 'square', 0.3, 990); }
  back()   { this._tone(330, 0.09, 'square', 0.25, 180); }
  start()  { this._tone(523, 0.1, 'square', 0.3); setTimeout(() => this._tone(784, 0.18, 'square', 0.3), 90); }
}

export const sfx = new Sfx();
