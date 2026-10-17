// The score for the home story, synthesised live with the Web Audio API (no audio files): a deep drone, a wide evolving pad, a breathing choir and shimmer,
// a sparse generative bell line, ping-pong echoes and a long hall reverb. Each scene has its own harmony and tempo; scene changes get a riser, an impact and a landing chime.
// Silent until the visitor chooses sound (browsers require a gesture); fades out away from the home page so it never mixes with a live call.

const KEY = "sw_sound";

// One entry per scene: the ringing phone, Ramesh picks up, the bank, the strain, the vaccine, the whole loop.
// chord: six pad notes (Hz) low to high. scale: the bell line's notes. bpm: tempo of the eighth-note grid. density: how often a bell speaks.
// cutoff: pad brightness. choir / shimmer / air: layer levels. pulse: a soft sub heartbeat that grows as the story gains purpose.
const SCENES = [
  { chord: [55.0, 82.41, 110.0, 130.81, 164.81, 246.94], scale: [440.0, 523.25, 587.33, 659.25, 783.99, 880.0], bpm: 62, density: 0.13, cutoff: 520, choir: 0.02, shimmer: 0.0, air: 0.02, pulse: 0 },
  { chord: [87.31, 130.81, 174.61, 220.0, 329.63, 392.0], scale: [349.23, 392.0, 440.0, 523.25, 587.33, 659.25, 698.46], bpm: 66, density: 0.2, cutoff: 780, choir: 0.05, shimmer: 0.05, air: 0.016, pulse: 0 },
  { chord: [73.42, 110.0, 146.83, 174.61, 261.63, 329.63], scale: [293.66, 349.23, 392.0, 440.0, 523.25, 587.33], bpm: 72, density: 0.24, cutoff: 900, choir: 0.05, shimmer: 0.06, air: 0.014, pulse: 0.35 },
  { chord: [98.0, 146.83, 196.0, 220.0, 293.66, 392.0], scale: [392.0, 440.0, 493.88, 587.33, 659.25, 783.99], bpm: 76, density: 0.26, cutoff: 1050, choir: 0.06, shimmer: 0.1, air: 0.014, pulse: 0.45 },
  { chord: [65.41, 130.81, 164.81, 196.0, 246.94, 329.63], scale: [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5], bpm: 80, density: 0.3, cutoff: 1300, choir: 0.08, shimmer: 0.16, air: 0.016, pulse: 0.5 },
  { chord: [65.41, 98.0, 130.81, 196.0, 261.63, 392.0], scale: [523.25, 659.25, 783.99, 880.0, 1046.5, 1318.5], bpm: 64, density: 0.2, cutoff: 1500, choir: 0.1, shimmer: 0.26, air: 0.03, pulse: 0.2 },
];

const listeners = new Set();
let ctx = null;
let master = null;
let analyser = null;
let hallIn = null;
let echoIn = null;
let noise = null;
let layers = null;
let heart = null;
let scene = "home";
let enabled = false;
let current = -1;
let timer = 0;
let nextT = 0;
let stepN = 0;
let contour = 2;
let suspendTimer = 0;
let lastStep = -1;
const level = new Uint8Array(32);
const fired = new Set();
let lastRing = -10;
let heartTimer = 0;

const stored = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function noiseBuffer(c, seconds) {
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** A hall: stereo noise that decays, with the highs dying faster than the lows, like air absorbing a big room. */
function hallImpulse(c, seconds = 5.2) {
  const rate = c.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = c.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let y = 0;
    for (let i = 0; i < len; i++) {
      const k = i / len;
      const a = 0.9 - 0.8 * Math.pow(k, 0.45);
      y += ((Math.random() * 2 - 1) - y) * a;
      data[i] = y * Math.pow(1 - k, 2.6) * (i < 400 ? i / 400 : 1);
    }
  }
  return buf;
}

