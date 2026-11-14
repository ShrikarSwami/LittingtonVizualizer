// Runs inside music.youtube.com. Once a second it reads what is playing, where the playhead is,
// and the up-next queue, and hands that to the extension's background worker.
(() => {
  if (window.__lvBridge) return;          // already running in this page
  window.__lvBridge = true;

  const pageId = Math.random().toString(36).slice(2, 10);
  const text = (node) => (node ? (node.textContent || '').replace(/\s+/g, ' ').trim() : '');
  const bigArt = (url) => (url ? url.replace(/=w\d+-h\d+[^=]*$/, '=w544-h544-l90-rj') : '');

  // "Artist • Album • 2020" for songs, "Artist • 1.2M views • 30K likes" for videos.
  function splitByline(byline) {
    const parts = byline.split('•').map((part) => part.trim()).filter(Boolean);
    const artist = parts[0] || '';
    const second = parts[1] || '';
    const album = /\b(views?|likes?|subscribers?)\b/i.test(second) || /^\d{4}$/.test(second) ? '' : second;
    return { artist, album };
  }

  function nowPlaying() {
    const bar = document.querySelector('ytmusic-player-bar');
    const video = document.querySelector('video');
    let title = text(bar && bar.querySelector('.title'));
    let { artist, album } = splitByline(text(bar && bar.querySelector('.byline')));
    let artUrl = '';

    // The page's media session has the cleanest data when it's available.
    const session = navigator.mediaSession && navigator.mediaSession.metadata;
    if (session && session.title) {
      title = session.title;
      artist = session.artist || artist;
      album = session.album || album;
      const artwork = Array.from(session.artwork || []);
      artUrl = artwork.length ? artwork[artwork.length - 1].src : '';
    }
    if (!artUrl) {
      const image = bar && bar.querySelector('img.image, .thumbnail-image-wrapper img, img');
      artUrl = bigArt(image && image.src);
    }
    return {
      title, artist, album, artUrl,
      playing: Boolean(video && !video.paused && !video.ended),
      position: video ? video.currentTime : 0,
      duration: video && Number.isFinite(video.duration) ? video.duration : 0,
    };
  }

  function upNext() {
    const items = Array.from(document.querySelectorAll('ytmusic-player-queue ytmusic-player-queue-item'))
      .filter((item) => item.offsetParent !== null || item.hasAttribute('selected'));
    if (!items.length) return null;
    const current = items.findIndex((item) => item.hasAttribute('selected') || item.getAttribute('play-button-state') === 'playing' || item.getAttribute('play-button-state') === 'paused');
    return items.slice(current + 1, current + 13).map((item) => {
      const image = item.querySelector('img');
      return {
        title: text(item.querySelector('.song-title')),
        artist: splitByline(text(item.querySelector('.byline'))).artist,
        artUrl: image && /^https:/.test(image.src) ? image.src : '',
      };
    }).filter((item) => item.title);
  }

  const timer = setInterval(() => {
    try {
      const report = { pageId, ...nowPlaying(), queue: upNext() };
      if (!report.title) return;
      chrome.runtime.sendMessage({ type: 'lv-report', report }).catch(() => {});
    } catch (error) {
      // The extension was reloaded or removed: this copy of the script is orphaned.
      if (String(error).includes('Extension context invalidated')) clearInterval(timer);
    }
  }, 1000);
})();
