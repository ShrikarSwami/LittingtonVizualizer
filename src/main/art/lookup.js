// Looks a song up on the public iTunes Search API to learn two things the players don't tell us:
// its genre (which sets the visual mood) and, when the source has no artwork, a cover image.
// The artist and title are sent to Apple to do this.
const { net } = require('electron');

const cache = new Map();      // key -> { artUrl, genre, at }
const pending = new Set();
const EMPTY = { artUrl: '', genre: '' };
const MISS_RETRY = 10 * 60 * 1000;   // a miss is worth another try later, a hit is not

// Accents have to come off before the letters do, or "SUPERSÓNICO" turns into "supers nico"
// and no longer matches the plain "SUPERSONICO" that Windows reports.
const fold = (text) => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const simplify = (text) => fold(text).toLowerCase().replace(/[\(\[].*?[\)\]]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Edits that are their own release on streaming but not on Apple Music.
const NOISE = /\s*[-\u2013\u2014]\s*((ultra|super)\s+)?(slowed|sped\s*up|speed\s*up|reverb|nightcore|remaster(ed)?|radio\s+edit|extended|live|bonus\s+track)\b.*$/i;
const searchName = (title) => fold(title).replace(/[\(\[][^\)\]]*[\)\]]/g, '').replace(NOISE, '').trim() || fold(title);

const tokens = (text) => simplify(text).split(' ').filter((word) => word.length >= 3);

function titleScore(wanted, got) {
  if (!wanted || !got) return 0;
  if (got === wanted) return 4;
  if (got.startsWith(wanted) || wanted.startsWith(got)) return 3;
  if (got.includes(wanted) || wanted.includes(got)) return 2;
  return 0;
}

function artistScore(wanted, got) {
  if (!wanted || !got) return 0;
  if (got === wanted) return 2;
  const mine = tokens(wanted);
  if (mine.length && mine.some((word) => got.includes(word))) return 1;
  return 0;
}

function albumScore(wanted, got) {
  if (!wanted || !got) return 0;
  if (got === wanted) return 3;
  if (got.includes(wanted) || wanted.includes(got)) return 2;
  return 0;
}

async function search(title, artist, album) {
  const term = `${fold(artist)} ${searchName(title)}`.trim();
  const query = new URLSearchParams({ term, entity: 'song', limit: '25' });
  const response = await net.fetch(`https://itunes.apple.com/search?${query}`);
  if (!response.ok) return EMPTY;
  const { results = [] } = await response.json();
  if (!results.length) return EMPTY;

  const wantTitle = simplify(title);
  const wantArtist = simplify(artist);
  const wantAlbum = simplify(album);

  const rate = (r) => {
    const t = titleScore(wantTitle, simplify(r.trackName));
    const a = artistScore(wantArtist, simplify(r.artistName));
    const c = albumScore(wantAlbum, simplify(r.collectionName));
    return { t, a, c, total: t * 2 + a + c };
  };

  const rated = results.map((r) => ({ r, ...rate(r) })).sort((x, y) => y.total - x.total);
  const best = rated[0];

  // Artwork has to be the right song. An artist match on its own is how a prolific
  // artist ends up wearing another album's cover, so the title has to agree too.
  const trusted = best && best.t >= 2 && (best.a > 0 || best.c > 0);
  const art = trusted && best.r.artworkUrl100
    ? best.r.artworkUrl100.replace(/\/\d+x\d+bb\./, '/600x600bb.')
    : '';

  // The mood only needs the right neighbourhood, so an artist match is enough for genre.
  const forGenre = trusted ? best : rated.find((entry) => entry.a > 0);
  return { artUrl: art, genre: (forGenre && forGenre.r.primaryGenreName) || '' };
}

// Returns what is known right now ({artUrl:'', genre:''} at first) and looks the rest up in the background.
function infoFor(track) {
  const key = `${track.title}|${track.artist}|${track.album || ''}`;
  const held = cache.get(key);
  if (held && (held.artUrl || Date.now() - held.at < MISS_RETRY)) return held;
  if (!pending.has(key)) {
    pending.add(key);
    search(track.title, track.artist, track.album).catch(() => EMPTY).then((info) => {
      pending.delete(key);
      cache.set(key, { ...info, at: Date.now() });
      if (cache.size > 200) cache.delete(cache.keys().next().value);
    });
  }
  return held || EMPTY;
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
