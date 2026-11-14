// Renderer entry: wires the audio stream, the visual engine and the overlay together.
import { Engine } from './viz/engine.js';
import { Analyser } from './viz/audio-analyser.js';
import { Scheduler } from './viz/preset-scheduler.js';
import { NowPlaying } from './ui/now-playing.js';
import { LyricsPanel } from './ui/lyrics-panel.js';
import { QueuePanel, extensionSteps } from './ui/queue-panel.js';
import { installHotkeys } from './ui/hotkeys.js';

const $ = (id) => document.getElementById(id);
const lv = window.lv;

const analyser = new Analyser();
const engine = new Engine($('viz'), await lv.loadPresets());
const nowPlaying = new NowPlaying((colours) => engine.setPalette(colours));
const lyrics = new LyricsPanel($('lyrics'));
const queue = new QueuePanel($('queue'));

// ---- small on-screen messages ----

let toastTimer = null;
function toast(text) {
  const node = $('toast');
  node.textContent = text;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 1800);
}

const scheduler = new Scheduler(engine, (name, reason) => {
  if (reason === 'manual' || reason === 'back') toast(name);
});
scheduler.start();

// ---- audio in ----

let audioStatus = { state: 'off' };
lv.onAudio((bytes) => {
  analyser.push(new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)));
});
lv.onAudioStatus((status) => {
  audioStatus = status;
  if (status.sampleRate) analyser.sampleRate = status.sampleRate;
});

// ---- what's playing ----

let state = { source: null, playing: false, track: null, position: 0, positionAt: Date.now() };
let trackId;                     // undefined until the first report
let noteShown = null;

function showTrack(next) {
  const track = next.track;
  const id = track ? track.id : null;
  const changed = id !== trackId;
  const note = track ? null : next.note || (next.source ? 'waiting' : 'none');
  if (!changed && note === noteShown) return;
  const hadTrack = Boolean(trackId);
  trackId = id;
  noteShown = note;

  if (track) {
    nowPlaying.setText(track.title, track.artist, track.album);
    nowPlaying.setArt(track.artUrl || null);
    lyrics.message('');
    lv.getLyrics({ title: track.title, artist: track.artist, album: track.album, duration: track.duration })
      .then((result) => { if (trackId === id) lyrics.set(result); });
    if (hadTrack && changed) scheduler.trackChanged();
    return;
  }

  nowPlaying.setArt(null);
  if (note === 'extension') {
    nowPlaying.setText('YouTube Music', 'Visuals are live. One step left for track info.', '');
    lyrics.message(extensionSteps());
  } else if (note === 'spotify-permission') {
    nowPlaying.setText('Spotify', 'Allow LittingtonVizualizer to control Spotify', '');
    lyrics.message('Open System Settings → Privacy & Security → Automation and switch on Spotify for this app, so it can read what is playing.');
  } else if (note === 'waiting') {
    nowPlaying.setText(next.sourceLabel, 'Press play', '');
    lyrics.message('');
  } else {
    nowPlaying.setText('Nothing playing', 'Open Spotify or YouTube Music', '');
    lyrics.message('');
  }
}

function showStatus() {
  const node = $('status');
  let text = 'No music app running';
  let level = '';
  if (state.source) {
    const hearing = !analyser.idle;
    if (hearing) { text = state.sourceLabel; level = 'live'; }
    else if (audioStatus.state === 'missing') { text = `${state.sourceLabel} · audio helper not built (npm run build:native)`; level = 'warn'; }
    else if (audioStatus.state === 'error') { text = `${state.sourceLabel} · audio capture failed`; level = 'warn'; }
    else if (state.playing) { text = `${state.sourceLabel} · no sound reaching the app — allow audio capture in System Settings → Privacy & Security`; level = 'warn'; }
    else text = `${state.sourceLabel} · paused`;
  }
  node.className = level;
  node.innerHTML = '<span class="dot"></span>';
  node.append(text);
}

lv.onState((next) => {
  state = next;
  showTrack(next);
  queue.update(next);
  showStatus();
});

// ---- controls ----

function switchPanel(tab) {
  const current = document.querySelector('#tabs button.active').dataset.tab;
  const target = tab || (current === 'lyrics' ? 'queue' : 'lyrics');
  for (const button of document.querySelectorAll('#tabs button')) button.classList.toggle('active', button.dataset.tab === target);
  $('lyrics').classList.toggle('active', target === 'lyrics');
  $('queue').classList.toggle('active', target === 'queue');
}
for (const button of document.querySelectorAll('#tabs button')) {
  button.addEventListener('click', () => { switchPanel(button.dataset.tab); button.blur(); });
}

installHotkeys({
  fullscreen: () => lv.toggleFullscreen(),
  next: () => scheduler.next('manual'),
  back: () => scheduler.back(),
  lock: () => toast(scheduler.toggleLock() ? 'Preset locked' : 'Preset unlocked'),
  switchPanel: () => switchPanel(),
  hide: () => document.body.classList.toggle('hide-ui'),
  tint: () => { engine.tint = engine.tint > 0.5 ? 0 : 1; toast(engine.tint ? 'Album colours' : 'Rainbow colours'); },
  help: () => document.body.classList.toggle('show-help'),
});

// ---- the frame loop ----

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const time = now / 1000;
  analyser.update(dt, time);
  scheduler.tick(dt);
  engine.frame(analyser, time, dt);
  nowPlaying.pulse(analyser.beat);
  const position = state.position + (state.playing ? (Date.now() - state.positionAt) / 1000 : 0);
  lyrics.tick(position, state.track ? state.track.duration : 0);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Development aids: jump straight to one preset and hold it.
window.__lvShow = (index) => { scheduler.locked = true; return engine.setPreset(index, 0); };
// Development aid: lets a test check that every preset's shader compiles.
window.__lvCheckPresets = () => engine.presets.map((preset, index) => ({ name: preset.name, ok: engine.ensure(index) }));

lv.ready();
