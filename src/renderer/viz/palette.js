// Picks three vivid, distinct colours out of an album cover for the shaders to draw with.

export const DEFAULT_PALETTE = [[1, 0.16, 0.78], [0.59, 0.24, 1], [0.16, 0.86, 1]];
const BINS = 24;

function toHsv(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

function fromHsv(h, s, v) {
  const f = (n) => {
    const k = (n + h * 6) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5), f(3), f(1)];
}

export function paletteFromImage(image) {
  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, size, size);
  const { data } = context.getImageData(0, 0, size, size);

  const bins = Array.from({ length: BINS }, () => ({ weight: 0, x: 0, y: 0, s: 0, v: 0 }));
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    const [h, s, v] = toHsv(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
    const weight = s * s * v;                 // colourful, bright pixels count most
    if (weight < 0.02) continue;
    const bin = bins[Math.floor(h * BINS) % BINS];
    bin.weight += weight;
    bin.x += Math.cos(h * 2 * Math.PI) * weight;
    bin.y += Math.sin(h * 2 * Math.PI) * weight;
    bin.s += s * weight;
    bin.v += v * weight;
    total += weight;
  }
  if (total < 4) return DEFAULT_PALETTE.map((c) => c.slice());    // black-and-white cover

  const distance = (a, b) => Math.min(Math.abs(a - b), BINS - Math.abs(a - b));
  const chosen = [];
  for (let pick = 0; pick < 3; pick++) {
    let best = -1;
    for (let i = 0; i < BINS; i++) {
      if (chosen.some((c) => distance(c, i) < 3)) continue;
      if (best < 0 || bins[i].weight > bins[best].weight) best = i;
    }
    if (best < 0 || bins[best].weight < total * 0.04) break;
    chosen.push(best);
  }

  const colours = chosen.map((index) => {
    const bin = bins[index];
    const hue = (Math.atan2(bin.y, bin.x) / (2 * Math.PI) + 1) % 1;
    return [hue, Math.max(0.6, Math.min(1, bin.s / bin.weight)), Math.max(0.88, bin.v / bin.weight)];
  });
  // A cover with one dominant colour: build the others from neighbours of that hue.
  const offsets = [0.09, -0.11];
  while (colours.length < 3) {
    const [h, s, v] = colours[0];
    colours.push([(h + offsets[colours.length - 1] + 1) % 1, s * 0.9, v]);
  }
  return colours.map(([h, s, v]) => fromHsv(h, s, v));
}