/** Sends a node to the dry mix, the hall and the echo in the given amounts. */
function feed(node, { dry = 1, hall = 0, echo = 0 } = {}) {
  for (const [amount, dest] of [[dry, master], [hall, hallIn], [echo, echoIn]]) {
    if (!amount) continue;
    const g = ctx.createGain();
    g.gain.value = amount;
    node.connect(g);
    g.connect(dest);
  }
}

function osc(type, freq, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  return o;
}

function lfo(rate, depth, target) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.value = rate;
  g.gain.value = depth;
  o.connect(g);
  g.connect(target);
  o.start();
  return o;
}

function build() {
  ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "playback" });
  noise = noiseBuffer(ctx, 4);

  // master: gentle tone shaping, glue compression, then a hard ceiling
  master = ctx.createGain();
  master.gain.value = 0;
  const low = ctx.createBiquadFilter();
  low.type = "lowshelf";
  low.frequency.value = 140;
  low.gain.value = 2.5;
  const high = ctx.createBiquadFilter();
  high.type = "highshelf";
  high.frequency.value = 8500;
  high.gain.value = -2;
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -20;
  glue.knee.value = 20;
  glue.ratio.value = 3;
  glue.attack.value = 0.03;
  glue.release.value = 0.4;
  const ceiling = ctx.createDynamicsCompressor();
  ceiling.threshold.value = -3;
  ceiling.knee.value = 0;
  ceiling.ratio.value = 20;
  ceiling.attack.value = 0.003;
  ceiling.release.value = 0.12;
  analyser = ctx.createAnalyser();
  analyser.fftSize = 64;
  analyser.smoothingTimeConstant = 0.8;
  master.connect(low);
  low.connect(high);
  high.connect(glue);
  glue.connect(ceiling);
  ceiling.connect(analyser);
  ceiling.connect(ctx.destination);

  // the hall, pre-delayed so the dry sound stays in front
  hallIn = ctx.createGain();
  const pre = ctx.createDelay(0.2);
  pre.delayTime.value = 0.035;
  const hall = ctx.createConvolver();
  hall.buffer = hallImpulse(ctx);
  const hallOut = ctx.createGain();
  hallOut.gain.value = 0.9;
  hallIn.connect(pre);
  pre.connect(hall);
  hall.connect(hallOut);
  hallOut.connect(master);

  // ping-pong echo: left, then right, each repeat darker than the last
  echoIn = ctx.createGain();
  const dl = ctx.createDelay(1.5);
  const dr = ctx.createDelay(1.5);
  dl.delayTime.value = 0.375;
  dr.delayTime.value = 0.5;
  const fbL = ctx.createGain();
  const fbR = ctx.createGain();
  fbL.gain.value = fbR.gain.value = 0.38;
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 2600;
  const panL = ctx.createStereoPanner();
  const panR = ctx.createStereoPanner();
  panL.pan.value = -0.85;
  panR.pan.value = 0.85;
  const echoOut = ctx.createGain();
  echoOut.gain.value = 0.55;
  echoIn.connect(tone);
  tone.connect(dl);
  dl.connect(panL);
  dl.connect(fbL);
  fbL.connect(dr);
  dr.connect(panR);
  dr.connect(fbR);
  fbR.connect(dl);
  panL.connect(echoOut);
  panR.connect(echoOut);
  echoOut.connect(master);
  const toHall = ctx.createGain();
  toHall.gain.value = 0.35;
  echoOut.connect(toHall);
  toHall.connect(hallIn);

  const first = SCENES[0];

  // the drone: a sub sine and a dark saw, one octave up, under everything
  const droneBus = ctx.createGain();
  droneBus.gain.value = 0.9;
  const sub = osc("sine", first.chord[0] / 1);
  const subGain = ctx.createGain();
  subGain.gain.value = 0.2;
  const dark = osc("sawtooth", first.chord[0] * 2, -4);
  const darkLp = ctx.createBiquadFilter();
  darkLp.type = "lowpass";
  darkLp.frequency.value = 190;
  const darkGain = ctx.createGain();
  darkGain.gain.value = 0.05;
  sub.connect(subGain);
  subGain.connect(droneBus);
  dark.connect(darkLp);
  darkLp.connect(darkGain);
  darkGain.connect(droneBus);
  lfo(0.06, 0.05, subGain.gain);
  sub.start();
  dark.start();
  feed(droneBus, { dry: 1, hall: 0.12 });

  // the pad: six detuned voices spread across the stereo field, softened by a slowly breathing filter
  const padBus = ctx.createGain();
  padBus.gain.value = 0.52;
  const padLp = ctx.createBiquadFilter();
  padLp.type = "lowpass";
  padLp.frequency.value = first.cutoff;
  padLp.Q.value = 0.5;
  lfo(0.045, 260, padLp.frequency);
  padBus.connect(padLp);
  feed(padLp, { dry: 0.85, hall: 0.55 });
  const pans = [-0.65, -0.35, -0.1, 0.1, 0.35, 0.65];
  const padVoices = first.chord.map((f, i) => {
    const a = osc("sawtooth", f, -6);
    const b = osc(i % 2 ? "triangle" : "sawtooth", f, 6);
    const g = ctx.createGain();
    g.gain.value = i < 2 ? 0.05 : 0.04;
    const p = ctx.createStereoPanner();
    p.pan.value = pans[i];
    a.connect(g);
    b.connect(g);
    g.connect(p);
    p.connect(padBus);
    a.start();
    b.start();
    return { a, b };
  });

  // the choir: soft breathy voices an octave up, with a slow vibrato
  const choirBus = ctx.createGain();
  choirBus.gain.value = first.choir;
  const choirLp = ctx.createBiquadFilter();
  choirLp.type = "lowpass";
  choirLp.frequency.value = 1700;
  choirBus.connect(choirLp);
  feed(choirLp, { dry: 0.5, hall: 0.9 });
  const choirVoices = [3, 4, 5].map((k, i) => {
    const a = osc("triangle", first.chord[k] * 2, i * 4 - 4);
    const b = osc("sine", first.chord[k] * 2.004);
    lfo(5.1 + i * 0.3, 7, a.detune);
    const g = ctx.createGain();
    g.gain.value = 0.35;
    const p = ctx.createStereoPanner();
    p.pan.value = (i - 1) * 0.6;
    a.connect(g);
    b.connect(g);
    g.connect(p);
    p.connect(choirBus);
    a.start();
    b.start();
    return { a, b };
  });

  // the shimmer: glassy sines two octaves up, swelling and fading, almost all reverb
  const shimBus = ctx.createGain();
  shimBus.gain.value = first.shimmer;
  const trem = ctx.createGain();
  trem.gain.value = 0.65;
  lfo(0.13, 0.35, trem.gain);
  trem.connect(shimBus);
  feed(shimBus, { dry: 0.25, hall: 1.2 });
  const shimVoices = [3, 4, 5].map((k, i) => {
    const o = osc("sine", first.chord[k] * 4, i * 5 - 5);
    const p = ctx.createStereoPanner();
    p.pan.value = (i - 1) * 0.8;
    o.connect(p);
    p.connect(trem);
    o.start();
    return o;
  });

  // air: breath of filtered noise whose colour drifts
  const air = ctx.createBufferSource();
  air.buffer = noise;
  air.loop = true;
  const airBp = ctx.createBiquadFilter();
  airBp.type = "bandpass";
  airBp.frequency.value = 1500;
  airBp.Q.value = 0.45;
  const airGain = ctx.createGain();
  airGain.gain.value = first.air;
  lfo(0.05, 700, airBp.frequency);
  air.connect(airBp);
  airBp.connect(airGain);
  feed(airGain, { dry: 0.6, hall: 0.7 });
  air.start();

  heart = ctx.createGain();
  heart.gain.value = 0;
  heart.connect(master);

  layers = { sub, dark, padVoices, padLp, padBus, choirVoices, choirBus, shimVoices, shimBus, airGain };
}

