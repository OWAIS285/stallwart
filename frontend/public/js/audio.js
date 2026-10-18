// Browser audio: microphone capture (16 kHz PCM16), persona playback (24 kHz PCM16) and the visualiser.

export const MIC_THRESHOLD = 0.018; // rms level treated as "the caller is talking"

export class Mic {
  constructor(onChunk) {
    this.onChunk = onChunk;
    this.level = 0;
    this.muted = false;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this.ctx = new AudioContext({ latencyHint: "interactive" });
    await this.ctx.audioWorklet.addModule(new URL("./pcm-worklet.js", import.meta.url));
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "pcm16k");
    this.node.port.onmessage = (event) => {
      const { pcm, rms } = event.data;
      this.level = this.muted ? 0 : Math.min(1, rms * 6);
      this.onChunk(pcm, this.muted ? 0 : rms);
    };
    const sink = this.ctx.createGain();
    sink.gain.value = 0;
    source.connect(this.node);
    this.node.connect(sink);
    sink.connect(this.ctx.destination);
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    this.stream?.getAudioTracks().forEach((track) => (track.enabled = !muted));
  }

  stop() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.node?.disconnect();
    this.ctx?.close().catch(() => {});
    this.stream = this.node = this.ctx = null;
    this.level = 0;
  }
}

export class Player {
  constructor() {
    this.ctx = null;
    this.nextTime = 0;
    this.sources = new Set();
    this.freqData = null;
    this.onStart = null;
    this.onIdle = null;
  }

  async init() {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext({ sampleRate: 24000, latencyHint: "interactive" });
    } catch {
      this.ctx = new AudioContext({ latencyHint: "interactive" });
    }
    this.input = this.ctx.createGain();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 128;
    this.analyser.smoothingTimeConstant = 0.6;
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.connect(this.ctx.destination);
    this.input.connect(this.analyser);
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  isPlaying() {
    return this.sources.size > 0;
  }

  enqueue(buffer) {
    if (!this.ctx || buffer.byteLength < 2) return;
    const ints = new Int16Array(buffer, 0, buffer.byteLength >> 1);
    const floats = new Float32Array(ints.length);
    for (let i = 0; i < ints.length; i++) floats[i] = ints[i] / 32768;
    const audio = this.ctx.createBuffer(1, floats.length, 24000);
    audio.copyToChannel(floats, 0);
    const source = this.ctx.createBufferSource();
    source.buffer = audio;
    source.connect(this.input);
    const wasIdle = this.sources.size === 0;
    const startAt = Math.max(this.nextTime, this.ctx.currentTime + 0.05);
    source.start(startAt);
    this.nextTime = startAt + audio.duration;
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      if (this.sources.size === 0) this.onIdle?.();
    };
    if (wasIdle) this.onStart?.();
  }

  /** Barge-in: drop everything that is queued so the persona stops mid-sentence. */
  flush() {
    for (const source of this.sources) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
    }
    const hadAudio = this.sources.size > 0;
    this.sources.clear();
    this.nextTime = 0;
    if (hadAudio) this.onIdle?.();
  }

  frequency() {
    if (!this.analyser || !this.isPlaying()) return null;
    this.analyser.getByteFrequencyData(this.freqData);
    return this.freqData;
  }

  level() {
    const data = this.frequency();
    if (!data) return 0;
    let sum = 0;
    for (let i = 0; i < 40; i++) sum += data[i];
    return Math.min(1, sum / 40 / 160);
  }

  async close() {
    this.flush();
    try {
      await this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
  }
}

/** Radial-free bar visualiser: blue when the persona talks, silver when the caller talks, gentle wave when idle. */
export class Visualizer {
  constructor(canvas, { frequency, micLevel }) {
    this.canvas = canvas;
    this.ctx2d = canvas.getContext("2d");
    this.frequency = frequency;
    this.micLevel = micLevel;
    this.bars = 43;
    this.values = new Array(this.bars).fill(0.06);
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  draw() {
    const canvas = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const g = this.ctx2d;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, height);
    const freq = this.frequency();
    const mic = this.micLevel();
    const t = performance.now() / 1000;
    const mid = (this.bars - 1) / 2;
    const gap = 5;
    const barWidth = (width - gap * (this.bars - 1)) / this.bars;
    for (let i = 0; i < this.bars; i++) {
      const dist = Math.abs(i - mid) / mid;
      const idle = 0.07 + 0.045 * Math.sin(t * 2.2 + i * 0.55);
      const persona = freq ? Math.min(1, ((freq[Math.floor(dist * 22)] + freq[Math.min(63, Math.floor(dist * 22) + 1)]) / 2 / 255) * 1.9) * (1.1 - dist * 0.35) : 0;
      const caller = mic * (0.45 + 0.55 * Math.abs(Math.sin(t * 9 + i * 0.9))) * (1.1 - dist * 0.5);
      const target = Math.max(idle, persona, caller);
      this.values[i] += (target - this.values[i]) * 0.38;
      const barHeight = Math.max(4, this.values[i] * height * 0.92);
      const x = i * (barWidth + gap);
      const y = (height - barHeight) / 2;
      const gradient = g.createLinearGradient(0, y, 0, y + barHeight);
      if (persona >= caller && persona > idle) {
        gradient.addColorStop(0, "#8ec5ff");
        gradient.addColorStop(1, "#2563eb");
      } else if (caller > idle) {
        gradient.addColorStop(0, "#e3ebfa");
        gradient.addColorStop(1, "#8fa3c8");
      } else {
        gradient.addColorStop(0, "rgba(255,255,255,.35)");
        gradient.addColorStop(1, "rgba(255,255,255,.12)");
      }
      g.fillStyle = gradient;
      g.beginPath();
      g.roundRect(x, y, barWidth, barHeight, barWidth / 2);
      g.fill();
    }
  }
}
