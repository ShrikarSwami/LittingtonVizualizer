// Fractal flame: a point is swirled and folded again and again; where its path lingers, filaments glow.
vec3 render(vec2 uv, vec2 p) {
  vec2 q = p * 1.4 * rot(uTime * 0.04);
  vec3 c = vec3(0.0);
  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    float r2 = dot(q, q);
    q = vec2(q.x * sin(r2) - q.y * cos(r2), q.x * cos(r2) + q.y * sin(r2));
    q = sin(q * 1.6 + vec2(uFlow * 0.2, -uFlow * 0.17) + uSeed * 6.0) * (1.2 + 0.35 * uBass);
    c += pal(fi * 0.09 + length(q) * 0.3 + uTime * 0.03 + uSeed) * 0.011 / (abs(q.x * q.y) + 0.02);
  }
  c *= 0.8 + 0.7 * uMid + 0.6 * uBeat;
  return mix(prev(toUv(p * 0.995)), min(c, 1.8), 0.4);
}
