// Windows audio: the system's own output ("loopback"), delivered through getDisplayMedia.
// The main process answers the request with loopback audio, so no picker is shown.

let current = null;

async function openCapture(analyser) {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  if (!stream.getAudioTracks().length) {
    for (const track of stream.getTracks()) track.stop();
    throw new Error('No system audio track was provided');
  }

  // The loopback audio belongs to the screen-capture session. Stopping the video
  // track tears that session down and leaves a live but silent audio track, so the
  // video track is only disabled here, never stopped.
  for (const track of stream.getVideoTracks()) track.enabled = false;

  const context = new AudioContext();
  if (context.state === 'suspended') await context.resume();
  analyser.sampleRate = context.sampleRate;

  const source = context.createMediaStreamSource(stream);
  const tap = context.createScriptProcessor(1024, 2, 1);
  const mono = new Float32Array(1024);
  tap.onaudioprocess = (event) => {
    const input = event.inputBuffer;
    const left = input.getChannelData(0);
    const right = input.numberOfChannels > 1 ? input.getChannelData(1) : left;
    for (let i = 0; i < left.length; i++) mono[i] = (left[i] + right[i]) * 0.5;
    analyser.push(mono);
  };

  // The processor only runs while connected to an output; a silent one avoids an echo.
  const silent = context.createGain();
  silent.gain.value = 0;
  source.connect(tap);
  tap.connect(silent);
  silent.connect(context.destination);

  return { stream, context };
}

async function closeCapture(capture) {
  if (!capture) return;
  try { for (const track of capture.stream.getTracks()) track.stop(); } catch (error) { /* already gone */ }
  try { await capture.context.close(); } catch (error) { /* already closed */ }
}

export async function startLoopback(analyser) {
  current = await openCapture(analyser);

  // Loopback follows whichever device was default when capture opened. Plugging in
  // headphones changes the default, so the capture is reopened on the new one.
  let restarting = false;
  navigator.mediaDevices.addEventListener('devicechange', () => {
    if (restarting) return;
    restarting = true;
    setTimeout(async () => {
      const previous = current;
      try {
        current = await openCapture(analyser);
        await closeCapture(previous);
      } catch (error) {
        current = previous;
        console.error(`[audio] could not follow the output change: ${error.message}`);
      } finally {
        restarting = false;
      }
    }, 700);
  });
}
