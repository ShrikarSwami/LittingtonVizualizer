// Runs the native AudioTap helper and hands its mono float32 PCM to whoever is listening.
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const helperPath = () => (app.isPackaged
  ? path.join(process.resourcesPath, 'bin', 'AudioTap')
  : path.join(__dirname, '..', '..', '..', 'native', 'audio-tap', '.build', 'release', 'AudioTap'));

class Tap extends EventEmitter {
  constructor() {
    super();
    this.child = null;
    this.prefix = null;
    this.status = { state: 'off' };
  }

  // Capture audio from every process whose bundle ID starts with `prefix` (null stops capturing).
  target(prefix) {
    if (prefix === this.prefix) return;
    this.stop();
    this.prefix = prefix;
    if (prefix) this.start();
  }

  start() {
    const binary = helperPath();
    if (!fs.existsSync(binary)) return this.setStatus({ state: 'missing' });
    const child = spawn(binary, [this.prefix], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;
    this.setStatus({ state: 'starting' });

    let leftover = Buffer.alloc(0);
    child.stdout.on('data', (chunk) => {
      // Float32 samples are 4 bytes; never hand over half a sample.
      const data = leftover.length ? Buffer.concat([leftover, chunk]) : chunk;
      const usable = data.length - (data.length % 4);
      leftover = data.subarray(usable);
      if (usable) this.emit('samples', data.subarray(0, usable));
    });

    let pendingLine = '';
    child.stderr.on('data', (chunk) => {
      pendingLine += chunk;
      const lines = pendingLine.split('\n');
      pendingLine = lines.pop();
      for (const line of lines) {
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (message.event === 'format') this.setStatus({ state: 'running', sampleRate: message.sampleRate });
        else if (message.event === 'waiting') this.setStatus({ state: 'waiting' });
        else if (message.event === 'error') this.setStatus({ state: 'error', detail: `${message.stage} ${message.code ?? ''}`.trim() });
      }
    });

    child.on('exit', () => {
      if (this.child !== child) return;
      this.child = null;
      this.setStatus({ state: 'off' });
      // Restart if we still want this target (helper crashed or was killed).
      const wanted = this.prefix;
      setTimeout(() => { if (!this.child && this.prefix === wanted && wanted) this.start(); }, 2000);
    });
  }

  stop() {
    const child = this.child;
    this.child = null;
    this.prefix = null;
    if (child) { child.stdin.end(); child.kill('SIGTERM'); }
    this.setStatus({ state: 'off' });
  }

  setStatus(status) {
    this.status = status;
    this.emit('status', status);
  }
}

module.exports = { Tap };
