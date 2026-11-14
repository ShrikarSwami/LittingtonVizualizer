// Decides which preset is showing: shuffled order, a new one on each track and every ~30 s,
// arrow keys to skip, and a lock that stops the automatic changes.

const AUTO_SECONDS = 30;

export class Scheduler {
  constructor(engine, onChange) {
    this.engine = engine;
    this.onChange = onChange;
    this.locked = false;
    this.order = engine.presets.map((_, index) => index);
    for (let i = this.order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.order[i], this.order[j]] = [this.order[j], this.order[i]];
    }
    this.position = 0;
    this.elapsed = 0;
  }

  show(position, fade, reason) {
    const count = this.order.length;
    // Skip over any preset whose shader failed to compile.
    for (let tries = 0; tries < count; tries++) {
      this.position = ((position % count) + count) % count;
      const index = this.order[this.position];
      if (this.engine.setPreset(index, fade) || this.engine.current === index) {
        this.elapsed = 0;
        this.onChange(this.engine.presets[index].name, reason);
        return;
      }
      position += reason === 'back' ? -1 : 1;
    }
  }

  start() { this.show(0, 0, 'start'); }
  next(reason = 'manual') { this.show(this.position + 1, reason === 'manual' ? 1.2 : 2.8, reason); }
  back() { this.show(this.position - 1, 1.2, 'back'); }
  toggleLock() { this.locked = !this.locked; this.elapsed = 0; return this.locked; }
  trackChanged() { if (!this.locked) this.next('track'); }

  tick(dt) {
    if (this.locked) return;
    this.elapsed += dt;
    if (this.elapsed > AUTO_SECONDS) this.next('timer');
  }
}
