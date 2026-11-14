// Tiny JSON settings store in the app's user-data folder. Secrets are encrypted with the macOS keychain.
const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

const file = () => path.join(app.getPath('userData'), 'settings.json');
let cache = null;

function load() {
  if (!cache) {
    try { cache = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { cache = {}; }
  }
  return cache;
}

function save() {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(cache, null, 2), { mode: 0o600 });
}

exports.get = (key, fallback) => (key in load() ? load()[key] : fallback);
exports.set = (key, value) => {
  load();
  if (value === undefined || value === null) delete cache[key]; else cache[key] = value;
  save();
};

exports.getSecret = (key) => {
  const stored = exports.get(key);
  if (!stored) return null;
  try { return safeStorage.decryptString(Buffer.from(stored, 'base64')); } catch { return null; }
};
exports.setSecret = (key, value) => {
  if (!value) return exports.set(key, null);
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Keychain encryption is unavailable');
  exports.set(key, safeStorage.encryptString(value).toString('base64'));
};
