// LittingtonVizualizer — main process: one window, plus the loop that works out what is playing.
const { app, BrowserWindow, ipcMain, net, shell, clipboard, session, desktopCapturer } = require('electron');
const fs = require('fs');
const path = require('path');

const platform = require(process.platform === 'win32' ? './platform/windows' : './platform/mac');
const spotify = require('./sources/spotify');
const ytmusic = require('./sources/ytmusic');
const { infoFor, moodFor } = require('./art/lookup');
const { getLyrics } = require('./lyrics/lrclib');
const { Tap } = require('./audio/tap-bridge');
const bridge = require('./bridge/extension-server');

const ROOT = path.join(__dirname, '..', '..');
const PRESET_DIR = path.join(__dirname, '..', 'renderer', 'viz', 'presets');
const EXTENSION_DIR = app.isPackaged ? path.join(process.resourcesPath, 'extension') : path.join(ROOT, 'extension');
const LABELS = { spotify: 'Spotify', ytmusic: 'YouTube Music' };

app.setName('LittingtonVizualizer');

let win = null;
let rendererReady = false;
const tap = new Tap();

const send = (channel, payload) => {
  if (win && !win.isDestroyed() && rendererReady) win.webContents.send(channel, payload);
};

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 420,
    backgroundColor: '#05030d',
    title: 'LittingtonVizualizer',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : { autoHideMenuBar: true }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,   // keep animating when another window has focus
    },
  });
  rendererReady = false;
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.on('closed', () => { win = null; });

  // Links never navigate the app window; they open in the real browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  if (!app.isPackaged) {
    win.webContents.on('console-message', (event) => {
      if (event.level === 'warning' || event.level === 'error') console.log(`[window] ${event.message}`);
    });
  }
  // Development aid: LV_EVAL='some js' runs it in the window and prints the result,
  // e.g. LV_EVAL='__lvCheckPresets()' reports whether every preset's shader compiles.
  if (process.env.LV_EVAL) {
    setTimeout(async () => {
      const result = await win.webContents.executeJavaScript(process.env.LV_EVAL).catch((error) => String(error));
      console.log(`[eval] ${JSON.stringify(result)}`);
    }, 2500);
  }
  // Development aid: LV_TOUR=/some/folder saves a picture of every preset, then quits.
  if (process.env.LV_TOUR) {
    setTimeout(async () => {
      const count = fs.readdirSync(PRESET_DIR).filter((file) => file.endsWith('.frag')).length;
      for (let index = 0; index < count; index++) {
        await win.webContents.executeJavaScript(`window.__lvShow(${index})`);
        await new Promise((resolve) => setTimeout(resolve, Number(process.env.LV_TOUR_HOLD || 3500)));
        const image = await win.webContents.capturePage();
        fs.writeFileSync(path.join(process.env.LV_TOUR, `${String(index + 1).padStart(2, '0')}.png`), image.resize({ width: 960 }).toPNG());
      }
      app.quit();
    }, 3000);
  }
  // Development aid: LV_SHOT=/path/to.png saves a picture of the window after LV_SHOT_DELAY ms.
  if (process.env.LV_SHOT) {
    setTimeout(async () => {
      const image = await win.webContents.capturePage();
      fs.writeFileSync(process.env.LV_SHOT, image.toPNG());
      if (process.env.LV_SHOT_QUIT) app.quit();
    }, Number(process.env.LV_SHOT_DELAY || 6000));
  }
}

// ---- What is playing? ----

let spotifyQueue = null;
let spotifyQueueAt = 0;
let spotifyQueueTrack = null;
let ticking = false;

