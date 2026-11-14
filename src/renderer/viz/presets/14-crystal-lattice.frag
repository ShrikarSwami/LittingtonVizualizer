// Crystal lattice: two layers of triangular facets turning against each other and catching the light.
vec3 facets(vec2 p, float scale, float seed) {
  vec2 q = p * scale;
  vec2 s = vec2(q.x - q.y * 0.57735, q.y * 1.1547);      // skew to a triangular grid
  vec2 id = floor(s), f = fract(s);
  float upper = step(1.0, f.x + f.y);
  vec2 cell = id + upper * 0.5;
  float h = hash21(cell + seed);
  float edge = min(min(f.x, f.y), abs(f.x + f.y - 1.0));
  float flash = 0.5 + 0.5 * sin(uTime * (0.5 + 2.0 * h) + h * TAU + uBeatN * 0.8 * step(0.6, h));
  float s2 = spec(h * 0.8);
  vec3 c = pal(h * 0.7 + seed * 0.1 + uTime * 0.02) * (0.12 + 0.5 * flash + 1.1 * s2 * step(0.45, h));
  c *= smoothstep(0.0, 0.06, edge);
  c += pal(h + 0.3) * 0.015 / (edge + 0.02) * (0.3 + uTreb);
  return c;
}
vec3 render(vec2 uv, vec2 p) {
  float zoom = 1.0 + 0.12 * sin(uFlow * 0.2) - 0.1 * uBass;
  vec3 c = facets(p * rot(uTime * 0.04 + uSeed) * zoom, 3.0, 1.0 + uSeed * 20.0);
  c = max(c, 0.7 * facets(p * rot(-uTime * 0.06) * zoom, 6.5, 7.0 + uSeed * 20.0));
  c *= 0.8 + 0.45 * uBeat;
  return mix(prev(uv), min(c, 1.6), 0.55);
}
