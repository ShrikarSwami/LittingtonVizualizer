// Hex tunnel: a six-sided corridor of neon frames; every beat sends a pulse of light down it.
vec3 render(vec2 uv, vec2 p) {
  p *= rot(uTime * 0.06 + uSeed * TAU);
  p += 0.08 * vec2(sin(uTime * 0.31), cos(uTime * 0.23));
  vec2 ap = abs(p);
  float r = max(ap.x * 0.866 + ap.y * 0.5, ap.y) + 1e-3;       // hexagonal "radius"
  float z = 0.4 / r + uFlow * 0.7;
  float side = floor(fract(atan(p.y, p.x) / TAU + 0.5 / 6.0) * 6.0);
  float along = fract(atan(p.y, p.x) / TAU * 6.0 + 0.5);

  float fz = fract(z * 2.0), iz = floor(z * 2.0);
  float frame = 0.03 / (min(fz, 1.0 - fz) + 0.03);
  float seam = 0.02 / (min(along, 1.0 - along) + 0.02);
  float h = hash21(vec2(side, iz) + uSeed * 9.0);
  float panel = step(0.62, h) * spec(fract(h * 5.0) * 0.8);

  vec3 c = pal(iz * 0.05 + uSeed) * frame * 0.35;
  c += pal(side / 6.0 + 0.5) * seam * 0.22;
  c += pal(h + uTime * 0.03) * panel * 1.4;
  float pulse = exp(-abs(fract(0.4 / r * 0.25 - uBeat * 0.9 + 0.1) - 0.5) * 18.0) * uBeat;
  c += pal(uBeatN * 0.09) * pulse * 0.8;
  c *= smoothstep(0.0, 0.4, r) * 1.05;
  return max(min(c, 1.8), prev(uv) * 0.8);
}
