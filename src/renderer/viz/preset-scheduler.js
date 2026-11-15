// Decides which preset is showing: shuffled order, a new one on each track and every so often,
// arrow keys to skip, and a lock that stops the automatic changes. The current mood decides
// which presets are in rotation, how long each stays, and how quickly one dissolves into the next.

export class Scheduler {
  constructor(engine, onChange) {
    this.engine = engine;
    this.onChange = onChange;
    this.locked = false;
    this.interval = 30;
    this.fade = 2.8;
    this.position = 0;
    this.elapsed = 0;
    this.setPool(null);
  }

  // `names` is a list of preset names, or null for all of them.
  setPool(names) {
    const all = this.engine.presets.map((_, index) => index);
    const wanted = names ? all.filter((index) => names.includes(this.engine.presets[index].name)) : all;
    this.order = wanted.length ? wanted : all;
    for (let i = this.order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.order[i], this.order[j]] = [this.order[j], this.order[i]];
    }
    // Keep showing the current preset if it belongs to the new pool; otherwise move on.
    const here = this.order.indexOf(this.engine.current);
    this.position = here >= 0 ? here : -1;
  }

  setMood(mood) {
    this.interval = mood.interval;
    this.fade = mood.fade;
    this.setPool(mood.pool);
    if (this.position < 0 && this.engine.current >= 0 && !this.locked) this.show(0, mood.fade, 'mood');
    else if (this.position < 0) this.position = 0;
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
  next(reason = 'manual') { this.show(this.position + 1, reason === 'manual' ? Math.min(1.2, this.fade) : this.fade, reason); }
  back() { this.show(this.position - 1, Math.min(1.2, this.fade), 'back'); }
  toggleLock() { this.locked = !this.locked; this.elapsed = 0; return this.locked; }
  trackChanged() { if (!this.locked) this.next('track'); }

  tick(dt) {
    if (this.locked) return;
    this.elapsed += dt;
    if (this.elapsed > this.interval) this.next('timer');
  }
}
