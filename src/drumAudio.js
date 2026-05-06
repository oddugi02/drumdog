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
  master.gain.value = 0.32;
  master.connect(audioCtx.destination);

  // Metallic "rim / cymbal" style hit (sharp, bright, short).
  const noiseDur = 0.065;
  const nSamples = Math.floor(audioCtx.sampleRate * noiseDur);
  const noiseBuf = audioCtx.createBuffer(1, nSamples, audioCtx.sampleRate);
  const ch = noiseBuf.getChannelData(0);
  for (let i = 0; i < nSamples; i++) {
    // fast-decaying white noise burst
    ch[i] = (Math.random() * 2 - 1) * (1 - i / nSamples) ** 2.2;
  }

  const noise = audioCtx.createBufferSource();
  noise.buffer = noiseBuf;

  // Brighten noise (hi-hat-ish)
  const hp = audioCtx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 5200;
  hp.Q.value = 0.7;

  // Metallic resonances (a couple of narrow bands)
  const bpA = audioCtx.createBiquadFilter();
  bpA.type = "bandpass";
  bpA.frequency.value = 8200;
  bpA.Q.value = 7.5;

  const bpB = audioCtx.createBiquadFilter();
  bpB.type = "bandpass";
  bpB.frequency.value = 10500;
  bpB.Q.value = 9.5;

  const gNoise = audioCtx.createGain();
  gNoise.gain.setValueAtTime(0.0001, t0);
  gNoise.gain.exponentialRampToValueAtTime(0.9, t0 + 0.002);
  gNoise.gain.exponentialRampToValueAtTime(0.001, t0 + 0.075);

  noise.connect(hp);
  hp.connect(bpA);
  hp.connect(bpB);
  bpA.connect(gNoise);
  bpB.connect(gNoise);
  gNoise.connect(master);

  // Add a very short "click" transient (rim attack)
  const clickOsc = audioCtx.createOscillator();
  clickOsc.type = "square";
  clickOsc.frequency.setValueAtTime(3200, t0);
  const gClick = audioCtx.createGain();
  gClick.gain.setValueAtTime(0.0001, t0);
  gClick.gain.exponentialRampToValueAtTime(0.55, t0 + 0.001);
  gClick.gain.exponentialRampToValueAtTime(0.001, t0 + 0.015);
  clickOsc.connect(gClick);
  gClick.connect(master);

  noise.start(t0);
  noise.stop(t0 + noiseDur);
  clickOsc.start(t0);
  clickOsc.stop(t0 + 0.02);
}
