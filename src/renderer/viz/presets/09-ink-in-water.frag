// Ink in water: each beat drops ink that curls away along a slow current.
vec2 curl(vec2 p) {
  float e = 0.02;
  float n1 = fbm(p + vec2(0.0, e)), n2 = fbm(p - vec2(0.0, e));
  float n3 = fbm(p + vec2(e, 0.0)), n4 = fbm(p - vec2(e, 0.0));
  return vec2(n1 - n2, n4 - n3) / (2.0 * e);
}
vec3 render(vec2 uv, vec2 p) {
  float aspect = uRes.x / uRes.y;
  vec2 v = curl(p * 1.3 + vec2(uFlow * 0.04, uSeed * 9.0));
  vec2 src = p - v * (0.0035 + 0.006 * uVol);
  vec2 px = 1.5 / uRes;
  vec2 s = toUv(src);
  // a touch of diffusion so the ink softens as it travels
  vec3 c = prev(s) * 0.6 + 0.1 * (prev(s + vec2(px.x, 0.0)) + prev(s - vec2(px.x, 0.0)) + prev(s + vec2(0.0, px.y)) + prev(s - vec2(0.0, px.y)));
  c *= 0.993;

  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 centre = (hash22(vec2(uBeatN + fi * 7.3, uSeed * 31.0)) - 0.5) * vec2(aspect * 1.5, 1.5);
    float d = length(p - centre);
    c += pal(uBeatN * 0.13 + fi * 0.21 + uSeed) * exp(-d * d / (0.003 + 0.012 * uBass)) * uBeat * 0.55;
  }
  vec2 pen = 0.55 * vec2(sin(uFlow * 0.5) * aspect * 0.8, cos(uFlow * 0.37));
  c += pal(uTime * 0.04) * exp(-dot(p - pen, p - pen) * 500.0) * (0.15 + 0.5 * uTreb);
  return min(c, 1.4);
}
