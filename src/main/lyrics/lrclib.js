// Lyrics from LRCLIB (https://lrclib.net): synced when available, plain otherwise. No API key.
const { net } = require('electron');

const cache = new Map();
const HEADERS = { 'User-Agent': 'LittingtonVizualizer/0.1 (desktop music visualizer)' };

function parseSynced(lrc) {
  const lines = [];
  for (const raw of lrc.split('\n')) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!stamps.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const stamp of stamps) lines.push({ t: Number(stamp[1]) * 60 + Number(stamp[2]), text });
  }
  return lines.sort((a, b) => a.t - b.t);
}

// "Song (Official Video) [4K]" and "Song - 2011 Remaster" rarely match a lyrics database as-is.
const cleanTitle = (title) => title
  .replace(/\s*[\(\[][^\)\]]*(official|video|audio|lyric|visuali[sz]er|remaster|explicit|4k|hd)[^\)\]]*[\)\]]/gi, '')
  .replace(/\s+-\s+.*(remaster|version|edit|mix).*$/i, '')
  .trim();

async function getJson(url) {
  const response = await net.fetch(url, { headers: HEADERS });
  if (!response.ok) return null;
  return response.json();
}

function shape(record) {
  if (!record) return null;
  if (record.instrumental) return { instrumental: true, synced: null, plain: null };
  const synced = record.syncedLyrics ? parseSynced(record.syncedLyrics) : null;
  const plain = record.plainLyrics ? record.plainLyrics.split('\n').map((line) => line.trim()) : null;
  if (!(synced && synced.length) && !(plain && plain.length)) return null;
  return { instrumental: false, synced: synced && synced.length ? synced : null, plain };
}

async function lookup({ title, artist, album, duration }) {
  const q = (params) => new URLSearchParams(params).toString();
  const name = cleanTitle(title) || title;
  if (artist && duration) {
    const exact = shape(await getJson(`https://lrclib.net/api/get?${q({
      track_name: name, artist_name: artist, album_name: album || '', duration: String(Math.round(duration)),
    })}`).catch(() => null));
    if (exact) return exact;
  }
  const results = await getJson(`https://lrclib.net/api/search?${q({ track_name: name, artist_name: artist || '' })}`)
    .catch(() => null);
  if (!Array.isArray(results) || !results.length) return null;
  // Prefer synced lyrics whose length is closest to the track that's actually playing.
  const score = (r) => (r.syncedLyrics ? 0 : 1000) + (duration ? Math.abs((r.duration || 0) - duration) : 0);
  const best = results.slice().sort((a, b) => score(a) - score(b))[0];
  if (duration && best.duration && Math.abs(best.duration - duration) > 12) {
    // Wrong cut of the song: the timing would be off, so only trust its plain text.
    return shape({ ...best, syncedLyrics: null });
  }
  return shape(best);
}

async function getLyrics(track) {
  if (!track || !track.title) return null;
  const key = `${track.title}|${track.artist}|${Math.round(track.duration || 0)}`;
  if (!cache.has(key)) {
    cache.set(key, lookup(track).catch(() => null));
    if (cache.size > 200) cache.delete(cache.keys().next().value);
  }
  return cache.get(key);
}

module.exports = { getLyrics };
