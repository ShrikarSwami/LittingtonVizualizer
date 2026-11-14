// Mandel zoom: diving into Seahorse Valley and back out, with the colour bands rippling on the bass.
vec3 render(vec2 uv, vec2 p) {
  float depth = 0.5 - 0.5 * cos(uFlow * 0.06 + uSeed * TAU);
  float scale = 1.6 * exp(-depth * 8.0);
  vec2 c = vec2(-0.743643887, 0.131825904) + (p * rot(uTime * 0.03)) * scale;
  vec2 z = vec2(0.0);
  float n = 0.0;
  for (int i = 0; i < 110; i++) {
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    if (dot(z, z) > 256.0) break;
    n += 1.0;
  }
  vec3 col;
  if (n < 110.0) {
    float sm = n - log2(log2(dot(z, z))) + 4.0;
    col = pal(sm * 0.02 + uTime * 0.05 + uBeatN * 0.03) * (0.3 + 0.7 * (0.5 + 0.5 * sin(sm * 0.35 + uBass * 3.0)));
  } else {
    col = pal(uTime * 0.05) * 0.08 * (1.0 + 2.5 * uBeat);
  }
  return mix(prev(uv), col, 0.7);
}
