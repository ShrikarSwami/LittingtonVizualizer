// Kaleido fractal: a six-way mirror over a folding fractal that breathes with the music.
vec3 render(vec2 uv, vec2 p) {
  float n = 6.0;
  p *= rot(uTime * 0.07);
  float a = atan(p.y, p.x), r = length(p);
  a = mod(a, TAU / n);
  a = abs(a - PI / n);
  vec2 q = r * vec2(cos(a), sin(a)) * (1.25 - 0.2 * uBass);
  vec3 c = vec3(0.0);
  float k = 0.62 + 0.08 * sin(uFlow * 0.2) + 0.05 * uMid;
  for (int i = 0; i < 9; i++) {
    q = abs(q) / max(dot(q, q), 1e-4) - k;
    q *= rot(0.4 + uSeed);
    float d = length(q);
    c += pal(float(i) * 0.11 + d * 0.2 + uTime * 0.04) * exp(-d * 2.6);
  }
  c *= 0.45 + 0.4 * uBeat + 0.25 * uTreb;
  return mix(prev(uv), min(c, 1.6), 0.5);
}
