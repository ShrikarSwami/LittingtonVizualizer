// Visual moods. The song's genre picks one (or you pick one in the settings menu):
// how fast things move, how hard beats hit, how long a preset stays, and which presets suit it.

export const MOODS = {
  neutral: {
    label: 'Neutral', speed: 1, beat: 1, level: 1, punch: 0, saturation: 1.15, contrast: 1,
    interval: 30, fade: 2.8, pool: null,
  },
  // rap, trap, metal: fast, sharp, hard cuts, the picture kicks on every beat
  hype: {
    label: 'Hype', speed: 1.6, beat: 1.5, level: 1.25, punch: 0.24, saturation: 1.35, contrast: 1.18,
    interval: 14, fade: 0.9,
    pool: ['warp tunnel', 'kaleido fractal', 'reactive mesh', 'vortex starfield', 'moire pulse',
      'fractal flame', 'hex tunnel', 'chromatic rings', 'crystal lattice', 'julia drift'],
  },
  // R&B, soul, jazz: slow, fluid, long dissolves, beats only nudge
  smooth: {
    label: 'Smooth', speed: 0.6, beat: 0.6, level: 0.85, punch: 0, saturation: 1.05, contrast: 0.95,
    interval: 45, fade: 5,
    pool: ['liquid feedback', 'plasma bloom', 'ink in water', 'aurora ribbons', 'lava cells',
      'spiral galaxy', 'smoke tendrils', 'particle nebula', 'mandel zoom'],
  },
  // pop, dance: bright, saturated, bouncy
  pop: {
    label: 'Pop', speed: 1.15, beat: 1.2, level: 1.05, punch: 0.1, saturation: 1.45, contrast: 1.06,
    interval: 22, fade: 2,
    pool: ['plasma bloom', 'kaleido fractal', 'moire pulse', 'lava cells', 'crystal lattice',
      'waveform halo', 'chromatic rings', 'julia drift', 'reactive mesh', 'liquid feedback'],
  },
};

export const MOOD_ORDER = ['auto', 'hype', 'smooth', 'pop', 'neutral'];
