// Julia drift: a Julia set whose constant slowly circles, so the whole shape keeps re-growing.
vec3 render(vec2 uv, vec2 p) {
  vec2 z = p * rot(uTime * 0.05) * (1.25 - 0.1 * uBass);
  float t = uFlow * 0.15 + uSeed * TAU;
  vec2 c = (0.74 + 0.045 * sin(t * 0.37)) * vec2(cos(t), sin(t)) * (0.97 + 0.04 * uBass);
  float n = 0.0, trap = 1e9;
  vec2 trapPoint = vec2(0.3 * sin(uTime * 0.3), 0.0);
  for (int i = 0; i < 64; i++) {
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    trap = min(trap, length(z - trapPoint));
    if (dot(z, z) > 64.0) break;
    n += 1.0;
  }
  vec3 col;
  if (n >= 64.0) {
    col = pal(trap * 1.5 + uTime * 0.05) * (0.2 + 0.6 * uMid);
  } else {
    float sm = n - log2(log2(dot(z, z))) + 4.0;
    col = pal(sm * 0.045 + uTime * 0.04) * (0.08 + 0.92 * pow(clamp(sm / 22.0, 0.0, 1.0), 0.8)) * (0.6 + 0.4 * sin(sm * 0.9 + uBass * 4.0));
  }
  col += pal(trap + 0.3) * exp(-trap * 7.0) * (0.5 + uTreb);
  col *= 0.85 + 0.4 * uBeat;
  return mix(prev(uv), col, 0.6);
}
