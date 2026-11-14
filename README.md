# LittingtonVizualizer

<img src="assets/icon/icon-1024.png" width="128" alt="LittingtonVizualizer icon">

A macOS Electron app that fills the screen with live, audio-reactive Winamp / Milkdrop-style visuals driven by whatever is playing in **YouTube Music** or **Spotify**, with the album art, title, artist, lyrics and up-next queue floating on top.

> **Status: scaffold only.** The folder structure, config, icons and this README exist. Every source file is a one-line placeholder describing what it will do. No application code has been written yet, so `npm start` will not show anything.

## What it will do

**On launch**
- Detect whether the YouTube Music app (the Chrome-installed web app) or the Spotify desktop app is running. Browser tabs don't count.
- Pick the active source automatically. If both are running, YouTube Music wins.
- Start rendering beat-reactive visuals as soon as audio is flowing.

**Visuals**
- 20 animated presets (list below): fluid feedback, fractals, tunnels, reactive meshes and particle fields rather than bar graphs.
- Driven by the real audio: bass punch, mid/high shimmer and beat transients.
- Palette tinted from the current track's album art.
- A new preset blends in on every track change and roughly every 30 seconds. Arrow keys skip; a key locks the current preset.

**Layout**

```
┌──────────────────────────────────────────────────────────┐
│ ░░░░░░░░░░░ full-bleed live visualization ░░░░░░░░░░░░░░ │
│ ░░ ┌───────────┐                                      ░░ │
│ ░░ │           │   SONG TITLE (bold, large)           ░░ │
│ ░░ │ album art │   Artist — Album                     ░░ │
│ ░░ │           │   ─────────────────────────          ░░ │
│ ░░ │           │   synced lyrics  /  up-next queue    ░░ │
│ ░░ └───────────┘   (toggle between the two)           ░░ │
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
└──────────────────────────────────────────────────────────┘
```

- A normal resizable window that goes fullscreen (for a TV or second monitor) with one hotkey. Art and text scale with the window.
- Minimal chrome; the whole overlay can be hidden for visuals only.

## How it works

| Piece | Approach | Why |
|---|---|---|
| **Audio** | A small bundled Swift helper (`native/audio-tap`) uses a Core Audio process tap to capture **only the music app's** audio and streams PCM to Electron. | Notification sounds and other apps don't make the visuals jump. Needs macOS 14.4+ and one "audio capture" permission prompt. No BlackHole or virtual devices. |
| **Visuals** | WebGL2 fragment shaders with a feedback buffer, one `.frag` file per preset. | Milkdrop-style feedback at 60–120 fps with no native graphics build. |
| **Spotify track info** | AppleScript to the Spotify app: title, artist, album, artwork, position. | Works locally with no login. |
| **Spotify queue** | Spotify Web API with a one-time login (PKCE). | The desktop app doesn't expose its queue locally. Requires registering a free Spotify developer app to get a client ID. |
| **YouTube Music track info + queue** | A tiny companion Chrome extension (`extension/`) reads the YouTube Music page and sends it to the app over a localhost WebSocket. | The Chrome-installed app exposes nothing useful to other apps on its own. |
| **Lyrics** | [LRCLIB](https://lrclib.net): synced lyrics when available, plain lyrics otherwise. | Free, no API key. |
| **Source detection** | Process check for `Spotify.app` and the YouTube Music Chrome app shim. | Desktop apps only, as required. |

## Presets

| # | Name | # | Name |
|---|---|---|---|
| 01 | liquid-feedback | 11 | vortex-starfield |
| 02 | plasma-bloom | 12 | moire-pulse |
| 03 | warp-tunnel | 13 | lava-cells |
| 04 | kaleido-fractal | 14 | crystal-lattice |
| 05 | julia-drift | 15 | spiral-galaxy |
| 06 | mandel-zoom | 16 | waveform-halo |
| 07 | reactive-mesh | 17 | fractal-flame |
| 08 | particle-nebula | 18 | hex-tunnel |
| 09 | ink-in-water | 19 | smoke-tendrils |
| 10 | aurora-ribbons | 20 | chromatic-rings |

## Planned hotkeys

| Key | Action |
|---|---|
| `F` | Toggle fullscreen |
| `←` / `→` | Previous / next preset |
| `L` | Lock or unlock the current preset |
| `Tab` | Switch lower panel between lyrics and queue |
| `H` | Hide or show the overlay |

## Project structure

```
.
├── package.json              scripts and dependencies
├── electron-builder.yml      packaging config (dmg, icons, permission strings)
├── src/
│   ├── main/                 Electron main process
│   │   ├── main.js           window, fullscreen, lifecycle
│   │   ├── preload.js        safe bridge to the renderer
│   │   ├── sources/          detect.js, spotify.js, ytmusic.js
│   │   ├── audio/            tap-bridge.js (runs the Swift helper)
│   │   ├── lyrics/           lrclib.js
│   │   └── bridge/           extension-server.js (WebSocket for the extension)
│   └── renderer/             the window contents
│       ├── index.html, styles.css, app.js
│       ├── viz/              engine, audio analyser, palette, preset scheduler
│       │   └── presets/      01…20 .frag shaders + index.js
│       └── ui/               now-playing, lyrics-panel, queue-panel, hotkeys
├── native/audio-tap/         Swift helper that captures one app's audio
├── extension/                companion Chrome extension for YouTube Music
├── assets/icon/              icon-1024.png (master artwork)
├── build/                    icon.icns, icon.ico, icon.png, entitlements
├── tools/make-icons.py       regenerates every icon file
└── docs/                     design notes
```

## Getting started

Requirements: macOS 14.4 or later, Node 22+, Xcode command line tools (for Swift).

```bash
npm install
```

```bash
npm run build:native
```

```bash
npm start
```

Package a `.dmg`:

```bash
npm run dist
```

Regenerate the icons (needs Python 3 with Pillow and numpy):

```bash
npm run icons
```

### One-time setup once the app exists

1. **Audio permission:** approve the macOS audio-capture prompt on first launch.
2. **YouTube Music:** open `chrome://extensions`, enable Developer mode, choose "Load unpacked" and select the `extension/` folder.
3. **Spotify queue (optional):** create an app at the Spotify developer dashboard, paste its client ID into the app's settings, and log in once. Track info and lyrics work without this.

## Build order

1. Window, visual engine and two or three presets running from a test tone.
2. Swift audio tap and real audio reactivity.
3. Source detection and Spotify now-playing; overlay card with album-art tinting.
4. Lyrics panel.
5. Chrome extension and YouTube Music now-playing and queue.
6. Spotify login and queue.
7. Remaining presets, preset scheduler, hotkeys, packaging.
