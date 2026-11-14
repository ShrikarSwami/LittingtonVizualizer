// Reactive mesh: a glowing net that the bass bends and the beat punches outward.
vec3 render(vec2 uv, vec2 p) {
  vec3 c = prev(toUv(p * (1.012 + 0.01 * uBass))) * 0.9;     // trails drift inward

  vec2 q = p * 3.2;
  q *= 1.0 - 0.35 * uBeat * exp(-dot(p, p) * 1.5);
  q += 0.4 * uBass * vec2(sin(q.y * 1.3 + uFlow), cos(q.x * 1.1 - uFlow * 0.8));
  q += (vec2(fbm(q * 0.5 + uFlow * 0.1), fbm(q * 0.5 + 7.0 - uFlow * 0.1)) - 0.5) * 1.6;
  q *= rot(uTime * 0.03 + uSeed);

  vec2 g = abs(fract(q) - 0.5);
  float line = 0.5 - max(g.x, g.y);                         // distance to the nearest grid line
  float glow = 0.014 / (line + 0.014);
  vec2 id = floor(q + 0.5);
  float node = exp(-dot(fract(q + 0.5) - 0.5, fract(q + 0.5) - 0.5) * 60.0);
  float s = spec(hash21(id) * 0.8);

  vec3 mesh = pal(id.x * 0.07 + id.y * 0.05 + uTime * 0.04) * glow * (0.25 + 0.5 * uMid);
  mesh += pal(hash21(id) + uTime * 0.05) * node * (0.3 + 2.2 * s);
  return max(c, min(mesh, 1.5));
}