/** Glides every layer to a scene's harmony. */
function applyScene(i, quick = false) {
  if (!ctx || !layers) return;
  const sc = SCENES[Math.max(0, Math.min(SCENES.length - 1, i))];
  const t = ctx.currentTime;
  const tc = quick ? 0.05 : 1.5;
  const L = layers;
  L.sub.frequency.setTargetAtTime(sc.chord[0], t, tc);
  L.dark.frequency.setTargetAtTime(sc.chord[0] * 2, t, tc);
  L.padVoices.forEach((v, k) => {
    v.a.frequency.setTargetAtTime(sc.chord[k], t, tc);
    v.b.frequency.setTargetAtTime(sc.chord[k], t, tc);
  });
  L.choirVoices.forEach((v, k) => {
    v.a.frequency.setTargetAtTime(sc.chord[k + 3] * 2, t, tc);
    v.b.frequency.setTargetAtTime(sc.chord[k + 3] * 2.004, t, tc);
  });
  L.shimVoices.forEach((o, k) => o.frequency.setTargetAtTime(sc.chord[k + 3] * 4, t, tc));
  L.padLp.frequency.setTargetAtTime(sc.cutoff, t, tc);
  L.choirBus.gain.setTargetAtTime(sc.choir, t, tc);
  L.shimBus.gain.setTargetAtTime(sc.shimmer, t, tc);
  L.airGain.gain.setTargetAtTime(sc.air, t, tc);
  current = i;
  contour = Math.min(contour, sc.scale.length - 1);
}

