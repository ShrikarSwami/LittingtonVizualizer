// Vortex starfield: sparks are born near the centre and flung outward along a spiral.
vec3 render(vec2 uv, vec2 p) {
  float r = length(p);
  vec2 q = p * rot(0.03 + 0.045 * uMid) * (0.955 - 0.035 * uBass);
  vec3 c = prev(toUv(q)) * 0.925;

  vec2 g = floor(p * 90.0);
  float h = hash21(g + floor(uTime * 30.0) * 13.1);
  c += pal(hash21(g) * 0.35 + uTime * 0.03 + uSeed) * step(0.9982 - 0.004 * uTreb, h) * smoothstep(1.0, 0.0, r) * 3.0;
  c += pal(uBeatN * 0.1 + uSeed) * uBeat * 0.3 * exp(-r * r * 30.0);
  return min(c, 1.6);
}
