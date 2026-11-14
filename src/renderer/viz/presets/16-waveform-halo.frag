// Waveform halo: the live waveform drawn as a ring, crowned by spectrum rays, echoing outward.
vec3 render(vec2 uv, vec2 p) {
  float r = length(p);
  float ang = atan(p.y, p.x) / TAU + 0.5;
  float mirror = abs(ang * 2.0 - 1.0);
  vec3 c = prev(toUv(p * rot(0.004) * (0.972 - 0.015 * uBass))) * 0.86;   // echoes spread outward

  float radius = 0.32 + 0.06 * uBass;
  float w = wave(mirror);
  float d = abs(r - radius - w * 0.14);
  c += pal(ang + uTime * 0.06 + uSeed) * smoothstep(0.012, 0.0, d) * 0.9;

  float s = spec(mirror * 0.85);
  float bars = floor(mirror * 64.0);
  float gap = smoothstep(0.0, 0.15, fract(mirror * 64.0)) * smoothstep(1.0, 0.85, fract(mirror * 64.0));
  float ray = step(radius + 0.2, r) * step(r, radius + 0.2 + s * 0.42) * gap;
  c += pal(bars / 64.0 + uTime * 0.03 + uSeed) * ray * 0.3;
  c += pal(uBeatN * 0.11) * uBeat * 0.25 * exp(-r * r * 40.0);
  return min(c, 1.3);
}
