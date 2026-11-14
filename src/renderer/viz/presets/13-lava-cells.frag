// Lava cells: molten cells drift and merge; each one glows with its own band of the spectrum.
vec3 voronoi(vec2 x) {
  vec2 n = floor(x), f = fract(x);
  float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = hash22(n + g);
    o = 0.5 + 0.45 * sin(uFlow * 0.4 + TAU * o);
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; id = hash21(n + g); }
    else if (d < d2) { d2 = d; }
  }
  return vec3(d1, d2, id);
}
vec3 render(vec2 uv, vec2 p) {
  vec2 q = p * (2.6 - 0.3 * uBass) + vec2(uFlow * 0.06, uSeed * 13.0);
  q += (vec2(fbm(q * 0.7 + uFlow * 0.08), fbm(q * 0.7 + 4.0)) - 0.5) * 0.9;
  vec3 v = voronoi(q);
  float edge = v.y - v.x;
  float s = spec(v.z * 0.75);
  vec3 c = pal(v.z * 0.5 + uTime * 0.02 + uSeed) * (0.1 + 1.3 * s) * smoothstep(0.0, 0.45, edge) * (1.0 - 0.6 * v.x);
  c += pal(v.z * 0.5 + 0.15) * 0.035 / (edge + 0.035) * (0.3 + 0.9 * uBass + 0.6 * uBeat);
  return mix(prev(uv), min(c, 1.6), 0.5);
}