const out = () => (enabled && scene === "home" ? 0.5 : 0);

function applyMaster(seconds = 0.6) {
  if (!ctx) return;
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setTargetAtTime(out(), ctx.currentTime, seconds);
}

// ---------------------------------------------------------------- the bell line and the pulse
/** A struck bell: a pure tone with a bright inharmonic overtone that dies away fast. */
function bell(freq, when, { gain = 0.14, pan = 0, dur = 3, echo = 0.5, hall = 0.8 } = {}) {
  const t = ctx.currentTime + Math.max(0, when - ctx.currentTime);
  const carrier = osc("sine", freq);
  const mod = osc("sine", freq * 3.5);
  const modGain = ctx.createGain();
  modGain.gain.setValueAtTime(freq * 1.6, t);
  modGain.gain.exponentialRampToValueAtTime(freq * 0.02, t + dur * 0.5);
  mod.connect(modGain);
  modGain.connect(carrier.frequency);
  const over = osc("sine", freq * 2.005);
  const overGain = ctx.createGain();
  overGain.gain.setValueAtTime(0.0001, t);
  overGain.gain.exponentialRampToValueAtTime(gain * 0.35, t + 0.004);
  overGain.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.4);
  over.connect(overGain);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  carrier.connect(g);
  overGain.connect(g);
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  g.connect(p);
  feed(p, { dry: 0.7, hall, echo });
  [carrier, mod, over].forEach((o) => {
    o.start(t);
    o.stop(t + dur + 0.1);
  });
}

function kick(when, amount) {
  const t = Math.max(ctx.currentTime, when);
  const o = osc("sine", 86);
  o.frequency.setValueAtTime(86, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.24);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5 * amount, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
  o.connect(g);
  feed(g, { dry: 1, hall: 0.08 });
  o.start(t);
  o.stop(t + 0.5);
}

function hat(when, amount) {
  const t = Math.max(ctx.currentTime, when);
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 7000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05 * amount, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  s.connect(hp);
  hp.connect(g);
  const p = ctx.createStereoPanner();
  p.pan.value = rand(-0.5, 0.5);
  g.connect(p);
  feed(p, { dry: 0.8, echo: 0.3 });
  s.start(t, rand(0, 2));
  s.stop(t + 0.1);
}

