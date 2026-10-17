// Opening sequence: an unknown number rings while the page really loads, the decoy picks up, a voice ring wakes and the name resolves.
// Plays once per browser session on the landing page. Enter, Escape, a click anywhere or Skip ends it.

import { BRAND } from "./brand.js";
import { h, logo, reducedMotion } from "./util.js";
import { canUseCity } from "./views/journey.js";

const SEEN_KEY = "intro-seen";
const MIN_RING = 2.1; // seconds the phone rings at the very least
const AUTO_MS = 7000; // after the name resolves, continue on its own if nobody clicks

export function shouldPlayIntro() {
  const flag = new URLSearchParams(location.search).get("intro");
  if (flag === "1") return true;
  if (flag === "0" || reducedMotion()) return false;
  const route = location.hash.replace(/\/+$/, "");
  if (route && route !== "#") return false;
  try {
    return !sessionStorage.getItem(SEEN_KEY);
  } catch {
    return true;
  }
}

const STATUS = ["Fetching assets", "Warming the decoy", "Tuning the line", "Line ready"];
const pad3 = (n) => String(Math.round(n)).padStart(3, "0");
const ease = (k) => 1 - Math.pow(1 - Math.max(0, Math.min(1, k)), 3);

export function playIntro({ onReveal } = {}) {
  return new Promise((resolve) => {
    const canvas = h("canvas", { class: "ix-canvas", "aria-hidden": "true" });
    const chipText = h("span", { class: "ic-status" }, "Incoming call \u00B7 Unknown number");
    const chipFlag = h("span", { class: "ic-flag" }, "Possible scam");
    const chip = h("div", { class: "ix-chip" }, h("span", { class: "ic-dot" }), chipText, chipFlag);
    const mark = h("div", { class: "ix-mark", "aria-hidden": "true" }, logo());
    const letters = [...BRAND.name].map((ch, i) => h("span", { class: "il", "aria-hidden": "true", style: { "--i": i } }, ch === " " ? "\u00a0" : ch));
    const name = h("h1", { class: "ix-name", "aria-label": BRAND.name }, letters);
    const tag = h("p", { class: "ix-tag" }, BRAND.introLine);
    const enterBtn = h("button", { class: "ix-btn primary", type: "button" }, h("span", {}, "Enter"));
    const auto = h("i", { class: "ix-auto" });
    const actions = h("div", { class: "ix-actions", "aria-hidden": "true" }, enterBtn, auto);
    const label = h("span", { class: "ix-label" }, STATUS[0]);
    const count = h("b", { class: "ix-count" }, "000");
    const fill = h("i", { class: "ix-fill" });
    const skip = h("button", { class: "ix-skip", type: "button" }, "Skip intro \u2198");
    const root = h(
      "div",
      { class: "ix is-loading", role: "dialog", "aria-label": `${BRAND.name} intro` },
      canvas,
      h("header", { class: "ix-top" }, h("span", {}, `${BRAND.name} \u2014 AI decoy`), h("span", {}, "AI Builder Cup 2026")),
      h("div", { class: "ix-core" }, chip, mark, h("div", { class: "ix-text" }, name, tag, actions)),
      h("footer", { class: "ix-meter" }, label, count, skip),
      h("div", { class: "ix-line", "aria-hidden": "true" }, fill),
    );

    document.body.classList.add("intro-active");
    document.body.append(root);
    skip.focus({ preventScroll: true });

    // the real work behind the counter: fonts, the 3D bundle, and a minimum ring time
    const t0 = performance.now();
    const tasks = { fonts: false, scene: !canUseCity(), time: false };
    document.fonts?.ready?.then(() => (tasks.fonts = true), () => (tasks.fonts = true));
    if (!tasks.scene) {
      import("./vendor/city.js").then(
        () => (tasks.scene = true),
        () => (tasks.scene = true),
      );
    }
    setTimeout(() => (tasks.time = true), MIN_RING * 1000);

    const g = canvas.getContext("2d");
    const stars = Array.from({ length: 84 }, (_, i) => ({ x: Math.random(), y: Math.random(), r: 0.4 + Math.random() * 1.1, v: 0.004 + Math.random() * 0.014, ph: Math.random() * 6.28, hue: i % 9 === 0 ? 1 : 0 }));
    let dpr = 1;
    let width = 0;
    let height = 0;
    let raf = 0;
    let finished = false;
    let picked = false;
    let tPick = Infinity;
    let shown = 0;
    let loaded = false;
    let lastNow = t0;
    const timers = [];

    // everything in the opening is sized from one scale, so the mark stays large on a tall screen and still fits on a short one
    let sc = 1;
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      sc = Math.max(0.5, Math.min(1, (height / 2 - 280) / 205, width / 700));
      root.style.setProperty('--sc', sc.toFixed(3));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }

    function draw(now) {
      const t = (now - t0) / 1000;
      const dt = Math.min(0.05, (now - lastNow) / 1000);
      lastNow = now;

      // loading: the counter eases toward what is really done
      const real = (Number(tasks.fonts) + Number(tasks.scene) + Number(tasks.time)) / 3;
      const target = real >= 1 ? 100 : Math.min(94, 100 * (0.1 + 0.9 * Math.min(real + 0.15, t / MIN_RING)));
      shown += (target - shown) * 0.07;
      if (target >= 100 && shown > 99.3) shown = 100;
      count.textContent = pad3(shown);
      fill.style.transform = `scaleX(${(shown / 100).toFixed(3)})`;
      if (!picked) label.textContent = STATUS[Math.min(3, Math.floor(shown / 34))];
      if (shown >= 100 && !loaded) loaded = true;
      if (loaded && !picked && t >= MIN_RING) pickUp(t);

      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height / 2;
      const scale = sc;

      // a slow field of dust behind everything
      for (const s of stars) {
        s.y -= s.v * dt;
        if (s.y < -0.02) s.y = 1.02;
        const tw = 0.45 + 0.55 * Math.sin(t * 0.9 + s.ph);
        g.fillStyle = s.hue ? `rgba(125,211,252,${0.5 * tw})` : `rgba(190,208,255,${0.38 * tw})`;
        g.beginPath();
        g.arc(s.x * width, s.y * height, s.r, 0, Math.PI * 2);
        g.fill();
      }

      // ringing: soft rings leave the phone, one after another, until it is answered
      if (!picked || t - tPick < 0.5) {
        const fade = picked ? 1 - (t - tPick) / 0.5 : 1;
        for (let k = 0; k < 3; k++) {
          const life = (((t * 0.62 - k * 0.34 + 3) % 1) + 1) % 1;
          if (t * 0.62 - k * 0.34 < 0) continue;
          g.strokeStyle = k === 1 ? `rgba(125,211,252,${(1 - life) * 0.38 * fade})` : `rgba(121,169,255,${(1 - life) * 0.5 * fade})`;
          g.lineWidth = 1.4;
          g.beginPath();
          g.arc(cx, cy, (66 + life * 330) * scale, 0, Math.PI * 2);
          g.stroke();
        }
      }

      // the loading ring around the mark: it closes when everything is ready
      const arcR = 86 * scale;
      const prog = shown / 100;
      g.lineWidth = 1.4;
      g.strokeStyle = "rgba(255,255,255,0.1)";
      g.beginPath();
      g.arc(cx, cy, arcR, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = "rgba(125,211,252,0.95)";
      g.lineWidth = 2.2;
      g.beginPath();
      g.arc(cx, cy, arcR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog);
      g.stroke();
      if (prog < 1) {
        const a = -Math.PI / 2 + Math.PI * 2 * prog;
        g.fillStyle = "#cfe6ff";
        g.beginPath();
        g.arc(cx + Math.cos(a) * arcR, cy + Math.sin(a) * arcR, 3, 0, Math.PI * 2);
        g.fill();
      }

      // pick-up: a bright burst
      const burst = (t - tPick) / 0.95;
      if (burst > 0 && burst < 1) {
        g.strokeStyle = `rgba(255,255,255,${(1 - burst) * 0.75})`;
        g.lineWidth = 3 * (1 - burst) + 0.5;
        g.beginPath();
        g.arc(cx, cy, (78 + ease(burst) * 560) * scale, 0, Math.PI * 2);
        g.stroke();
        const flash = g.createRadialGradient(cx, cy, 0, cx, cy, 380 * scale);
        flash.addColorStop(0, `rgba(140,190,255,${(1 - burst) * 0.34})`);
        flash.addColorStop(1, "rgba(140,190,255,0)");
        g.fillStyle = flash;
        g.fillRect(0, 0, width, height);
      }

      // the voice ring and its ticks
      const since = t - tPick;
      if (since > 0) {
        const env = ease(since / 0.8);
        const base = (102 + 26 * ease(since / 0.9) + Math.sin(t * 5) * 1.8) * scale;
        const points = 140;
        const gradient = g.createLinearGradient(cx - base, cy - base, cx + base, cy + base);
        gradient.addColorStop(0, "#9cc4ff");
        gradient.addColorStop(0.55, "#79a9ff");
        gradient.addColorStop(1, "#eef4ff");
        for (const [mult, alpha, lw] of [[1, 1, 2.4], [1.18, 0.28, 1.2]]) {
          g.beginPath();
          for (let i = 0; i <= points; i++) {
            const a = (i / points) * Math.PI * 2 + t * 0.35;
            const wobble = (0.5 + 0.5 * Math.sin(i * 0.41 + t * 5.2)) * (0.6 + 0.4 * Math.sin(i * 0.13 - t * 3.3));
            const r = (base + wobble * 32 * env * scale) * mult;
            if (i === 0) g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
            else g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
          }
          g.closePath();
          g.globalAlpha = alpha * Math.min(1, env * 1.4);
          g.strokeStyle = gradient;
          g.lineWidth = lw;
          g.shadowColor = "rgba(121,169,255,0.85)";
          g.shadowBlur = 16;
          g.stroke();
        }
        g.globalAlpha = 1;
        g.shadowBlur = 0;
        const ticks = 72;
        for (let i = 0; i < ticks; i++) {
          const a = (i / ticks) * Math.PI * 2 - t * 0.18;
          const wave = 0.5 + 0.5 * Math.sin(i * 0.9 + t * 4.4) * Math.sin(i * 0.27 - t * 1.9);
          const r0 = base + 44 * scale;
          const len = (4 + wave * 20 * env) * scale;
          g.strokeStyle = i % 9 === 0 ? `rgba(125,211,252,${0.85 * env})` : `rgba(226,234,255,${0.5 * env})`;
          g.lineWidth = 1.3;
          g.beginPath();
          g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
          g.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len));
          g.stroke();
        }
        for (let k = 0; k < 3; k++) {
          const a = t * (0.9 + k * 0.25) + (k * Math.PI * 2) / 3;
          const r = (base + 80 * scale) * (1 + k * 0.05);
          g.fillStyle = ["#9cc4ff", "#eef4ff", "#38bdf8"][k];
          g.globalAlpha = 0.85 * env;
          g.beginPath();
          g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.4, 0, Math.PI * 2);
          g.fill();
        }
        g.globalAlpha = 1;
      }
      raf = requestAnimationFrame(draw);
    }

    function at(seconds, fn) {
      timers.push(setTimeout(fn, seconds * 1000));
    }

    // everything is ready: the decoy answers, the name resolves, then the choice appears
    function pickUp(t) {
      picked = true;
      tPick = t;
      root.classList.remove("is-loading");
      root.classList.add("p-pick");
      chipText.textContent = "Decoy picked up";
      chipFlag.textContent = "Recording";
      label.textContent = STATUS[3];
      at(0.65, () => root.classList.add("p-name"));
      at(1.75, () => {
        root.classList.add("is-ready");
        actions.removeAttribute("aria-hidden");
        enterBtn.focus({ preventScroll: true });
        timers.push(setTimeout(() => enter(), AUTO_MS));
      });
    }

    function enter() {
      if (finished) return;
      finished = true;
      timers.forEach(clearTimeout);
      window.removeEventListener("keydown", onKey);
      root.classList.add("is-leaving");
      try {
        sessionStorage.setItem(SEEN_KEY, "1");
      } catch {
        /* private mode: the intro may play again, which is harmless */
      }
      count.textContent = "100";
      root.classList.add("p-out");
      onReveal?.();
      setTimeout(() => document.body.classList.remove("intro-active"), 520);
      window.removeEventListener("resize", resize);
      setTimeout(() => {
        cancelAnimationFrame(raf);
        root.remove();
        resolve();
      }, 1300);
    }

    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        enter();
      } else if (event.key === "Enter" || event.key === " ") {
        if (event.target instanceof Element && event.target.closest("button")) return;
        event.preventDefault();
        enter();
      }
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("keydown", onKey);
    enterBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      enter();
    });
    skip.addEventListener("click", (e) => {
      e.stopPropagation();
      enter();
    });
    root.addEventListener("pointerdown", (e) => {
      if (e.target instanceof Element && e.target.closest("button")) return;
      enter();
    });
    raf = requestAnimationFrame(draw);
    root.classList.add("p-ring");
  });
}
