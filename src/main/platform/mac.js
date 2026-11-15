// macOS: per-app audio tap, AppleScript for Spotify, Now Playing for everything else.
const { execFile } = require('child_process');
const { detect } = require('../sources/detect');
const spotify = require('../sources/spotify');
const nowPlaying = require('../sources/now-playing');

module.exports = {
  audioMode: 'tap',                       // native helper captures only the music app
  start() {},
  stop() {},
  detect,
  spotifyNowPlaying: () => spotify.nowPlaying(),
  systemNowPlaying: () => nowPlaying.read(),
  // macOS reports one "now playing" app; use it only if it is the app we are asking about.
  pick: (system, app) => (system && app && system.bundle === app.bundle ? system : null),
  openExtensionsPage: (done) => execFile('/usr/bin/open', ['-a', 'Google Chrome', 'chrome://extensions'], done),
};
