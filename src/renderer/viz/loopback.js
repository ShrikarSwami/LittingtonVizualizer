// Windows audio: the system's own output ("loopback"), delivered through getDisplayMedia.
// The main process answers the request with loopback audio, so no picker is shown.
// NOTE: written on a Mac and not yet run on Windows.

export async function startLoopback(analyser) {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  for (const track of stream.getVideoTracks()) track.stop();        // only the sound is wanted
  if (!stream.getAudioTracks().length) throw new Error('No system audio track was provided');

  const context = new AudioContext();
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
}
