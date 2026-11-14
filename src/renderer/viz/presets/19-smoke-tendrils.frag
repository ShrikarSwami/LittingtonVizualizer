// Smoke tendrils: the spectrum burns along the bottom edge and its smoke curls up the screen.
vec3 render(vec2 uv, vec2 p) {
  vec2 px = 1.0 / uRes;
  float drift = (fbm(vec2(uv.x * 5.0 + uSeed * 9.0, uv.y * 3.0 - uFlow * 0.5)) - 0.5) * 0.012;
  drift += (fbm(vec2(uv.x * 14.0, uv.y * 9.0 - uFlow * 0.9)) - 0.5) * 0.006;
  vec2 src = uv - vec2(drift, 0.0045 + 0.008 * uVol);         // sample from below: smoke rises
  vec3 c = prev(src) * 0.5 + 0.125 * (prev(src + vec2(px.x * 2.0, 0.0)) + prev(src - vec2(px.x * 2.0, 0.0))
         + prev(src + vec2(0.0, px.y * 2.0)) + prev(src - vec2(0.0, px.y * 2.0)));
  c *= 0.972;

  float s = spec(abs(uv.x * 2.0 - 1.0) * 0.85);
  float ember = smoothstep(0.035 + 0.05 * s, 0.0, uv.y) * (0.05 + 0.75 * s * s);
  c += pal(uv.x * 0.6 + uTime * 0.03 + uSeed) * ember;
  c += pal(uBeatN * 0.13) * uBeat * 0.2 * smoothstep(0.2, 0.0, uv.y);
  return min(c, 1.2);
}
