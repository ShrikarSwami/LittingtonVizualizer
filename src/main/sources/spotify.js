// Spotify source.
//  - Now playing: AppleScript to the local Spotify app. No login.
//  - Up-next queue: Spotify Web API, after a one-time login (PKCE, no client secret).
const { execFile } = require('child_process');
const crypto = require('crypto');
const { net, shell } = require('electron');
const settings = require('../settings');

const SEP = '\u001f';
const SCRIPT = [
  'tell application "Spotify"',
  'if player state is stopped then return "stopped"',
  'set t to current track',
  'set d to (ASCII character 31)',
  'return (id of t) & d & (name of t) & d & (artist of t) & d & (album of t) & d & (artwork url of t) & d & (duration of t) & d & (player position) & d & (player state as text)',
  'end tell',
];

let permissionDenied = false;

// Only call this while Spotify is running: `tell application` would otherwise launch it.
function nowPlaying() {
  return new Promise((resolve) => {
    const args = SCRIPT.flatMap((line) => ['-e', line]);
    execFile('/usr/bin/osascript', args, { timeout: 4000 }, (err, stdout, stderr) => {
      if (err) {
        permissionDenied = /-1743|not authori[sz]ed/i.test(String(stderr));
        return resolve(null);
      }
      permissionDenied = false;
      const out = stdout.replace(/\n$/, '');
      if (out === 'stopped') return resolve({ playing: false, track: null, position: 0, positionAt: Date.now() });
      const [id, title, artist, album, artUrl, duration, position, state] = out.split(SEP);
      const seconds = (value) => Number(String(value).replace(',', '.')) || 0;   // some locales print 12,5
      resolve({
        playing: state === 'playing',
        track: {
          id, title, artist, album,
          artUrl: /^https:\/\//.test(artUrl || '') ? artUrl : '',
          duration: seconds(duration) / 1000,
        },
        position: seconds(position),
        positionAt: Date.now(),
      });
    });
  });
}

// ---- Web API login (Authorization Code with PKCE) ----

const SCOPE = 'user-read-playback-state user-read-currently-playing';
let pending = null;          // { state, verifier, redirectUri }
let accessToken = null;
let accessExpires = 0;

const base64url = (buffer) => buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const loggedIn = () => Boolean(settings.get('spotifyClientId') && settings.get('spotifyRefresh'));

function beginLogin(clientId, redirectUri) {
  if (!/^[0-9a-f]{32}$/i.test(clientId)) throw new Error('That does not look like a Spotify client ID (32 letters and digits).');
  settings.set('spotifyClientId', clientId);
  const verifier = base64url(crypto.randomBytes(48));
  pending = { state: base64url(crypto.randomBytes(12)), verifier, redirectUri };
  const query = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: base64url(crypto.createHash('sha256').update(verifier).digest()),
    scope: SCOPE,
    state: pending.state,
  });
  shell.openExternal(`https://accounts.spotify.com/authorize?${query}`);
}

async function token(params) {
  const response = await net.fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: settings.get('spotifyClientId'), ...params }).toString(),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error_description || body.error || `Spotify login failed (${response.status})`);
  accessToken = body.access_token;
  accessExpires = Date.now() + (body.expires_in - 60) * 1000;
  if (body.refresh_token) settings.setSecret('spotifyRefresh', body.refresh_token);
}

// Called by the local bridge when Spotify redirects the browser back to us.
async function finishLogin(query) {
  if (!pending || query.get('state') !== pending.state) throw new Error('Unexpected login response.');
  const { verifier, redirectUri } = pending;
  pending = null;
  if (query.get('error')) throw new Error(`Spotify said: ${query.get('error')}`);
  await token({ grant_type: 'authorization_code', code: query.get('code'), redirect_uri: redirectUri, code_verifier: verifier });
}

function logout() {
  settings.set('spotifyRefresh', null);
  accessToken = null;
}

let queueError = null;

async function queue() {
  if (!loggedIn()) return null;
  try {
    if (!accessToken || Date.now() > accessExpires) {
      await token({ grant_type: 'refresh_token', refresh_token: settings.getSecret('spotifyRefresh') });
    }
    const response = await net.fetch('https://api.spotify.com/v1/me/player/queue', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 401) { accessToken = null; return null; }
    if (!response.ok) {
      queueError = response.status === 403 ? 'Spotify only shares the queue with Premium accounts.' : `Spotify queue error ${response.status}`;
      return null;
    }
    queueError = null;
    const body = await response.json();
    return (body.queue || []).slice(0, 20).map((item) => ({
      title: item.name || '',
      artist: (item.artists || []).map((a) => a.name).join(', ') || (item.show && item.show.name) || '',
      artUrl: ((item.album && item.album.images) || item.images || []).slice(-1)[0]?.url || '',
    }));
  } catch (error) {
    queueError = error.message;
    return null;
  }
}

module.exports = {
  nowPlaying, queue, beginLogin, finishLogin, logout, loggedIn,
  permissionDenied: () => permissionDenied,
  queueError: () => queueError,
};
