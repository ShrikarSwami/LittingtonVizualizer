// Warp tunnel: flying down a twisting tube of lit panels; each panel listens to its own slice of the spectrum.
vec3 render(vec2 uv, vec2 p) {
  p *= rot(uTime * 0.1);
  p += 0.12 * vec2(sin(uTime * 0.37), cos(uTime * 0.29));
  float r = length(p) + 1e-3;
  float a = atan(p.y, p.x) / TAU;
  float z = 0.35 / r + uFlow * 0.9;
  float twist = a + z * 0.12 * sin(uTime * 0.13);
  vec2 g = vec2(twist * 12.0, z * 4.0);
  vec2 cell = floor(g), f = fract(g);
  float h = hash21(vec2(mod(cell.x, 12.0), cell.y) + uSeed);
  float lit = step(0.6 - 0.35 * uMid, h);
  float edge = smoothstep(0.0, 0.08, f.x) * smoothstep(1.0, 0.92, f.x) * smoothstep(0.0, 0.1, f.y) * smoothstep(1.0, 0.9, f.y);
  float s = spec(fract(h * 7.0) * 0.7);
  vec3 c = pal(h * 0.6 + cell.y * 0.03 + uSeed) * edge * (0.05 + lit * (0.15 + 1.1 * s * s));
  c *= smoothstep(0.0, 0.5, r) * 1.2;
  c += pal(z * 0.1) * uBeat * 0.3 / (r * 6.0 + 0.4);
  return max(c, prev(uv) * 0.78);
}
