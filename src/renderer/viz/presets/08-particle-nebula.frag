// Particle nebula: drifting star layers smeared into gas by a slow swirl.
float starLayer(vec2 p, float scale, float seed) {
  vec2 g = p * scale;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  vec2 offset = (hash22(id + seed) - 0.5) * 0.7;
  float twinkle = 0.5 + 0.5 * sin(uTime * (1.0 + 3.0 * hash21(id + seed)) + hash21(id + 3.0) * TAU);
  float size = 0.02 + 0.05 * hash21(id + seed * 2.0);
  return twinkle * smoothstep(size, 0.0, length(f - offset));
}
vec3 render(vec2 uv, vec2 p) {
  float r = length(p);
  vec2 swirl = p * rot(0.02 / (r + 0.25) * (0.5 + uMid)) * (0.992 - 0.012 * uBass);
  vec3 c = prev(toUv(swirl)) * 0.955;

  vec3 stars = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 q = p * rot(fi * 1.3 + uSeed) + vec2(uFlow * 0.03 * (fi + 1.0), uFlow * 0.017);
    float s = starLayer(q, 7.0 + fi * 6.0, fi * 17.0 + uSeed * 50.0);
    stars += pal(fi * 0.31 + r * 0.3 + uTime * 0.02) * s * (0.5 + 1.4 * (fi == 0.0 ? uBass : fi == 1.0 ? uMid : uTreb));
  }
  float gas = fbm(p * 1.5 + vec2(uFlow * 0.05, -uFlow * 0.03));
  c += pal(gas + uTime * 0.02) * pow(gas, 3.0) * 0.09 * (0.5 + uVol);
  c += stars * 0.85;
  c += pal(uBeatN * 0.17) * uBeat * 0.1 * exp(-r * r * 6.0);
  return min(c, 1.8);
}
