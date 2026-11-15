// macOS "Now Playing" (the same info as the Control Centre media tile): title, artist, album,
// playhead and which app owns it. Needs no login, no extension and no permission prompt, so it
// is the zero-setup way to know what YouTube Music is playing. It has no queue and no artwork.
//
// The MediaRemote framework only answers Apple's own programs, so the question is asked through
// /usr/bin/osascript (JavaScript for Automation) rather than from this process.
const { execFile } = require('child_process');

const SCRIPT = `
ObjC.import('Foundation');
function run() {
  $.NSBundle.bundleWithPath('/System/Library/PrivateFrameworks/MediaRemote.framework/').load;
  const Request = $.NSClassFromString('MRNowPlayingRequest');
  if (!Request) return '{}';
  const out = {};
  try { out.bundle = ObjC.unwrap(Request.localNowPlayingPlayerPath.client.bundleIdentifier); } catch (e) {}
  try { out.playing = Boolean(Request.localIsPlaying); } catch (e) {}
  try {
    const info = Request.localNowPlayingItem.nowPlayingInfo;
    const get = (key) => {
      const value = info.valueForKey('kMRMediaRemoteNowPlayingInfo' + key);
      return value ? ObjC.unwrap(value) : null;
    };
    out.title = get('Title'); out.artist = get('Artist'); out.album = get('Album');
    out.duration = get('Duration'); out.elapsed = get('ElapsedTime'); out.rate = get('PlaybackRate');
    const stamp = get('Timestamp');
    out.timestamp = stamp ? stamp.getTime() : null;
  } catch (e) {}
  return JSON.stringify(out);
}`;

function read() {
  return new Promise((resolve) => {
    execFile('/usr/bin/osascript', ['-l', 'JavaScript', '-e', SCRIPT], { timeout: 4000 }, (err, stdout) => {
      if (err) return resolve(null);
      let raw;
      try { raw = JSON.parse(stdout); } catch { return resolve(null); }
      if (!raw || !raw.bundle || !raw.title) return resolve(null);
      const now = Date.now();
      const playing = Boolean(raw.playing) && raw.rate !== 0;
      const elapsed = Number(raw.elapsed) || 0;
      // "elapsed" was true at "timestamp"; move it forward to now if the song is running.
      const drift = playing && raw.timestamp ? Math.max(0, (now - raw.timestamp) / 1000) * (Number(raw.rate) || 1) : 0;
      const duration = Number(raw.duration) || 0;
      resolve({
        bundle: String(raw.bundle),
        playing,
        track: {
          id: `${raw.title}|${raw.artist || ''}`,
          title: String(raw.title),
          artist: String(raw.artist || ''),
          album: String(raw.album || ''),
          artUrl: '',
          duration,
        },
        position: duration ? Math.min(duration, elapsed + drift) : elapsed + drift,
        positionAt: now,
      });
    });
  });
}

module.exports = { read };