function playStep(sc, n, when) {
  const bar = n % 16;
  if (sc.pulse > 0 && bar % 8 === 0) kick(when, sc.pulse);
  if (sc.pulse > 0.3 && bar % 4 === 2) hat(when, sc.pulse);
  const downbeat = bar === 0 || bar === 8;
  const chance = sc.density * (bar % 2 === 0 ? 1 : 0.4) + (downbeat ? sc.density * 0.6 : 0);
  if (Math.random() > chance) return;
  contour = Math.max(0, Math.min(sc.scale.length - 1, contour + pick([-2, -1, -1, 1, 1, 2])));
  const f = sc.scale[contour];
  bell(f, when, { gain: rand(0.07, 0.13), pan: rand(-0.7, 0.7), dur: rand(2.4, 3.6) });
  if (Math.random() < 0.18) bell(f * 2, when + 0.02, { gain: 0.04, pan: rand(-0.9, 0.9), dur: 2, echo: 0.8 });
}

function schedule() {
  if (!ctx || !enabled || scene !== "home" || current < 0) return;
  const sc = SCENES[current];
  const stepDur = 60 / sc.bpm / 2;
  if (nextT < ctx.currentTime) nextT = ctx.currentTime + 0.08;
  while (nextT < ctx.currentTime + 0.7) {
    playStep(sc, stepN, nextT);
    nextT += stepDur;
    stepN++;
  }
}

function startScheduler() {
  if (timer) return;
  nextT = 0;
  timer = setInterval(schedule, 120);
}

function stopScheduler() {
  clearInterval(timer);
  timer = 0;
}

// ---------------------------------------------------------------- scene changes
/** A riser into the new scene, an impact as it lands, and a short chime on its chord. */
function transition(from, to) {
  if (!ctx || !enabled || scene !== "home") return;
  const t = ctx.currentTime;
  const up = to > from;
  const span = Math.min(3, Math.abs(to - from));
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 1.3;
  bp.frequency.setValueAtTime(up ? 260 : 3800, t);
  bp.frequency.exponentialRampToValueAtTime(up ? 3800 : 260, t + 1.4);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.13, t + 0.9);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.55);
  const p = ctx.createStereoPanner();
  p.pan.setValueAtTime(up ? -0.6 : 0.6, t);
  p.pan.linearRampToValueAtTime(up ? 0.6 : -0.6, t + 1.4);
  s.connect(bp);
  bp.connect(g);
  g.connect(p);
  feed(p, { dry: 0.8, hall: 0.9 });
  s.start(t, rand(0, 2));
  s.stop(t + 1.7);

  // impact: a deep drop, a breath of noise, a bloom in the hall
  const hit = t + 1.1;
  const boom = osc("sine", 96);
  boom.frequency.setValueAtTime(96, hit);
  boom.frequency.exponentialRampToValueAtTime(32, hit + 1.2);
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0.0001, hit);
  bg.gain.exponentialRampToValueAtTime(up ? 0.42 : 0.26, hit + 0.02);
  bg.gain.exponentialRampToValueAtTime(0.0001, hit + 1.5);
  boom.connect(bg);
  feed(bg, { dry: 1, hall: 0.35 });
  boom.start(hit);
  boom.stop(hit + 1.6);

  // the pad swells as the scene arrives
  const swell = layers.padBus.gain;
  swell.cancelScheduledValues(t);
  swell.setTargetAtTime(0.52, t, 0.01);
  swell.setTargetAtTime(0.52 * (1.3 + 0.1 * span), t + 0.5, 0.5);
  swell.setTargetAtTime(0.52, t + 2.0, 0.9);

  // landing chime: three notes from the new scene's line
  const sc = SCENES[to];
  [0, 2, 4].forEach((k, i) => bell(sc.scale[Math.min(sc.scale.length - 1, k)] * (i === 2 ? 2 : 1), hit + 0.05 + i * 0.16, { gain: 0.1, pan: (i - 1) * 0.5, dur: 3.2, hall: 1, echo: 0.6 }));
}

// ---------------------------------------------------------------- one-shot sounds
function tone(freq, { type = "sine", dur = 0.4, gain = 0.2, attack = 0.005, when = 0, glide = 0, hall = 0.3, echo = 0, pan = 0 } = {}) {
  const t = ctx.currentTime + when;
  const o = osc(type, freq);
  const g = ctx.createGain();
  if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * glide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  g.connect(p);
  feed(p, { dry: 1, hall, echo });
  o.start(t);
  o.stop(t + dur + 0.05);
}

