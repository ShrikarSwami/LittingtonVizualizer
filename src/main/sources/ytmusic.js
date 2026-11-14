// YouTube Music source. Everything arrives from the companion Chrome extension (extension/),
// which reads the YouTube Music page and posts it to the local bridge about once a second.
const FRESH_MS = 4000;

let latest = null;       // most recent report
let latestAt = 0;

function receive(report) {
  if (!report || typeof report !== 'object') return;
  const now = Date.now();
  // If two YouTube Music pages are open, don't let a paused one overwrite the one that's playing.
  if (!report.playing && latest && latest.playing && latest.pageId !== report.pageId && now - latestAt < FRESH_MS) return;
  const text = (value, max = 300) => (typeof value === 'string' ? value.slice(0, max) : '');
  const number = (value) => (Number.isFinite(value) ? value : 0);
  const art = (value) => (typeof value === 'string' && /^https:\/\//.test(value) ? value.slice(0, 1000) : '');
  latest = {
    pageId: text(report.pageId, 40),
    playing: Boolean(report.playing),
    track: report.title ? {
      id: `ytm:${text(report.title)}|${text(report.artist)}`,
      title: text(report.title),
      artist: text(report.artist),
      album: text(report.album),
      artUrl: art(report.artUrl),
      duration: number(report.duration),
    } : null,
    position: number(report.position),
    positionAt: now,
    queue: Array.isArray(report.queue) ? report.queue.slice(0, 20).map((item) => ({
      title: text(item && item.title),
      artist: text(item && item.artist),
      artUrl: art(item && item.artUrl),
    })).filter((item) => item.title) : null,
  };
  latestAt = now;
}

const connected = () => Date.now() - latestAt < FRESH_MS;
const state = () => (connected() ? latest : null);

module.exports = { receive, connected, state };
