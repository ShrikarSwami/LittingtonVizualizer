// Up next: the queue when the source shares it, otherwise how to switch it on.

const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export function extensionSteps() {
  const box = document.createDocumentFragment();
  box.append(element('div', '', 'YouTube Music keeps its track info and queue to itself. A small Chrome extension that ships with this app passes them along:'));
  const list = element('ol');
  for (const step of [
    'Open chrome://extensions in Chrome (the address is copied when you press the button).',
    'Turn on Developer mode, press “Load unpacked”, and choose the extension folder.',
    'Play something in YouTube Music.',
  ]) list.append(element('li', '', step));
  box.append(list);
  const row = element('div', 'row');
  const button = element('button', 'action', 'Show extension folder');
  button.addEventListener('click', () => window.lv.showExtensionFolder());
  row.append(button);
  box.append(row);
  return box;
}

export class QueuePanel {
  constructor(root) {
    this.root = root;
    this.signature = null;
    this.thumbs = new Map();
  }

  update(state) {
    const signature = JSON.stringify([state.source, state.queueNote, state.queue, state.spotifyLoggedIn]);
    if (signature === this.signature) return;
    this.signature = signature;
    this.root.innerHTML = '';
    this.root.classList.add('plain-top');
    this.root.classList.toggle('no-mask', !(state.queue && state.queue.length));

    if (state.queue && state.queue.length) {
      const list = element('div', 'list');
      for (const item of state.queue.slice(0, 12)) {
        const row = element('div', 'item');
        const thumb = element(item.artUrl ? 'img' : 'div', item.artUrl ? '' : 'thumb');
        if (item.artUrl) this.loadThumb(thumb, item.artUrl);
        const text = element('div', 'text');
        text.append(element('div', 'name', item.title), element('div', 'by', item.artist));
        row.append(thumb, text);
        list.append(row);
      }
      this.root.append(list);
      return;
    }

    const box = element('div', 'message');
    if (!state.source) box.textContent = 'Nothing queued.';
    else if (state.queueNote === 'extension') box.append(extensionSteps());
    else if (state.queueNote === 'spotify-login') box.append(this.spotifyForm());
    else if (state.queueNote === 'empty') box.textContent = state.source === 'ytmusic'
      ? 'No queue yet. Open the player page in YouTube Music once so its queue loads.'
      : 'Nothing queued.';
    else box.textContent = state.queueNote || 'Nothing queued.';
    if (state.source === 'spotify' && state.spotifyLoggedIn) {
      const row = element('div', 'row');
      const out = element('button', 'action quiet', 'Disconnect Spotify');
      out.addEventListener('click', () => window.lv.disconnectSpotify());
      row.append(out);
      box.append(row);
    }
    this.root.append(box);
  }

  spotifyForm() {
    const box = document.createDocumentFragment();
    box.append(element('div', '', 'Spotify only shares its queue after a one-time login. Create a free app at developer.spotify.com/dashboard, add the redirect address http://127.0.0.1:38217/spotify-callback, then paste its Client ID:'));
    const row = element('div', 'row');
    const field = element('input', 'field');
    field.placeholder = 'Spotify Client ID';
    field.spellcheck = false;
    const button = element('button', 'action', 'Connect Spotify');
    const error = element('div', 'error');
    const submit = async () => {
      error.textContent = '';
      const result = await window.lv.connectSpotify(field.value);
      if (!result.ok) error.textContent = result.error;
      else error.textContent = '';
    };
    button.addEventListener('click', submit);
    field.addEventListener('keydown', (event) => {
      event.stopPropagation();                       // typing here must not trigger hotkeys
      if (event.key === 'Enter') submit();
    });
    row.append(field, button);
    box.append(row, error);
    return box;
  }

  async loadThumb(image, url) {
    if (!this.thumbs.has(url)) {
      this.thumbs.set(url, window.lv.fetchArt(url));
      if (this.thumbs.size > 40) this.thumbs.delete(this.thumbs.keys().next().value);
    }
    const dataUrl = await this.thumbs.get(url);
    if (dataUrl) image.src = dataUrl;
  }
}
