let sharedCtx;

function getContext() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedCtx) {
    sharedCtx = new Ctx();
  }
  return sharedCtx;
}

export function playDrumHit() {
  const audioCtx = getContext();
  if (!audioCtx) return;

  if (audioCtx.state === "suspended") {
    void audioCtx.resume();
  }

  const t0 = audioCtx.currentTime;
  const master = audioCtx.createGain();
  master.gain.value = 0.38;
  master.connect(audioCtx.destination);

  const osc = audioCtx.createOscillator();
  osc.type = "sine";
  const gOsc = audioCtx.createGain();
  osc.connect(gOsc);
  gOsc.connect(master);

  osc.frequency.setValueAtTime(220, t0);
  osc.frequency.exponentialRampToValueAtTime(72, t0 + 0.07);
  gOsc.gain.setValueAtTime(0.95, t0);
  gOsc.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2);

  osc.start(t0);
  osc.stop(t0 + 0.22);

  const dur = 0.055;
  const nSamples = Math.floor(audioCtx.sampleRate * dur);
  const noiseBuf = audioCtx.createBuffer(1, nSamples, audioCtx.sampleRate);
  const ch = noiseBuf.getChannelData(0);
  for (let i = 0; i < nSamples; i++) {
    ch[i] = (Math.random() * 2 - 1) * (1 - i / nSamples) ** 1.5;
  }

  const noise = audioCtx.createBufferSource();
  noise.buffer = noiseBuf;
  const bp = audioCtx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 2600;
  bp.Q.value = 0.85;
  const gNoise = audioCtx.createGain();
  noise.connect(bp);
  bp.connect(gNoise);
  gNoise.connect(master);
  gNoise.gain.setValueAtTime(0.28, t0);
  gNoise.gain.exponentialRampToValueAtTime(0.001, t0 + 0.07);
  noise.start(t0);
  noise.stop(t0 + dur);
}
