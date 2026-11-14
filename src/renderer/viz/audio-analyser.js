// Turns the raw audio stream into what the shaders react to: bass / mid / treble levels,
// beat pulses, and a spectrum + waveform texture.

const FFT_SIZE = 2048;
const COLUMNS = 512;
const RING = 16384;

export class Analyser {
  constructor() {
    this.sampleRate = 48000;
    this.ring = new Float32Array(RING);
    this.head = 0;
    this.lastSamplesAt = 0;
    this.lastSoundAt = 0;

    this.window = new Float32Array(FFT_SIZE);
    for (let i = 0; i < FFT_SIZE; i++) this.window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1));
    this.re = new Float32Array(FFT_SIZE);
    this.im = new Float32Array(FFT_SIZE);
    this.mag = new Float32Array(FFT_SIZE / 2);
    this.reverse = new Uint16Array(FFT_SIZE);
    const bits = Math.log2(FFT_SIZE);
    for (let i = 0; i < FFT_SIZE; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.reverse[i] = r;
    }
    this.cos = new Float32Array(FFT_SIZE / 2);
    this.sin = new Float32Array(FFT_SIZE / 2);
    for (let i = 0; i < FFT_SIZE / 2; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / FFT_SIZE);
      this.sin[i] = Math.sin((2 * Math.PI * i) / FFT_SIZE);
    }

    this.columns = new Float32Array(COLUMNS);
    this.texture = new Uint8Array(COLUMNS * 2);
    this.texture.fill(128, COLUMNS);

    // long-run averages (for automatic gain) and the smoothed outputs
    this.average = { bass: 0.01, mid: 0.01, treb: 0.01, vol: 0.01 };
    this.bass = 0; this.mid = 0; this.treb = 0; this.vol = 0;
    this.beat = 0; this.beatCount = 0; this.flow = 0;
    this.beatAverage = 0; this.lastBass = 0; this.lastBeatAt = 0;
    this.idle = true;
  }

  push(samples) {
    const ring = this.ring;
    let head = this.head;
    let loud = false;
    for (let i = 0; i < samples.length; i++) {
      const value = samples[i];
      ring[head] = value;
      head = (head + 1) & (RING - 1);
      if (value > 0.0015 || value < -0.0015) loud = true;
    }
    this.head = head;
    const now = performance.now();
    this.lastSamplesAt = now;
    if (loud) this.lastSoundAt = now;
  }

  fft() {
    const { re, im, reverse, cos, sin, ring, window } = this;
    const start = this.head - FFT_SIZE;
    for (let i = 0; i < FFT_SIZE; i++) {
      re[reverse[i]] = ring[(start + i) & (RING - 1)] * window[i];
      im[i] = 0;
    }
    for (let size = 2; size <= FFT_SIZE; size <<= 1) {
      const half = size >> 1;
      const step = FFT_SIZE / size;
      for (let i = 0; i < FFT_SIZE; i += size) {
        for (let j = 0; j < half; j++) {
          const wr = cos[j * step], wi = -sin[j * step];
          const a = i + j, b = a + half;
          const tr = re[b] * wr - im[b] * wi;
          const ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
        }
      }
    }
    for (let i = 0; i < FFT_SIZE / 2; i++) this.mag[i] = Math.hypot(re[i], im[i]) / (FFT_SIZE / 4);
  }

  band(lowHz, highHz) {
    const binHz = this.sampleRate / FFT_SIZE;
    const low = Math.max(1, Math.floor(lowHz / binHz));
    const high = Math.min(FFT_SIZE / 2 - 1, Math.ceil(highHz / binHz));
    let sum = 0;
    for (let i = low; i <= high; i++) sum += this.mag[i];
    return sum / (high - low + 1);
  }

  update(dt, time) {
    const now = performance.now();
    // No sound for a while (paused, nothing running, or capture not permitted): breathe gently
    // instead of freezing, so the picture is never dead.
    this.idle = now - this.lastSoundAt > 2500;
    if (this.idle) return this.updateIdle(dt, time);

    this.fft();
    const raw = {
      bass: this.band(30, 150),
      mid: this.band(150, 2000),
      treb: this.band(2000, 12000),
    };
    raw.vol = raw.bass * 0.5 + raw.mid * 0.35 + raw.treb * 0.15;

    const slow = 1 - Math.exp(-dt / 5);
    for (const key of ['bass', 'mid', 'treb', 'vol']) {
      this.average[key] += (raw[key] - this.average[key]) * slow;
      const floor = key === 'treb' ? 0.0004 : 0.002;
      const level = Math.min(1.6, (raw[key] / Math.max(this.average[key], floor)) * 0.42);
      const rate = level > this[key] ? 0.025 : 0.13;      // fast attack, slower release
      this[key] += (level - this[key]) * (1 - Math.exp(-dt / rate));
    }

    // Beat: bass jumps well above its recent average, at most ~4 times a second.
    this.beatAverage += (raw.bass - this.beatAverage) * (1 - Math.exp(-dt / 0.9));
    if (raw.bass > this.beatAverage * 1.35 && raw.bass > this.lastBass && raw.bass > 0.004 && now - this.lastBeatAt > 230) {
      this.beat = 1;
      this.beatCount += 1;
      this.lastBeatAt = now;
    } else {
      this.beat *= Math.exp(-dt / 0.2);
    }
    this.lastBass = raw.bass;
    this.flow += dt * (0.35 + 1.5 * this.vol);

    // Spectrum texture: log frequency (40 Hz .. 16 kHz), decibel height.
    const binHz = this.sampleRate / FFT_SIZE;
    const fall = Math.exp(-dt / 0.12);
    for (let x = 0; x < COLUMNS; x++) {
      const hz = 40 * Math.pow(400, x / (COLUMNS - 1));
      const position = hz / binHz;
      const index = Math.min(FFT_SIZE / 2 - 2, Math.floor(position));
      const fraction = position - index;
      const magnitude = this.mag[index] * (1 - fraction) + this.mag[index + 1] * fraction;
      const db = 20 * Math.log10(magnitude + 1e-7);
      const tilt = (x / COLUMNS) * 18;                       // lift the quieter highs
      const value = Math.min(1, Math.max(0, (db + tilt + 62) / 52));
      this.columns[x] = Math.max(value, this.columns[x] * fall);
      this.texture[x] = this.columns[x] * 255;
    }
    // Waveform texture: the most recent 512 samples (every other one, ~21 ms).
    const start = this.head - COLUMNS * 2;
    for (let x = 0; x < COLUMNS; x++) {
      const sample = this.ring[(start + x * 2) & (RING - 1)];
      this.texture[COLUMNS + x] = Math.min(255, Math.max(0, 128 + sample * 180));
    }
  }

  updateIdle(dt, time) {
    const ease = 1 - Math.exp(-dt / 0.6);
    const target = {
      bass: 0.32 + 0.14 * Math.sin(time * 0.9),
      mid: 0.3 + 0.12 * Math.sin(time * 0.63 + 1.7),
      treb: 0.28 + 0.1 * Math.sin(time * 1.31 + 4.1),
    };
    target.vol = (target.bass + target.mid + target.treb) / 3;
    for (const key of ['bass', 'mid', 'treb', 'vol']) this[key] += (target[key] - this[key]) * ease;
    this.beat *= Math.exp(-dt / 0.5);
    if (Math.floor(time / 2.4) !== Math.floor((time - dt) / 2.4)) { this.beat = 0.45; this.beatCount += 1; }
    this.flow += dt * 0.5;
    for (let x = 0; x < COLUMNS; x++) {
      const u = x / COLUMNS;
      const shape = (0.45 + 0.3 * Math.sin(u * 9 + time * 0.8) * Math.sin(u * 3.1 - time * 0.5)) * (1 - u * 0.6);
      this.columns[x] += (shape - this.columns[x]) * ease;
      this.texture[x] = this.columns[x] * 255;
      this.texture[COLUMNS + x] = 128 + 40 * Math.sin(u * 14 + time * 2) * Math.sin(u * Math.PI);
    }
  }
}
