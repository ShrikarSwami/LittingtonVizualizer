// Chromatic rings: expanding rings split into three colour layers that slide apart on the bass.
vec3 render(vec2 uv, vec2 p) {
  p *= rot(uTime * 0.05);
  p += 0.1 * vec2(sin(uFlow * 0.3 + uSeed * 6.0), cos(uFlow * 0.24));
  vec3 c = vec3(0.0);
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float d = length(p * (1.0 + (fk - 1.0) * (0.03 + 0.09 * uBass)));
    float wobble = 0.05 * sin(atan(p.y, p.x) * (3.0 + fk) + uFlow + fk);
    float ring = pow(0.5 + 0.5 * sin((d + wobble) * 34.0 - uFlow * 4.0 - uBeat * 2.0), 6.0);
    float s = spec(clamp(d * 0.6, 0.0, 0.95));
    c += pal(fk / 3.0 + uTime * 0.02 + uSeed) * ring * (0.25 + 1.2 * s) * exp(-d * 0.7);
  }
  c += pal(uBeatN * 0.1) * uBeat * 0.2 * exp(-dot(p, p) * 12.0);
  return mix(prev(uv), c, 0.55);
}