function burst({ dur = 0.3, gain = 0.15, from = 800, to = 4000, q = 1.2, when = 0, type = "bandpass", hall = 0.5 } = {}) {
  const t = ctx.currentTime + when;
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.2);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f);
  f.connect(g);
  feed(g, { dry: 1, hall });
  s.start(t, rand(0, 2));
  s.stop(t + dur + 0.05);
}

const SOUNDS = {
  ring() {
    [0, 0.52].forEach((w) => {
      tone(440, { dur: 0.42, gain: 0.07, when: w, hall: 0.5 });
      tone(480, { dur: 0.42, gain: 0.07, when: w, hall: 0.5 });
      tone(1320, { dur: 0.3, gain: 0.02, when: w, hall: 0.8, echo: 0.4 });
    });
  },
  pickup() {
    burst({ dur: 0.08, gain: 0.12, from: 2500, to: 900, type: "highpass" });
    bell(523.25, ctx.currentTime + 0.06, { gain: 0.1, dur: 1.8 });
    bell(783.99, ctx.currentTime + 0.18, { gain: 0.09, dur: 2.4, pan: 0.3 });
  },
  lock() {
    tone(190, { dur: 0.4, gain: 0.34, glide: 0.35, hall: 0.12 });
    burst({ dur: 0.07, gain: 0.2, from: 3000, to: 1200, type: "highpass" });
    bell(1760, ctx.currentTime + 0.05, { gain: 0.06, dur: 2.2, echo: 0.7 });
    bell(2637, ctx.currentTime + 0.05, { gain: 0.035, dur: 1.8, echo: 0.7, pan: -0.4 });
  },
  mark() {
    tone(329.63, { type: "triangle", dur: 0.4, gain: 0.1, echo: 0.3 });
    tone(246.94, { type: "triangle", dur: 0.55, gain: 0.09, when: 0.12, echo: 0.3 });
  },
  card() {
    bell(1318.5, ctx.currentTime, { gain: 0.07, dur: 2.6, hall: 1, echo: 0.7 });
    bell(1975.5, ctx.currentTime + 0.09, { gain: 0.05, dur: 2.2, hall: 1, echo: 0.7, pan: 0.5 });
  },
  redact() {
    burst({ dur: 0.6, gain: 0.1, from: 600, to: 5200, q: 2.2 });
  },
  protect() {
    [261.63, 329.63, 392.0, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => bell(f, ctx.currentTime + i * 0.11, { gain: 0.085, dur: 3.4, hall: 1.1, echo: 0.6, pan: (i - 3) * 0.25 }));
    burst({ dur: 1.4, gain: 0.05, from: 400, to: 7000, q: 0.7, when: 0.05, hall: 1 });
  },
  tick() {
    tone(2100, { dur: 0.05, gain: 0.035, hall: 0.1 });
  },
  click() {
    tone(660, { type: "triangle", dur: 0.12, gain: 0.07, glide: 0.7, hall: 0.2 });
    tone(990, { dur: 0.18, gain: 0.04, when: 0.03, hall: 0.3 });
  },
  on() {
    [392.0, 523.25, 659.25, 783.99].forEach((f, i) => bell(f, ctx.currentTime + i * 0.1, { gain: 0.08, dur: 3, hall: 1, echo: 0.5, pan: (i - 1.5) * 0.3 }));
  },
};

function play(name) {
  if (!ctx || !enabled || scene !== "home") return;
  SOUNDS[name]?.();
}

function pulseHeart() {
  if (!ctx || !enabled || scene !== "home") return;
  const t = ctx.currentTime;
  [0, 0.22].forEach((w, i) => {
    const o = osc("sine", 70);
    o.frequency.setValueAtTime(70, t + w);
    o.frequency.exponentialRampToValueAtTime(42, t + w + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t + w);
    g.gain.exponentialRampToValueAtTime(i ? 0.16 : 0.22, t + w + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + w + 0.2);
    o.connect(g);
    g.connect(heart);
    o.start(t + w);
    o.stop(t + w + 0.25);
  });
}

