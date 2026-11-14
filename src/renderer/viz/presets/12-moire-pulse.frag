// Moire pulse: three sets of ripples cross and interfere; the bass tightens the rings.
vec3 render(vec2 uv, vec2 p) {
  float v = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 centre = 0.55 * vec2(sin(uFlow * 0.3 + fi * 2.1 + uSeed * 6.0), cos(uFlow * 0.23 + fi * 1.3));
    v += sin(length(p - centre) * (26.0 + 12.0 * uBass) - uFlow * 2.0 + fi);
  }
  v /= 3.0;
  vec3 c = pal(v * 0.25 + uTime * 0.03 + uSeed) * smoothstep(-0.25, 0.9, v);
  c += pal(v * 0.25 + 0.4) * pow(abs(v), 6.0) * (0.4 + 1.2 * uTreb);
  c *= 0.65 + 0.6 * uBeat + 0.2 * uMid;
  return mix(prev(uv), c, 0.6);
}
