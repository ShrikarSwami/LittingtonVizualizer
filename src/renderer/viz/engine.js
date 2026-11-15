// WebGL2 visual engine. Each preset is a fragment shader that receives the previous frame
// (for Milkdrop-style feedback), the audio levels, the spectrum/waveform and the album palette,
// and returns the next frame. Switching presets cross-fades the two shaders over the same feedback.

const VERTEX = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// Everything a preset can use. A preset file defines:  vec3 render(vec2 uv, vec2 p)
//   uv  0..1 across the screen        p  centred, aspect-correct (y from -1 to 1)
const PRESET_HEADER = `#version 300 es
precision highp float;
uniform sampler2D uPrev;   // previous frame
uniform sampler2D uSpec;   // row 0: spectrum (bass on the left), row 1: waveform
uniform vec2 uRes;
uniform float uTime;       // seconds
uniform float uFlow;       // a clock that runs faster when the music is louder
uniform float uDt;
uniform float uBass, uMid, uTreb, uVol;   // smoothed levels, about 0.5 on average, up to ~1.5
uniform float uBeat;       // 1 on a beat, fading to 0
uniform float uBeatN;      // how many beats so far
uniform float uSeed;       // random per preset activation
uniform float uTint;       // 0 = rainbow, 1 = album-art palette
uniform vec3 uC1, uC2, uC3;
in vec2 vUv;
out vec4 fragColor;

#define PI 3.14159265
#define TAU 6.2831853

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x),
             mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.7; a *= 0.5; }
  return v;
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// The colour ramp every preset draws from: album-art colours when tinting is on.
vec3 pal(float t) {
  vec3 rainbow = 0.5 + 0.5 * cos(TAU * (t + vec3(0.0, 0.33, 0.67)));
  float x = fract(t) * 3.0;
  vec3 album = x < 1.0 ? mix(uC1, uC2, smoothstep(0.0, 1.0, x))
             : x < 2.0 ? mix(uC2, uC3, smoothstep(0.0, 1.0, x - 1.0))
                       : mix(uC3, uC1, smoothstep(0.0, 1.0, x - 2.0));
  return mix(rainbow, album, uTint);
}
vec3 prev(vec2 uv) { return texture(uPrev, uv).rgb; }
vec2 toUv(vec2 p) { return p / vec2(uRes.x / uRes.y, 1.0) * 0.5 + 0.5; }   // centred coords back to 0..1
float spec(float x) { return texture(uSpec, vec2(x, 0.25)).r; }
float wave(float x) { return texture(uSpec, vec2(x, 0.75)).r * 2.0 - 1.0; }

vec3 render(vec2 uv, vec2 p);
void main() {
  vec2 p = (vUv * 2.0 - 1.0) * vec2(uRes.x / uRes.y, 1.0);
  fragColor = vec4(clamp(render(vUv, p), 0.0, 8.0), 1.0);
}
#line 1
`;

const MIX_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uA, uB;
uniform float uMix;
in vec2 vUv;
out vec4 fragColor;
void main() { fragColor = mix(texture(uA, vUv), texture(uB, vUv), uMix); }`;

const FINAL_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uFrame;
uniform float uDim, uSaturation, uContrast, uKick;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec2 q = vUv - 0.5;
  vec3 c = texture(uFrame, 0.5 + q * (1.0 - uKick * 0.05)).rgb;   // the picture lunges on a beat
  c = 1.0 - exp(-c * 1.35);                       // soft roll-off instead of clipping
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSaturation);
  c = clamp((c - 0.5) * uContrast + 0.5, 0.0, 1.0);
  c *= 1.0 + uKick * 0.55;                        // ...and flashes
  c *= 1.0 - dot(q, q) * 0.55;                    // vignette
  fragColor = vec4(c * uDim, 1.0);
}`;

const MAX_RENDER_HEIGHT = 1080;

export class Engine {
  constructor(canvas, presets) {
    this.canvas = canvas;
    this.presets = presets.map((preset) => ({ ...preset, program: null, failed: false }));
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.float = Boolean(gl.getExtension('EXT_color_buffer_float'));
    gl.getExtension('OES_texture_float_linear');

    this.vao = gl.createVertexArray();
    this.mixProgram = this.build(MIX_FRAGMENT);
    this.finalProgram = this.build(FINAL_FRAGMENT);

    this.specTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.specTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 512, 2, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(1024));
    for (const [key, value] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, key, value);

    this.targets = [];          // 0,1: feedback ping-pong   2,3: scratch for cross-fades
    this.front = 0;
    this.width = 0;
    this.height = 0;

