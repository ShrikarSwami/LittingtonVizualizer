// Renderer entry: wires the audio stream, the visual engine and the overlay together.
import { Engine } from './viz/engine.js';
import { Analyser } from './viz/audio-analyser.js';
import { Scheduler } from './viz/preset-scheduler.js';
import { MOODS, MOOD_ORDER } from './viz/moods.js';
import { startLoopback } from './viz/loopback.js';
import { NowPlaying } from './ui/now-playing.js';
import { LyricsPanel } from './ui/lyrics-panel.js';
import { QueuePanel } from './ui/queue-panel.js';
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
if (lv.platform === 'win32') {
  // Windows has no per-app helper: listen to the system's output instead.
  startLoopback(analyser)
    .then(() => { audioStatus = { state: 'running' }; })
    .catch((error) => { audioStatus = { state: 'error' }; console.error(`[audio] ${error.message}`); });
}
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
    lyrics.message('');
    lv.getLyrics({ title: track.title, artist: track.artist, album: track.album, duration: track.duration })
      .then((result) => { if (trackId === id) lyrics.set(result); });
    if (hadTrack && changed) scheduler.trackChanged();
    return;
  }

  nowPlaying.setArt(null);
  if (note === 'spotify-permission') {
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
    else if (state.playing && lv.platform === 'darwin') { text = `${state.sourceLabel} · no sound reaching the app — allow audio capture in System Settings → Privacy & Security`; level = 'warn'; }
    else if (state.playing) { text = `${state.sourceLabel} · no sound reaching the app`; level = 'warn'; }
    else text = `${state.sourceLabel} · paused`;
  }
  node.className = level;
  node.innerHTML = '<span class="dot"></span>';
  node.append(text);
}

lv.onState((next) => {
  state = next;
  showTrack(next);
  // Artwork can turn up a moment after the track does (it may have to be looked up).
  if (next.track) nowPlaying.setArt(next.track.artUrl || null);
  applyMood(true);
  queue.update(next);
  showStatus();
  showTransport();
});

// ---- transport ----

// Windows drives playback through its own media controls; macOS has no equivalent here.
const canControl = lv.platform === 'win32';

function showTransport() {
  const bar = $('transport');
  if (!bar) return;
  bar.classList.toggle('unavailable', !canControl || !state.source);
  $('playpause').classList.toggle('playing', Boolean(state.playing));
}

if (canControl) {
  const press = (name) => (event) => {
    event.currentTarget.blur();
    // Assume the press lands: Windows takes a moment to report the new state back.
    if (name === 'playpause') $('playpause').classList.toggle('playing');
    lv.mediaCommand(name);
  };
  $('prev').addEventListener('click', press('prev'));
  $('next').addEventListener('click', press('next'));
  $('playpause').addEventListener('click', press('playpause'));
}
showTransport();

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

// ---- display settings: how much song info to show, and where ----

const INFO_MODES = ['full', 'corner', 'off'];
const INFO_NAMES = { full: 'Full song info', corner: 'Song info in the corner', off: 'Song info off' };
const prefs = { info: 'full', corner: 'bl', mood: 'auto' };
try {
  if (MOOD_ORDER.includes(localStorage.getItem('lv.mood'))) prefs.mood = localStorage.getItem('lv.mood');
  if (INFO_MODES.includes(localStorage.getItem('lv.info'))) prefs.info = localStorage.getItem('lv.info');
  if (['tl', 'tr', 'bl', 'br'].includes(localStorage.getItem('lv.corner'))) prefs.corner = localStorage.getItem('lv.corner');
} catch { /* storage unavailable: defaults are fine */ }

function applyPrefs() {
  document.body.dataset.info = prefs.info;
  document.body.dataset.corner = prefs.corner;
  for (const button of document.querySelectorAll('#info-mode button')) button.setAttribute('aria-pressed', String(button.dataset.info === prefs.info));
  for (const button of document.querySelectorAll('#corner-pick button')) button.setAttribute('aria-pressed', String(button.dataset.corner === prefs.corner));
  $('corner-pick').classList.toggle('disabled', prefs.info !== 'corner');
  $('corner-label').classList.toggle('disabled', prefs.info !== 'corner');
  for (const button of document.querySelectorAll('#mood-pick button')) button.setAttribute('aria-pressed', String(button.dataset.mood === prefs.mood));
  try {
    localStorage.setItem('lv.info', prefs.info);
    localStorage.setItem('lv.corner', prefs.corner);
    localStorage.setItem('lv.mood', prefs.mood);
  } catch { /* not saved */ }
}
applyPrefs();

// ---- mood: from the song's genre, unless one is pinned in the menu ----

let activeMood = null;
function applyMood(announce) {
  const name = prefs.mood === 'auto' ? (state.mood || 'neutral') : prefs.mood;
  const genre = state.genre || '';
  $('mood-hint').textContent = prefs.mood === 'auto'
    ? (genre ? `${genre} → ${MOODS[name].label}` : 'Follows the song’s genre')
    : 'Pinned';
  if (name === activeMood) return;
  activeMood = name;
  engine.setMood(MOODS[name]);
  scheduler.setMood(MOODS[name]);
  if (announce) toast(prefs.mood === 'auto' && genre ? `${genre} · ${MOODS[name].label} mood` : `${MOODS[name].label} mood`);
}
applyMood(false);
for (const button of document.querySelectorAll('#mood-pick button')) {
  button.addEventListener('click', () => { prefs.mood = button.dataset.mood; applyPrefs(); applyMood(true); });
}

function setMenu(open) {
  $('menu').hidden = !open;
  $('settings').classList.toggle('open', open);
  $('gear').setAttribute('aria-expanded', String(open));
}
$('gear').addEventListener('click', () => setMenu($('menu').hidden));
window.addEventListener('pointerdown', (event) => { if (!$('settings').contains(event.target)) setMenu(false); });
for (const button of document.querySelectorAll('#info-mode button')) {
  button.addEventListener('click', () => { prefs.info = button.dataset.info; applyPrefs(); });
}
for (const button of document.querySelectorAll('#corner-pick button')) {
  button.addEventListener('click', () => { prefs.corner = button.dataset.corner; prefs.info = 'corner'; applyPrefs(); });
}

installHotkeys({
  infoMode: () => {
    prefs.info = INFO_MODES[(INFO_MODES.indexOf(prefs.info) + 1) % INFO_MODES.length];
    applyPrefs();
    toast(INFO_NAMES[prefs.info]);
  },
  escape: () => setMenu(false),
  mood: () => {
    prefs.mood = MOOD_ORDER[(MOOD_ORDER.indexOf(prefs.mood) + 1) % MOOD_ORDER.length];
    applyPrefs();
    activeMood = null;
    applyMood(false);
    toast(prefs.mood === 'auto' ? `Mood: auto (${MOODS[activeMood].label})` : `Mood: ${MOODS[activeMood].label}`);
  },
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
