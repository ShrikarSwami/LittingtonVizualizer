// The album art, bold title, and artist + album line.
import { paletteFromImage, DEFAULT_PALETTE } from '../viz/palette.js';

const $ = (id) => document.getElementById(id);

// Pixels per second the title drifts when it is too long to fit.
const SCROLL_SPEED = 42;
const MIN_OVERFLOW = 6;      // ignore a sliver that is really just rounding

export class NowPlaying {
  constructor(onPalette) {
    this.onPalette = onPalette;
    this.artUrl = null;
    this.request = 0;
    this.measure = this.measure.bind(this);
    window.addEventListener('resize', this.measure);
  }

  setText(title, artist, album) {
    this.write($('title'), title);
    $('artist').textContent = artist;
    $('album').textContent = album || '';
    this.write($('mini-title'), title);
    $('mini-by').textContent = [artist, album].filter(Boolean).join(' — ');
    document.title = title && artist ? `${title} — ${artist}` : 'LittingtonVizualizer';
    // The new text has to be laid out before it can be measured.
    requestAnimationFrame(this.measure);
  }

  write(host, text) {
    let span = host.querySelector('.scroll');
    if (!span) {
      host.textContent = '';
      span = document.createElement('span');
      span.className = 'scroll';
      host.append(span);
    }
    span.textContent = text;
  }

  // A title that doesn't fit drifts left, holds, and comes back, so the whole name is readable.
  // The big title is allowed its two wrapped lines first; it only scrolls past that.
  measure() {
    for (const host of [$('title'), $('mini-title')]) {
      const span = host && host.querySelector('.scroll');
      if (!span) continue;
      host.classList.remove('marquee');

      // Does it overflow where it sits? The title clamps to two lines, the corner one to one line.
      const style = getComputedStyle(host);
      const inset = parseFloat(style.paddingLeft || 0) + parseFloat(style.paddingRight || 0);
      const room = host.clientWidth - inset;
      const overflows = host.id === 'title'
        ? host.scrollHeight > host.clientHeight + 1
        : host.scrollWidth > host.clientWidth + MIN_OVERFLOW;
      if (!overflows) { host.style.removeProperty('--marquee-shift'); continue; }

      // How wide the name wants to be on one line, which is how far it has to travel.
      host.classList.add('measuring');
      const wanted = span.scrollWidth;
      host.classList.remove('measuring');

      const shift = Math.round(wanted - room);
      if (shift <= MIN_OVERFLOW) { host.style.removeProperty('--marquee-shift'); continue; }
      const seconds = Math.min(40, Math.max(8, (shift / SCROLL_SPEED) * 2 + 4));
      host.style.setProperty('--marquee-shift', `${-shift}px`);
      host.style.setProperty('--marquee-time', `${seconds.toFixed(1)}s`);
      host.classList.add('marquee');
    }
  }

  async setArt(url) {
    if (url === this.artUrl) return;
    this.artUrl = url;
    const request = ++this.request;
    const images = [$('art'), $('mini-art')];
    const dataUrl = url ? await window.lv.fetchArt(url) : null;
    if (request !== this.request) return;            // a newer track arrived while this loaded
    if (!dataUrl) {
      for (const image of images) image.classList.remove('shown');
      this.applyPalette(DEFAULT_PALETTE);
      return;
    }
    const loaded = new Image();
    loaded.onload = () => {
      if (request !== this.request) return;
      for (const image of images) { image.src = dataUrl; image.classList.add('shown'); }
      this.applyPalette(paletteFromImage(loaded));
    };
    loaded.src = dataUrl;
  }

  applyPalette(colours) {
    const css = (c) => `rgb(${c.map((v) => Math.round(v * 255)).join(' ')})`;
    document.documentElement.style.setProperty('--accent', css(colours[0]));
    this.onPalette(colours);
  }

  // A small physical kick on the artwork with each beat.
  pulse(beat) {
    $('art-wrap').style.transform = `scale(${(1 + beat * 0.018).toFixed(4)})`;
  }
}
