// Liquid feedback: the picture is stirred by a slow flow field and zoomed into itself,
// while a waveform ring keeps feeding it new colour.
vec3 render(vec2 uv, vec2 p) {
  float r = length(p);
  vec2 q = p;
  vec2 f = vec2(fbm(q * 1.6 + vec2(0.0, uFlow * 0.25)), fbm(q * 1.6 + vec2(5.2, -uFlow * 0.22))) - 0.5;
  q += f * (0.03 + 0.05 * uBass);
  q *= rot(0.012 * sin(uTime * 0.21) + 0.025 * (uMid - 0.4));
  q *= 0.985 - 0.025 * uBeat;
  vec3 c = prev(toUv(q)) * (0.94 - 0.03 * uBeat);

  float ang = atan(p.y, p.x) / TAU + 0.5;
  float w = wave(abs(ang * 2.0 - 1.0));
  float ring = 0.36 + 0.12 * uBass + w * 0.18;
  float d = abs(r - ring);
  c += pal(ang + uTime * 0.05 + uBeatN * 0.07 + uSeed) * smoothstep(0.012, 0.0, d) * (0.35 + 0.6 * uVol);
  c += pal(uBeatN * 0.13) * uBeat * 0.12 * exp(-r * r * 18.0);
  return min(c, 1.3);
}
