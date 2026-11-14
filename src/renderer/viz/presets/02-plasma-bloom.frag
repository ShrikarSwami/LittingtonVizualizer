// Plasma bloom: folded sine fields that swell with the bass and sparkle with the highs.
vec3 render(vec2 uv, vec2 p) {
  vec2 q = p * (1.4 - 0.3 * uBass);
  float t = uFlow * 0.5 + uSeed * 20.0;
  for (int i = 1; i < 5; i++) {
    float fi = float(i);
    q += vec2(sin(q.y * fi * 1.3 + t + fi), cos(q.x * fi * 1.1 - t * 0.8 + fi * 2.0)) * (0.45 / fi);
  }
  float v = sin(q.x * 1.5 + t) + sin(q.y * 1.7 - t * 0.7) + sin(length(q) * 2.0 - t * 1.3);
  vec3 c = pal(v * 0.16 + uTime * 0.03 + uSeed) * (0.3 + 0.7 * smoothstep(-1.6, 2.2, v));
  c += pal(v * 0.16 + 0.5) * pow(max(0.0, sin(v * 3.0 + uTime)), 8.0) * (0.25 + uTreb);
  c *= 0.75 + 0.55 * uBeat;
  return mix(prev(uv), c, 0.35);
}
