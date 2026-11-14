// Finds the running music desktop apps. Browser tabs don't count: only Spotify.app and an
// installed "YouTube Music.app" (the Chrome-installed web app, or a standalone desktop build).
const { execFile } = require('child_process');
const path = require('path');

const run = (cmd, args) => new Promise((resolve) => {
  execFile(cmd, args, { timeout: 4000, maxBuffer: 4 << 20 }, (err, stdout) => resolve(err ? '' : stdout));
});

const bundleCache = new Map();

// The audio for a Chrome-installed app is played by Chrome's own helper processes, so the tap has
// to target the browser's bundle ID (CrBundleIdentifier), not the little app shim's.
async function audioBundlePrefix(appPath) {
  if (!bundleCache.has(appPath)) {
    const plist = path.join(appPath, 'Contents', 'Info.plist');
    const read = async (key) => (await run('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', plist])).trim();
    const browser = await read('CrBundleIdentifier');
    const own = await read('CFBundleIdentifier');
    bundleCache.set(appPath, {
      prefix: browser || own || 'com.google.Chrome',
      viaBrowser: Boolean(browser),
    });
  }
  return bundleCache.get(appPath);
}

async function detect() {
  const out = await run('/bin/ps', ['-axo', 'pid=,comm=']);
  const found = { spotify: null, ytmusic: null };
  for (const line of out.split('\n')) {
    const match = line.match(/^\s*(\d+)\s+(.*)$/);
    if (!match) continue;
    const [, pid, comm] = match;
    if (!found.spotify && comm.endsWith('/Spotify.app/Contents/MacOS/Spotify')) {
      found.spotify = { pid: Number(pid), prefix: 'com.spotify.client' };
    }
    const ytm = comm.match(/^(.*\/YouTube Music\.app)\/Contents\/MacOS\/[^/]+$/);
    if (!found.ytmusic && ytm) {
      found.ytmusic = { pid: Number(pid), ...(await audioBundlePrefix(ytm[1])) };
    }
  }
  return found;
}

module.exports = { detect };
