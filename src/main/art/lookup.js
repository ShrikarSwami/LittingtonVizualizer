// Looks a song up on the public iTunes Search API to learn two things the players don't tell us:
// its genre (which sets the visual mood) and, when the source has no artwork, a cover image.
// The artist and title are sent to Apple to do this.
const { net } = require('electron');

const cache = new Map();      // key -> { artUrl, genre }
const pending = new Set();
const EMPTY = { artUrl: '', genre: '' };
const simplify = (text) => String(text || '').toLowerCase().replace(/[\(\[].*?[\)\]]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

async function search(title, artist) {
  const query = new URLSearchParams({ term: `${artist} ${title}`.trim(), entity: 'song', limit: '8' });
  const response = await net.fetch(`https://itunes.apple.com/search?${query}`);
  if (!response.ok) return EMPTY;
  const { results = [] } = await response.json();
  const wantTitle = simplify(title);
  const wantArtist = simplify(artist).split(' ')[0];
  const score = (r) => (simplify(r.trackName) === wantTitle ? 2 : simplify(r.trackName).includes(wantTitle) ? 1 : 0)
    + (wantArtist && simplify(r.artistName).includes(wantArtist) ? 1 : 0);
  const best = results.slice().sort((a, b) => score(b) - score(a))[0];
  if (!best || score(best) === 0) return EMPTY;
  return {
    artUrl: best.artworkUrl100 ? best.artworkUrl100.replace(/\/\d+x\d+bb\./, '/600x600bb.') : '',
    genre: best.primaryGenreName || '',
  };
}

// Returns what is known right now ({artUrl:'', genre:''} at first) and looks the rest up in the background.
function infoFor(track) {
  const key = `${track.title}|${track.artist}`;
  if (cache.has(key)) return cache.get(key);
  if (!pending.has(key)) {
    pending.add(key);
    search(track.title, track.artist).catch(() => EMPTY).then((info) => {
      pending.delete(key);
      cache.set(key, info);
      if (cache.size > 200) cache.delete(cache.keys().next().value);
    });
  }
  return EMPTY;
}

// Artists whose catalogue is filed under one genre but feels like another. Add your own.
const ARTIST_MOODS = { drake: 'smooth' };

// Genre -> visual mood. "hype" is hard and fast, "smooth" is slow and fluid, "pop" is bright and bouncy.
function moodFor(genre, artist) {
  const pinned = ARTIST_MOODS[String(artist || '').trim().toLowerCase()];
  if (pinned) return pinned;
  const g = String(genre || '').toLowerCase();
  if (!g) return 'neutral';
  if (/hip.?hop|rap|trap|drill|grime|metal|punk|hardcore|dubstep|drum/.test(g)) return 'hype';
  if (/r&b|soul|jazz|blues|ambient|classical|new age|easy listening|lo.?fi|chill|acoustic|singer|reggae|folk/.test(g)) return 'smooth';
  if (/pop|dance|electro|house|disco|latin|funk|edm|reggaeton|afro/.test(g)) return 'pop';
  return 'neutral';
}

module.exports = { infoFor, moodFor };
