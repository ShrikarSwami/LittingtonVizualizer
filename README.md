# LittingtonVizualizer

<img src="assets/icon/icon-1024.png" width="128" alt="LittingtonVizualizer icon">

A macOS Electron app that fills the screen with live, audio-reactive Winamp / Milkdrop-style visuals driven by whatever is playing in **YouTube Music** or **Spotify**, with the album art, title, artist, lyrics and up-next queue floating on top.

## Quick start

Requirements: macOS 14.2 or later, Node 22+, Xcode command line tools (for Swift).

```bash
npm install
```

```bash
npm run build:native
```

```bash
npm start
```

The first time it hears music, macOS asks whether **AudioTap** may capture audio. Allow it; that is the small helper that listens to the music app.

Build a `.dmg` you can drag into Applications:

```bash
npm run dist
```

## What it does

**On launch**
- Detects whether the YouTube Music app (the Chrome-installed web app) or the Spotify desktop app is running. Browser tabs don't count.
- Picks the active source automatically. If both are running, YouTube Music wins unless Spotify is the only one actually playing.
- Starts rendering as soon as audio is flowing. With nothing playing, the visuals breathe gently instead of freezing.

**Visuals**
- 20 animated presets (list below): fluid feedback, fractals, tunnels, reactive meshes and particle fields.
- Driven by the real audio: bass, mid and treble levels, beat pulses, and the live spectrum and waveform.
- Palette tinted from the current track's album art (press `C` for rainbow instead).
- A new preset blends in on every track change and every 30 seconds. Arrow keys skip; `L` locks the current one.

**Layout**

```
┌──────────────────────────────────────────────────────────┐
│ ░░░░░░░░░░░ full-bleed live visualization ░░░░░░░░░░░░░░ │
│ ░░ ┌───────────┐                                      ░░ │
│ ░░ │           │   SONG TITLE (bold, large)           ░░ │
│ ░░ │ album art │   Artist — Album                     ░░ │
│ ░░ │           │   [Lyrics] [Up next]                 ░░ │
│ ░░ │           │   synced lyrics  /  up-next queue    ░░ │
│ ░░ └───────────┘                                      ░░ │
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
└──────────────────────────────────────────────────────────┘
```

A normal resizable window that goes fullscreen with `F`. Art and text scale with the window; tall narrow windows stack the art above the text.

## Hotkeys

| Key | Action |
|---|---|
| `F` | Toggle fullscreen |
| `←` / `→` | Previous / next preset |
| `L` | Lock or unlock the current preset |
| `Tab` | Switch the lower panel between lyrics and up next |
| `C` | Album-art colours or rainbow |
| `H` | Hide or show the overlay |
| `?` | Show the key hints |

## One-time setup per source

### YouTube Music

Visuals work straight away. Track info, lyrics and the queue need the companion extension, because the Chrome-installed app shares nothing with other apps on its own:

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode**, press **Load unpacked**, and choose this project's `extension/` folder. (In the app, the **Show extension folder** button reveals it and copies the address.)
3. Play something. Already-open YouTube Music windows start reporting immediately.

The queue appears once YouTube Music's player page has been opened, since that is when the page loads it.

Because the Chrome-installed app plays its sound through Chrome itself, the visuals react to **all audio from Chrome**, including other tabs. Sound from other apps is ignored.

### Spotify

Track info, album art and lyrics work with no login; macOS asks once whether the app may control Spotify.

The queue needs a one-time login, because the desktop app doesn't expose it locally:

1. Create a free app at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard).
2. Add the redirect URI `http://127.0.0.1:38217/spotify-callback`.
3. In LittingtonVizualizer, press `Tab` to open **Up next**, paste the app's Client ID and press **Connect Spotify**.

Spotify may limit the queue to Premium accounts.

## How it works

