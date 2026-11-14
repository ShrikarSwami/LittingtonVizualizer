// Spiral galaxy: tilted spiral arms of dust around a bright core, with stars that glint on the highs.
vec3 render(vec2 uv, vec2 p) {
  vec2 q = p * 0.62 * rot(0.5 + uSeed * 3.0);
  q.y *= 1.55;                                             // tilt the disc
  q *= rot(-uFlow * 0.08);
  float r = length(q) + 1e-3;
  float a = atan(q.y, q.x);
  float arm = sin(a * 2.0 - log(r + 0.05) * 5.0);
  float dust = fbm(q * rot(log(r) * 2.0) * 4.0 + uSeed * 9.0);
  vec3 c = pal(r * 0.6 + 0.1 * arm + uSeed + uTime * 0.01) * pow(0.5 + 0.5 * arm, 2.0) * exp(-r * 1.5) * (0.5 + 1.8 * dust) * (1.3 + 1.6 * uBass);
  c += vec3(1.0, 0.92, 0.8) * exp(-r * 9.0) * (0.9 + 1.2 * uBeat);
  c += pal(r) * exp(-r * 3.0) * 0.4;

  vec2 g = floor(p * 110.0);
  float h = hash21(g + uSeed * 7.0);
  float twinkle = 0.5 + 0.5 * sin(uTime * (2.0 + 6.0 * h) + h * 40.0);
  c += vec3(step(0.992, h)) * twinkle * (0.25 + 1.2 * uTreb);
  return mix(prev(uv), c, 0.5);
}
