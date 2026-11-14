// The album art, bold title, and artist + album line.
import { paletteFromImage, DEFAULT_PALETTE } from '../viz/palette.js';

const $ = (id) => document.getElementById(id);

export class NowPlaying {
  constructor(onPalette) {
    this.onPalette = onPalette;
    this.artUrl = null;
    this.request = 0;
  }

  setText(title, artist, album) {
    $('title').textContent = title;
    $('artist').textContent = artist;
    $('album').textContent = album || '';
    document.title = title && artist ? `${title} — ${artist}` : 'LittingtonVizualizer';
  }

  async setArt(url) {
    if (url === this.artUrl) return;
    this.artUrl = url;
    const request = ++this.request;
    const image = $('art');
    const dataUrl = url ? await window.lv.fetchArt(url) : null;
    if (request !== this.request) return;            // a newer track arrived while this loaded
    if (!dataUrl) {
      image.classList.remove('shown');
      this.applyPalette(DEFAULT_PALETTE);
      return;
    }
    const loaded = new Image();
    loaded.onload = () => {
      if (request !== this.request) return;
      image.src = dataUrl;
      image.classList.add('shown');
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