    this.current = -1;
    this.previous = -1;
    this.fade = 1;
    this.fadeSeconds = 2.5;
    this.seed = Math.random();
    this.previousSeed = this.seed;
    this.tint = 1;
    this.dim = 0.82;
    // mood: eased toward `moodTarget` so a genre change never snaps
    this.mood = { speed: 1, beat: 1, level: 1, punch: 0, saturation: 1.15, contrast: 1 };
    this.moodTarget = { ...this.mood };
    this.clock = Math.random() * 100;   // mood-scaled time handed to the shaders
    this.flow = 0;
    this.colors = [[1, 0.16, 0.78], [0.59, 0.24, 1], [0.16, 0.86, 1]];
    this.targetColors = this.colors.map((c) => c.slice());
  }

  build(fragmentSource) {
    const gl = this.gl;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(info);
      }
      return shader;
    };
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    const uniforms = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const { name } = gl.getActiveUniform(program, i);
      uniforms[name] = gl.getUniformLocation(program, name);
    }
    return { program, uniforms };
  }

  // Compiles a preset the first time it is needed. Returns false if its shader is broken.
  ensure(index) {
    const preset = this.presets[index];
    if (!preset || preset.failed) return false;
    if (!preset.program) {
      try {
        preset.program = this.build(PRESET_HEADER + preset.source);
      } catch (error) {
        preset.failed = true;
        console.error(`[preset] ${preset.name}: ${error.message}`);
        return false;
      }
    }
    return true;
  }

  setPreset(index, fadeSeconds = 2.5) {
    if (index === this.current || !this.ensure(index)) return false;
    this.previous = this.current;
    this.previousSeed = this.seed;
    this.current = index;
    this.seed = Math.random();
    this.fadeSeconds = fadeSeconds;
    this.fade = this.previous < 0 || fadeSeconds <= 0 ? 1 : 0;
    return true;
  }

  setPalette(colors) { this.targetColors = colors.map((c) => c.slice()); }

  setMood(mood) {
    for (const key of Object.keys(this.moodTarget)) this.moodTarget[key] = mood[key];
  }

  resize() {
    const gl = this.gl;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = this.canvas.clientWidth || 1;
    const cssHeight = this.canvas.clientHeight || 1;
    const scale = Math.min(dpr, MAX_RENDER_HEIGHT / cssHeight);
    const width = Math.max(2, Math.round(cssWidth * scale));
    const height = Math.max(2, Math.round(cssHeight * scale));
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;

    for (const target of this.targets) { gl.deleteTexture(target.texture); gl.deleteFramebuffer(target.framebuffer); }
    this.targets = [0, 1, 2, 3].map(() => {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      if (this.float) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return { texture, framebuffer };
    });
  }

  drawPreset(index, seed, source, target, audio, time, dt) {
    const gl = this.gl;
    const { program, uniforms: u } = this.presets[index].program;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source.texture);
    gl.uniform1i(u.uPrev, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.specTexture);
    gl.uniform1i(u.uSpec, 1);
    gl.uniform2f(u.uRes, this.width, this.height);
    const level = this.mood.level;
    gl.uniform1f(u.uTime, this.clock);
    gl.uniform1f(u.uFlow, this.flow);
    gl.uniform1f(u.uDt, dt * this.mood.speed);
    gl.uniform1f(u.uBass, Math.min(1.7, audio.bass * level));
    gl.uniform1f(u.uMid, Math.min(1.7, audio.mid * level));
    gl.uniform1f(u.uTreb, Math.min(1.7, audio.treb * level));
    gl.uniform1f(u.uVol, Math.min(1.7, audio.vol * level));
    gl.uniform1f(u.uBeat, Math.min(1.5, audio.beat * this.mood.beat));
    gl.uniform1f(u.uBeatN, audio.beatCount);
    gl.uniform1f(u.uSeed, seed);
    gl.uniform1f(u.uTint, this.tint);
    gl.uniform3fv(u.uC1, this.colors[0]);
    gl.uniform3fv(u.uC2, this.colors[1]);
    gl.uniform3fv(u.uC3, this.colors[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  frame(audio, time, dt) {
    const gl = this.gl;
    this.resize();
    if (this.current < 0) return;
    gl.bindVertexArray(this.vao);

    const moodEase = 1 - Math.exp(-dt / 1.5);
    for (const key of Object.keys(this.mood)) this.mood[key] += (this.moodTarget[key] - this.mood[key]) * moodEase;
    this.clock += dt * this.mood.speed;
    this.flow += dt * (0.35 + 1.5 * audio.vol) * this.mood.speed;

    // Ease the palette toward the new album's colours instead of snapping.
    const ease = 1 - Math.exp(-dt / 0.8);
    for (let i = 0; i < 3; i++) for (let c = 0; c < 3; c++) {
      this.colors[i][c] += (this.targetColors[i][c] - this.colors[i][c]) * ease;
    }

    gl.bindTexture(gl.TEXTURE_2D, this.specTexture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 512, 2, gl.RED, gl.UNSIGNED_BYTE, audio.texture);

    const source = this.targets[this.front];
    const destination = this.targets[1 - this.front];

    if (this.fade < 1 && this.previous >= 0) {
      this.fade = Math.min(1, this.fade + dt / this.fadeSeconds);
      const t = this.fade * this.fade * (3 - 2 * this.fade);
      this.drawPreset(this.previous, this.previousSeed, source, this.targets[2], audio, time, dt);
      this.drawPreset(this.current, this.seed, source, this.targets[3], audio, time, dt);
      gl.bindFramebuffer(gl.FRAMEBUFFER, destination.framebuffer);
      gl.useProgram(this.mixProgram.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.targets[2].texture);
      gl.uniform1i(this.mixProgram.uniforms.uA, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.targets[3].texture);
      gl.uniform1i(this.mixProgram.uniforms.uB, 1);
      gl.uniform1f(this.mixProgram.uniforms.uMix, t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      this.drawPreset(this.current, this.seed, source, destination, audio, time, dt);
    }
    this.front = 1 - this.front;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.finalProgram.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, destination.texture);
    gl.uniform1i(this.finalProgram.uniforms.uFrame, 0);
    gl.uniform1f(this.finalProgram.uniforms.uDim, this.dim);
    gl.uniform1f(this.finalProgram.uniforms.uSaturation, this.mood.saturation);
    gl.uniform1f(this.finalProgram.uniforms.uContrast, this.mood.contrast);
    gl.uniform1f(this.finalProgram.uniforms.uKick, this.mood.punch * audio.beat);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