| Piece | Approach |
|---|---|
| **Audio** | `native/audio-tap` is a small Swift helper using a Core Audio process tap. It captures only the processes belonging to the music app, mixes them to mono, and pipes float32 PCM to Electron. It never changes what you hear. It carries its own permission description, so macOS prompts for it once however the app was started. |
| **Analysis** | `audio-analyser.js` runs a 2048-point FFT each frame: auto-levelled bass / mid / treble, bass-onset beat detection, and a 512-column spectrum + waveform texture. |
| **Visuals** | `engine.js` is a WebGL2 feedback renderer. Each preset is one fragment shader that receives the previous frame, the audio values and the album palette. Preset changes cross-fade two shaders over the same feedback buffer. Rendering is capped at 1080 lines and upscaled. |
| **Spotify** | AppleScript for now-playing; Web API with PKCE for the queue. The refresh token is stored encrypted via the macOS keychain. |
| **YouTube Music** | The extension's content script reads the page once a second; its service worker posts to `http://127.0.0.1:38217/ytm`, a server that listens on this computer only and accepts only extension origins. |
| **Lyrics** | [LRCLIB](https://lrclib.net): synced lyrics when available, plain otherwise. Track title, artist, album and length are sent to LRCLIB to look them up. |
| **Album art** | Downloaded by the main process and handed to the window as data, then reduced to three vivid colours for the shaders. |

## Presets

| # | Name | # | Name |
|---|---|---|---|
| 01 | liquid feedback | 11 | vortex starfield |
| 02 | plasma bloom | 12 | moire pulse |
| 03 | warp tunnel | 13 | lava cells |
| 04 | kaleido fractal | 14 | crystal lattice |
| 05 | julia drift | 15 | spiral galaxy |
| 06 | mandel zoom | 16 | waveform halo |
| 07 | reactive mesh | 17 | fractal flame |
| 08 | particle nebula | 18 | hex tunnel |
| 09 | ink in water | 19 | smoke tendrils |
| 10 | aurora ribbons | 20 | chromatic rings |

### Writing a preset

Add a `NN-name.frag` file to `src/renderer/viz/presets/`; it is picked up on the next launch. Define one function:

```glsl
vec3 render(vec2 uv, vec2 p) { ... }   // uv: 0..1    p: centred, aspect-correct
```

Available to every preset (see the header in `engine.js`):

| Name | Meaning |
|---|---|
| `uBass`, `uMid`, `uTreb`, `uVol` | Smoothed levels, about 0.5 on average, up to ~1.5 |
| `uBeat`, `uBeatN` | 1 on a beat fading to 0; running beat count |
| `uTime`, `uFlow`, `uSeed` | Seconds; a clock that speeds up with volume; a random number per activation |
| `prev(uv)`, `toUv(p)` | The previous frame, for feedback; convert `p` back to `uv` |
| `spec(x)`, `wave(x)` | Spectrum (bass at 0) and waveform, `x` in 0..1 |
| `pal(t)` | The colour ramp: album-art colours, or rainbow |
| `noise`, `fbm`, `rot`, `hash21`, `hash22` | Helpers |

## Project structure

```
.
├── package.json              scripts and dependencies
├── electron-builder.yml      packaging config
├── src/
│   ├── main/                 Electron main process
│   │   ├── main.js           window, source loop, requests from the window
│   │   ├── preload.js        the only bridge to the window
│   │   ├── settings.js       saved settings and encrypted secrets
│   │   ├── sources/          detect.js, spotify.js, ytmusic.js
│   │   ├── audio/            tap-bridge.js (runs the Swift helper)
│   │   ├── lyrics/           lrclib.js
│   │   └── bridge/           extension-server.js (local HTTP bridge)
│   └── renderer/             the window contents
│       ├── index.html, styles.css, app.js
│       ├── viz/              engine, audio-analyser, palette, preset-scheduler
│       │   └── presets/      01…20 .frag shaders
│       └── ui/               now-playing, lyrics-panel, queue-panel, hotkeys
├── native/audio-tap/         Swift helper that captures one app's audio
├── extension/                companion Chrome extension for YouTube Music
├── assets/icon/              icon-1024.png (master artwork)
├── build/                    icon.icns, icon.ico, icon.png
└── tools/make-icons.py       regenerates every icon file (npm run icons)
```

## Development aids

Environment variables read by `npm start`:

| Variable | Effect |
|---|---|
| `LV_EVAL='__lvCheckPresets()'` | Runs the JavaScript in the window and prints the result; this one reports whether every shader compiles |
| `LV_SHOT=/path/shot.png` | Saves a picture of the window after `LV_SHOT_DELAY` ms (add `LV_SHOT_QUIT=1` to exit afterwards) |
| `LV_TOUR=/some/folder` | Saves a picture of every preset, then quits |

## Known limits

- macOS only. The audio helper and source detection are Mac-specific.
- The app is ad-hoc signed, not notarized: fine on the Mac that built it, but another Mac will need right-click → Open.
- Rebuilding the audio helper changes its signature, so macOS asks for the audio permission again.
- YouTube Music page layout changes can break the extension's reading of title or queue; `extension/content.js` is where to fix that.