function emit() {
  listeners.forEach((fn) => fn(enabled));
}

export const sound = {
  get enabled() {
    return enabled;
  },
  get wanted() {
    return stored();
  },
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** Must run inside a click or key handler. */
  async enable() {
    if (!ctx) build();
    clearTimeout(suspendTimer);
    if (ctx.state === "suspended") await ctx.resume();
    enabled = true;
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* private mode: preference just will not persist */
    }
    heart.gain.value = 1;
    applyScene(current < 0 ? 0 : current, true);
    startScheduler();
    applyMaster(1.6);
    SOUNDS.on();
    emit();
  },
  disable() {
    enabled = false;
    try {
      localStorage.setItem(KEY, "0");
    } catch {
      /* ignore */
    }
    applyMaster(0.2);
    stopScheduler();
    clearTimeout(suspendTimer);
    suspendTimer = setTimeout(() => !enabled && ctx?.suspend(), 1400);
    emit();
  },
  toggle() {
    return enabled ? this.disable() : this.enable();
  },
  /** "home" plays the score; any other page fades it out. */
  setScene(name) {
    scene = name;
    applyMaster(name === "home" ? 1.2 : 0.3);
    if (!ctx) return;
    if (name === "home" && enabled) startScheduler();
    else stopScheduler();
  },
  play,
  /** 0..1 loudness for the title-bar waveform. */
  level() {
    if (!analyser || !enabled) return 0;
    analyser.getByteFrequencyData(level);
    let sum = 0;
    for (let i = 2; i < 18; i++) sum += level[i];
    return Math.min(1, sum / (16 * 150));
  },
  bars(n = 4) {
    if (!analyser || !enabled) return Array.from({ length: n }, () => 0);
    analyser.getByteFrequencyData(level);
    return Array.from({ length: n }, (_, i) => Math.min(1, level[2 + i * 3] / 170));
  },
  /** Called every frame by the story with its progress and current scene; fires each cue once as you pass it. */
  journey(p, now, step = 0) {
    if (!ctx || !enabled || scene !== "home") return;
    const idx = Math.max(0, Math.min(SCENES.length - 1, step));
    if (idx !== current) {
      const from = current < 0 ? idx : current;
      applyScene(idx);
      if (lastStep !== -1 && from !== idx) transition(from, idx);
    }
    lastStep = idx;
    const cue = (id, at, name) => {
      if (p >= at && !fired.has(id)) {
        fired.add(id);
        play(name);
      } else if (p < at - 0.012) fired.delete(id);
    };
    cue("pickup", 0.27, "pickup");
    cue("mark", 0.5, "mark");
    cue("lock", 0.527, "lock");
    cue("card", 0.6, "card");
    cue("redact", 0.66, "redact");
    cue("protect", 0.775, "protect");
    // the phone rings from the first scene until Ramesh answers, with a tense heartbeat under it
    if (p > 0.05 && p < 0.27 && now - lastRing > 2.4) {
      lastRing = now;
      play("ring");
    }
    const beating = p > 0.05 && p < 0.3;
    if (beating && now - heartTimer > 0.95) {
      heartTimer = now;
      pulseHeart();
    }
  },
};

/** Subtle UI sounds on hover and click, anywhere on the home page. */
export function installUiSounds() {
  let last = 0;
  document.addEventListener(
    "pointerover",
    (e) => {
      if (!enabled || scene !== "home") return;
      const el = e.target instanceof Element ? e.target.closest("a, button, .sj-nb") : null;
      if (!el || el === document.body) return;
      const now = performance.now();
      if (now - last < 90) return;
      last = now;
      play("tick");
    },
    { passive: true },
  );
  document.addEventListener("click", (e) => {
    if (!enabled || scene !== "home") return;
    if (e.target instanceof Element && e.target.closest("a, button")) play("click");
  });
}