function chooseSource(running, sp, yt) {
  if (running.ytmusic && running.spotify) {
    // YouTube Music wins ties. Spotify only takes over when it is the one actually playing.
    const spotifyPlaying = Boolean(sp && sp.playing);
    const ytPlaying = Boolean(yt && yt.playing);
    return spotifyPlaying && !ytPlaying ? 'spotify' : 'ytmusic';
  }
  if (running.ytmusic) return 'ytmusic';
  if (running.spotify) return 'spotify';
  return null;
}

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const running = await platform.detect();
    const anyRunning = running.spotify || running.ytmusic;
    const [spotifyScript, system] = await Promise.all([
      running.spotify ? platform.spotifyNowPlaying() : null,
      anyRunning ? platform.systemNowPlaying() : null,
    ]);
    // The operating system's own "now playing" info fills in for whichever richer source
    // isn't available: the extension for YouTube Music, AppleScript for Spotify on the Mac.
    const systemFor = (app) => {
      const found = platform.pick(system, app);
      return found ? { ...found, queue: null } : null;
    };
    const extension = running.ytmusic ? ytmusic.state() : null;
    const yt = extension || systemFor(running.ytmusic);
    const sp = spotifyScript || systemFor(running.spotify);
    const source = chooseSource(running, sp, yt);

    if (platform.audioMode === 'tap') tap.target(source ? running[source].prefix : null);

    const state = {
      source,
      sourceLabel: source ? LABELS[source] : null,
      playing: false,
      track: null,
      position: 0,
      positionAt: Date.now(),
      queue: null,
      queueNote: null,       // why there is no queue, when there isn't
      note: null,            // why there is no track info, when there isn't
      spotifyLoggedIn: spotify.loggedIn(),
    };

    if (source === 'ytmusic') {
      if (yt) {
        Object.assign(state, { playing: yt.playing, track: yt.track, position: yt.position, positionAt: yt.positionAt, queue: yt.queue });
        if (!yt.queue) state.queueNote = extension ? 'empty' : 'extension';
      } else {
        state.note = 'waiting';
        state.queueNote = 'extension';
      }
    } else if (source === 'spotify') {
      if (sp) {
        Object.assign(state, { playing: sp.playing, track: sp.track, position: sp.position, positionAt: sp.positionAt });
      } else if (spotify.permissionDenied()) {
        state.note = 'spotify-permission';
      }
      if (!spotify.loggedIn()) {
        state.queueNote = 'spotify-login';
      } else {
        const trackId = sp && sp.track ? sp.track.id : null;
        if (trackId !== spotifyQueueTrack || Date.now() - spotifyQueueAt > 8000) {
          spotifyQueueTrack = trackId;
          spotifyQueueAt = Date.now();
          spotify.queue().then((queue) => { spotifyQueue = queue; });
        }
        state.queue = spotifyQueue;
        if (!spotifyQueue) state.queueNote = spotify.queueError() || 'empty';
      }
    }
    // Genre (for the visual mood) and, where the source had none, artwork.
    state.genre = '';
    state.mood = 'neutral';
    if (state.track) {
      const info = infoFor(state.track);
      if (!state.track.artUrl && info.artUrl) state.track = { ...state.track, artUrl: info.artUrl };
      state.genre = info.genre;
      state.mood = moodFor(info.genre, state.track.artist);
    }
    send('state', state);
  } catch (error) {
    console.error('[tick]', error);
  } finally {
    ticking = false;
  }
}

// ---- Audio ----

tap.on('samples', (buffer) => send('audio', buffer));
tap.on('status', (status) => send('audio:status', status));

// ---- Requests from the window ----

ipcMain.on('renderer:ready', () => {
  rendererReady = true;
  send('audio:status', tap.status);
  tick();
});

ipcMain.handle('presets:load', () => fs.readdirSync(PRESET_DIR)
  .filter((file) => file.endsWith('.frag'))
  .sort()
  .map((file) => ({
    name: file.replace(/^\d+-/, '').replace(/\.frag$/, '').replace(/-/g, ' '),
    source: fs.readFileSync(path.join(PRESET_DIR, file), 'utf8'),
  })));

const artCache = new Map();
ipcMain.handle('art:fetch', async (_event, url) => {
  if (typeof url !== 'string' || !/^https:\/\//.test(url)) return null;
  if (artCache.has(url)) return artCache.get(url);
  try {
    const response = await net.fetch(url);
    const type = response.headers.get('content-type') || '';
    if (!response.ok || !type.startsWith('image/')) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 8 << 20) return null;
    const dataUrl = `data:${type.split(';')[0]};base64,${bytes.toString('base64')}`;
    artCache.set(url, dataUrl);
    if (artCache.size > 12) artCache.delete(artCache.keys().next().value);
    return dataUrl;
  } catch {
    return null;
  }
});

ipcMain.handle('lyrics:get', (_event, track) => getLyrics(track));

ipcMain.handle('window:fullscreen', () => {
  if (win) win.setFullScreen(!win.isFullScreen());
});

ipcMain.handle('spotify:connect', (_event, clientId) => {
  try {
    spotify.beginLogin(String(clientId || '').trim(), bridge.spotifyRedirectUri);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('spotify:disconnect', () => { spotify.logout(); spotifyQueue = null; tick(); });

// Sets the stage for installing the companion extension: Chrome's extensions page in front,
// and the extension folder highlighted in Finder, ready to be dragged onto that page.
ipcMain.handle('extension:show', () => {
  clipboard.writeText('chrome://extensions');
  platform.openExtensionsPage(() => shell.showItemInFolder(EXTENSION_DIR));
});

// ---- Lifecycle ----

// LV_DEV_SECOND=1 lets a development copy run beside the installed app.
if (!process.env.LV_DEV_SECOND && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });

  app.whenReady().then(() => {
    if (!app.isPackaged && app.dock) app.dock.setIcon(path.join(ROOT, 'build', 'icon.png'));
    platform.start();
    if (platform.audioMode === 'loopback') {
      // Windows: when the window asks to capture, hand it the system's sound without a picker.
      session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
        desktopCapturer.getSources({ types: ['screen'] })
          .then((sources) => callback({ video: sources[0], audio: 'loopback' }))
          .catch(() => callback({}));
      });
    }
    bridge.start({
      onYtm: (report) => ytmusic.receive(report),
      onSpotifyCallback: async (query) => {
        await spotify.finishLogin(query);
        spotifyQueueAt = 0;
        tick();
      },
    });
    createWindow();
    setInterval(tick, 1000);
    app.on('activate', () => { if (!win) createWindow(); });
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { tap.stop(); platform.stop(); });
}
