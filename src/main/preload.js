// The only doorway between the window and the rest of the app.
const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (handler) => {
  const listener = (_event, payload) => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('lv', {
  platform: process.platform,
  loadPresets: () => ipcRenderer.invoke('presets:load'),
  fetchArt: (url) => ipcRenderer.invoke('art:fetch', url),
  getLyrics: (track) => ipcRenderer.invoke('lyrics:get', track),
  toggleFullscreen: () => ipcRenderer.invoke('window:fullscreen'),
  connectSpotify: (clientId) => ipcRenderer.invoke('spotify:connect', clientId),
  disconnectSpotify: () => ipcRenderer.invoke('spotify:disconnect'),
  showExtensionFolder: () => ipcRenderer.invoke('extension:show'),
  mediaCommand: (name) => ipcRenderer.invoke('media:command', name),
  ready: () => ipcRenderer.send('renderer:ready'),
  onState: on('state'),
  onAudio: on('audio'),
  onAudioStatus: on('audio:status'),
});
