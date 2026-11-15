// Windows: what is playing comes from the system media controls (the same data as the volume
// flyout), read by one long-running PowerShell process. Audio is the whole system's output,
// captured in the window through Electron's loopback support, so there is no native helper.
//
// NOTE: written on a Mac and not yet run on Windows.
const { spawn, execFile } = require('child_process');

// Prints one JSON array per second: every media session Windows knows about.
const SCRIPT = [
  "$ErrorActionPreference = 'SilentlyContinue'",
  'Add-Type -AssemblyName System.Runtime.WindowsRuntime',
  "$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]",
  'function Await($op, [Type]$type) { $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $task.Wait(5000) | Out-Null; $task.Result }',
  '$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]',
  '$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]',
  '$manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])',
  'while ($true) {',
  '  $out = @()',
  '  foreach ($s in $manager.GetSessions()) {',
  '    $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])',
  '    $t = $s.GetTimelineProperties()',
  '    $out += [pscustomobject]@{ app = $s.SourceAppUserModelId; status = [int]$s.GetPlaybackInfo().PlaybackStatus; title = $p.Title; artist = $p.Artist; album = $p.AlbumTitle; position = $t.Position.TotalSeconds; duration = $t.EndTime.TotalSeconds; updated = $t.LastUpdatedTime.ToUnixTimeMilliseconds() }',
  '  }',
  '  [Console]::Out.WriteLine((ConvertTo-Json -InputObject @($out) -Compress))',
  '  Start-Sleep -Milliseconds 1000',
  '}',
].join('\n');

const PLAYING = 4;   // GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing
// The YouTube Music web app keeps the same app ID whichever Chromium browser installed it.
const YTM = /cinhimbnkkaeohfgghhklpknlkffjgod|youtube.?music|music\.youtube|th-ch/i;
const SPOTIFY = /spotify/i;

let child = null;
let sessions = [];
let sessionsAt = 0;
let stopped = false;

function start() {
  stopped = false;
  const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64');
  child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  let pending = '';
  child.stdout.on('data', (chunk) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try { sessions = JSON.parse(line); sessionsAt = Date.now(); } catch { /* partial or noise */ }
    }
  });
  child.on('error', () => {});
  child.on('exit', () => { child = null; if (!stopped) setTimeout(start, 5000); });
}

function stop() {
  stopped = true;
  if (child) child.kill();
}

function toState(session) {
  if (!session || !session.title) return null;
  const now = Date.now();
  const playing = session.status === PLAYING;
  const duration = Number(session.duration) || 0;
  let position = Number(session.position) || 0;
  // Windows only refreshes the playhead now and then; move it forward from when it was last true.
  if (playing && session.updated > 0) position += Math.max(0, (now - session.updated) / 1000);
  if (duration) position = Math.min(duration, position);
  return {
    playing,
    track: {
      id: `${session.title}|${session.artist || ''}`,
      title: String(session.title),
      artist: String(session.artist || ''),
      album: String(session.album || ''),
      artUrl: '',
      duration,
    },
    position,
    positionAt: now,
  };
}

// A music app counts as running when Windows has a media session for it. A plain browser tab
// reports as the browser itself ("Chrome"), which matches neither pattern, so tabs are ignored.
async function detect() {
  const fresh = Date.now() - sessionsAt < 5000 ? sessions : [];
  const find = (pattern) => {
    const matches = fresh.filter((s) => pattern.test(String(s.app || '')));
    return matches.find((s) => s.status === PLAYING) || matches[0] || null;
  };
  const wrap = (session) => (session ? { session: toState(session), prefix: null } : null);
  return { spotify: wrap(find(SPOTIFY)), ytmusic: wrap(find(YTM)) };
}

module.exports = {
  audioMode: 'loopback',                  // every sound the PC plays
  start,
  stop,
  detect,
  spotifyNowPlaying: async () => null,
  systemNowPlaying: async () => true,
  pick: (_system, app) => (app ? app.session : null),
  openExtensionsPage: (done) => execFile('cmd.exe', ['/c', 'start', '', 'chrome', 'chrome://extensions'], { windowsHide: true }, done),
};
