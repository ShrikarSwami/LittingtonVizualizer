// Lyrics: synced lines that follow the song, or plain text that scrolls with its progress.

export class LyricsPanel {
  constructor(element) {
    this.element = element;
    this.mode = 'empty';
    this.lines = [];
    this.nodes = [];
    this.active = -2;
    this.fill = -1;
    this.message('');
  }

  message(html, fromTop = true) {
    this.mode = 'message';
    this.element.classList.remove('plain');
    this.element.classList.toggle('plain-top', fromTop);
    this.element.classList.add('no-mask');
    this.element.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'message';
    if (typeof html === 'string') box.textContent = html; else box.append(html);
    this.element.append(box);
    return box;
  }

  set(lyrics) {
    if (!lyrics) return this.message('No lyrics found for this one.');
    if (lyrics.instrumental) return this.message('Instrumental');
    const synced = Boolean(lyrics.synced);
    this.mode = synced ? 'synced' : 'plain';
    this.lines = synced ? lyrics.synced : lyrics.plain.map((text) => ({ text }));
    this.active = -2;
    this.fill = -1;
    this.element.classList.toggle('plain', !synced);
    this.element.classList.toggle('plain-top', !synced);
    this.element.classList.remove('no-mask');
    this.element.innerHTML = '';
    this.container = document.createElement('div');
    this.container.className = 'lines';
    this.nodes = this.lines.map((line) => {
      const node = document.createElement('div');
      node.className = 'line';
      node.textContent = line.text || (synced ? '♪' : ' ');
      this.container.append(node);
      return node;
    });
    this.element.append(this.container);
  }

  tick(position, duration) {
    if (this.mode === 'synced') {
      let index = -1;
      let low = 0, high = this.lines.length - 1;
      while (low <= high) {                           // last line that has started
        const middle = (low + high) >> 1;
        if (this.lines[middle].t <= position + 0.15) { index = middle; low = middle + 1; } else high = middle - 1;
      }
      if (index !== this.active) {
        this.active = index;
        this.nodes.forEach((node, i) => {
          node.classList.toggle('now', i === index);
          node.classList.toggle('past', i < index);
          if (i !== index) node.style.removeProperty('--fill');
        });
        const anchor = this.nodes[Math.max(index, 0)];
        const offset = anchor.offsetTop - this.element.clientHeight * 0.3;
        this.container.style.transform = `translateY(${-offset}px)`;
      }
      // The live line fills across as the song moves through it, so the exact
      // spot in the song is visible rather than just which line is current.
      if (index >= 0) {
        const line = this.lines[index];
        const next = this.lines[index + 1];
        const end = next ? next.t : (duration > line.t ? duration : line.t + 5);
        const span = Math.max(0.35, end - line.t);
        const fill = Math.min(1, Math.max(0, (position - line.t) / span));
        const step = Math.round(fill * 200) / 2;     // half-percent steps, enough to look smooth
        if (step !== this.fill) {
          this.fill = step;
          this.nodes[index].style.setProperty('--fill', `${step}%`);
        }
      }
    } else if (this.mode === 'plain' && duration > 0) {
      const travel = Math.max(0, this.container.scrollHeight - this.element.clientHeight * 0.7);
      const progress = Math.min(1, Math.max(0, position / duration));
      const step = Math.round(progress * travel / 4) * 4;
      if (step !== this.active) {
        this.active = step;
        this.container.style.transform = `translateY(${-step}px)`;
      }
    }
  }
}
