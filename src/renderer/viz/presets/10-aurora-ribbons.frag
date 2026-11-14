// Aurora ribbons: curtains of light that ripple sideways; the spectrum sets how bright each stretch burns.
vec3 render(vec2 uv, vec2 p) {
  vec3 c = vec3(0.01, 0.0, 0.03);
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float y = 0.33 * sin(p.x * (0.8 + 0.3 * fi) + uFlow * (0.3 + 0.1 * fi) + fi * 1.7 + uSeed * 9.0)
            + 0.5 * (fbm(vec2(p.x * 1.2 + fi * 5.0, uFlow * 0.15)) - 0.5)
            - 0.55 + fi * 0.14;
    float d = p.y - y;
    float band = d > 0.0 ? exp(-d * (2.4 - 0.9 * uBass)) : exp(d * 14.0);
    float rays = 0.55 + 0.45 * sin(p.x * 40.0 + fbm(vec2(p.x * 6.0, uTime * 0.4 + fi)) * 12.0);
    float s = spec(fract(abs(p.x) * 0.35 + fi * 0.17));
    c += pal(fi * 0.17 + p.x * 0.08 + uTime * 0.02) * band * rays * (0.35 + 1.5 * s);
  }
  float star = step(0.9985, hash21(floor(uv * uRes / 2.0))) * (0.4 + 0.6 * uTreb);
  c += vec3(star) * smoothstep(-0.2, 0.8, p.y);
  c *= 0.85 + 0.35 * uBeat;
  return mix(prev(uv), min(c, 1.6), 0.45);
}
