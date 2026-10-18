// The home page's story, told in steps. One scroll (wheel notch, swipe, arrow key or a click on the chapter list) plays exactly one scene:
// the 3D camera glides to the next subject, the old copy leaves, the new copy arrives line by line. After the last scene the page carries on as normal.
// If WebGL2 is missing, motion is reduced or the 3D bundle fails to load, onFail() lets the page fall back to the classic hero.

import { BRAND } from "../brand.js";
import { h, icon, reducedMotion } from "../util.js";

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const seg = (a, b, v) => clamp((v - a) / (b - a));
const pad = (n) => String(n).padStart(2, "0");
const link = (href, cls, ...children) => h("a", { href, class: cls }, ...children);

/** Splits text into masked words made of letters so a headline can rise in letter by letter. Elements inside keep their classes. */
function kinetic(root) {
  let index = 0;
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        for (const part of child.textContent.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) frag.append(" ");
          else frag.append(h("span", { class: "jw", "aria-hidden": "true" }, [...part].map((c) => h("span", { class: "ch", style: { "--i": index++ } }, c))));
        }
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE) walk(child);
    }
  };
  root.setAttribute("aria-label", root.textContent.replace(/\s+/g, " ").trim());
  walk(root);
  return root;
}

/** Wraps a kicker's text so it types in. */
function typed(text) {
  return h("span", { class: "tp", style: { "--n": [...text].length } }, text);
}

export function canUseCity() {
  if (reducedMotion()) return false;
  if (new URLSearchParams(location.search).has("classic")) return false;
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

// Six scenes: the opening, then one full scene for each step of the loop, then the close.
const SCENES = [
  { label: "Start", spec: ["Standing by", true] },
  {
    label: "The call",
    kicker: "The call comes in",
    title: "A scammer calls. Ramesh stalls.",
    line: "Stallwart answers as Ramesh, a fictional 68-year-old. He keeps the scammer talking and quietly writes down the UPI ID they want paid.",
    href: "#/call",
    cta: "Try a call",
    spec: ["Live \u00b7 decoy on the line", false],
  },
  {
    label: "The bank",
    kicker: "The bank is warned",
    title: "The bank freezes it.",
    line: "A confirmed account is routed by its IFSC code or UPI handle to the right fraud inbox. The bank can Monitor, Freeze or Dismiss.",
    note: "Proxy banks in this prototype",
    href: "#/banks",
    cta: "See bank inboxes",
    spec: ["Mule account flagged", false],
  },
  {
    label: "The strain",
    kicker: "The strain",
    title: "The scam becomes a strain.",
    line: "The call is distilled into a recipe card: the steps, the payment trick, three warning signs. Every name, number and UPI ID is removed.",
    href: "#/strains",
    cta: "See strains",
    spec: ["Strain redacted", false],
  },
  {
    label: "The vaccine",
    kicker: "The vaccine",
    title: "A family gets vaccinated.",
    line: "A parent takes a consented practice call that plays the same scam. The coach stops it before any detail is shared, and the whole circle learns the trick.",
    href: "#/drills",
    cta: "Family drills",
    spec: ["Protection spreading", false],
  },
  {
    label: "Overview",
    kicker: "Stallwart in one view",
    title: "Turn every scam call into a dead end.",
    line: "Stallwart answers the call, stalls the scammer, warns the bank and teaches the family. Try it yourself in under a minute.",
    finale: true,
    spec: ["All clear", true],
  },
];
const LAST = SCENES.length - 1;

// Labels pinned to things in the scene: where, when they show (by story progress), and what they say.
const TAGS = [
  { id: "orb", tone: "blue", title: "Stallwart AI", when: (p) => 1 - seg(0.08, 0.14, p), sub: () => "Standing by for the next call" },
  { id: "scam", tone: "red", title: "Scammer", when: (p) => seg(0.15, 0.18, p) * (1 - seg(0.45, 0.5, p)), sub: (p) => (p < 0.24 ? "Dialling a stranger\u2026" : "Call connected") },
  { id: "orb", tone: "blue", title: "Ramesh (AI)", when: (p) => seg(0.17, 0.2, p) * (1 - seg(0.52, 0.56, p)), sub: (p, idle) => (p < 0.27 ? "Phone ringing\u2026" : `Scammer's time wasted ${clock(14 + seg(0.28, 0.41, p) * 26 + idle)}`) },
  { id: "bank_tag", tone: "red", title: "Mule account caught", when: (p) => seg(0.5, 0.52, p) * (1 - seg(0.535, 0.55, p)), sub: () => "SBIN0001234 \u2192 State Bank of India" },
  { id: "bank_tag", tone: "ice", title: "Account frozen", when: (p) => seg(0.552, 0.572, p) * (1 - seg(0.66, 0.7, p)), sub: () => "Bank fraud team notified" },
  { id: "card", tone: "blue", title: "Strain captured", when: (p) => seg(0.62, 0.65, p) * (1 - seg(0.72, 0.75, p)), sub: () => "Identifiers removed" },
  { id: "families", tone: "ice", title: "Family drills", when: (p) => seg(0.82, 0.85, p) * (1 - seg(0.97, 1, p)), sub: () => "Practice call, with consent" },
  // the last scene names every station: Stallwart AI at the heart, the catching side on its left, the protecting side on its right
  { id: "s_phone", tone: "red", title: "Scam call", compact: true, when: (p) => seg(0.97, 1, p) },
  { id: "s_bank", tone: "ice", title: "Bank alert", compact: true, when: (p) => seg(0.97, 1, p) },
  { id: "s_orb", tone: "blue", title: "Stallwart AI", compact: true, hub: true, when: (p) => seg(0.97, 1, p) },
  { id: "s_card", tone: "ice", title: "Scam strain", compact: true, when: (p) => seg(0.97, 1, p) },
  { id: "s_families", tone: "ice", title: "Family drills", compact: true, when: (p) => seg(0.97, 1, p) },
];

function clock(seconds) {
  const s = Math.round(seconds);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function introDone() {
  return new Promise((resolve) => {
    const check = () => (document.body.classList.contains("intro-active") ? requestAnimationFrame(check) : resolve());
    check();
  });
}

export function createJourney({ onFail } = {}) {
  const lang = "\u0939\u093f\u0928\u094d\u0926\u0940";
  const scenes = SCENES.map((c, i) => {
    if (i === 0) {
      return h(
        "article",
        { class: "sj-scene sj-hero", "data-i": 0 },
        h("span", { class: "eyebrow-pill sj-pill" }, icon("zap"), "AI Builder Cup 2026 \u00b7 built on Google Cloud"),
        kinetic(h("h1", { class: "sj-title" }, "Let the scammer talk to ", h("span", { class: "grad-text" }, "someone who is never going to pay."))),
        h(
          "div",
          { class: "sj-foot" },
          h("p", { class: "sj-line" }, `${BRAND.name} is an AI decoy that answers scam calls in English and ${lang}, wastes the scammer's time, catches the UPI IDs they ask you to pay and alerts the bank so it can freeze them.`),
          h("div", { class: "sj-cta cta-row" }, link("#/call", "btn primary lg bracket", icon("phone"), "Take a live call"), link("#/replay", "btn lg", icon("play"), "Watch a replay")),
          h("ul", { class: "sj-trust trust" }, ["Free, no sign-up", "Private recordings", "Fictional persona and data"].map((t) => h("li", {}, icon("check"), t))),
        ),
      );
    }
    return h(
      "article",
      { class: `sj-scene ${c.finale ? "sj-finale" : ""}`, "data-i": i, "aria-hidden": "true" },
      h("span", { class: "sj-kicker" }, typed(c.kicker)),
      kinetic(h("h2", { class: "sj-title" }, c.title)),
      h(
        "div",
        { class: "sj-foot" },
        h("p", { class: "sj-line" }, c.line),
        c.note ? h("span", { class: "sj-note" }, icon("lock"), c.note) : null,
        c.finale
          ? h("div", { class: "sj-cta cta-row" }, link("#/call", "btn primary lg bracket", icon("phone"), "Take a live call"), link("#/replay", "btn lg", icon("play"), "Watch a replay"))
          : h("div", { class: "sj-cta" }, link(c.href, "btn ghost", c.cta, icon("arrow"))),
      ),
    );
  });
  scenes[0].setAttribute("aria-hidden", "true");

  const navButtons = SCENES.map((s, i) =>
    h("button", { class: "sj-nb", type: "button", "aria-label": `Scene ${i + 1} of ${SCENES.length}: ${s.label}`, onClick: () => jump(i) }, h("span", { class: "sj-nb-t" }, h("em", {}, pad(i + 1)), s.label), h("i", { class: "sj-nb-bar" })),
  );
  const tags = TAGS.map((t) => {
    const small = t.compact ? null : h("small", {}, "");
    const tagEl = h("div", { class: `hud-tag tone-${t.tone}${t.compact ? " compact" : ""}${t.hub ? " hub" : ""}`, "aria-hidden": "true" }, h("i", { class: "ht-dot" }), h("div", {}, h("b", {}, t.title), small));
    return { ...t, el: tagEl, small, last: "" };
  });

  const stage = h("div", { class: "sj-stage" }, h("div", { class: "stage-skeleton" }, h("i"), h("span", {}, "Building the stage\u2026")));
  const rec = h("span", { class: "rec idle" });
  const recText = h("b", {}, SCENES[0].spec[0]);
  const rollCol = h("span", { class: "sj-roll-in" }, SCENES.map((_, i) => h("b", {}, pad(i + 1))));
  const count = h("div", { class: "sj-count", "aria-hidden": "true" }, h("span", { class: "sj-roll" }, rollCol), h("span", { class: "sj-of" }, `/ ${pad(SCENES.length)}`));
  const status = h("div", { class: "sj-status", "aria-hidden": "true" }, rec, recText);
  const hint = h("div", { class: "sj-hint", "aria-hidden": "true" }, h("i"), h("span", { class: "sj-hint-a" }, "Scroll to continue"), h("span", { class: "sj-hint-b" }, "Scroll for more"));
  const hud = h("div", { class: "sj-hud", "aria-hidden": "true" }, tags.map((t) => t.el));
  const el = h(
    "section",
    { class: "journey", "data-step": "0", "aria-label": "How Stallwart works, from the first ring to a protected family" },
    h("div", { class: "sj-visual" }, stage, hud),
    h("div", { class: "sj-shade", "aria-hidden": "true" }),
    h("div", { class: "sj-scenes" }, scenes),
    count,
    status,
    h("nav", { class: "sj-nav", "aria-label": "Story scenes" }, navButtons),
    hint,
  );

  let city = null;
  let dead = false;
  let ready = false; // the intro is gone and the first scene is in
  let locked = true; // true while a scene is changing
  // ?scene=3 opens the story at that scene (handy for links and screenshots)
  const deepLink = Number(new URLSearchParams(location.search).get("scene"));
  let step = Number.isInteger(deepLink) && deepLink > 0 && deepLink <= LAST ? deepLink : 0;
  let idleSince = 0;
  const timers = new Set();
  const later = (fn, ms) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };

  const atTop = () => window.scrollY < 6;
  const listening = () => !dead && ready && atTop() && !document.body.classList.contains("intro-active");

  function show(i, on) {
    scenes[i].classList.toggle("is-active", on);
    scenes[i].setAttribute("aria-hidden", on ? "false" : "true");
  }

  function setChrome(i) {
    el.dataset.step = String(i);
    el.classList.toggle("is-last", i === LAST);
    el.style.setProperty("--s", String(i));
    el.style.setProperty("--p", (i / LAST).toFixed(3));
    navButtons.forEach((b, k) => {
      b.classList.toggle("active", k === i);
      b.classList.toggle("done", k < i);
      b.setAttribute("aria-current", k === i ? "step" : "false");
    });
  }

  /** Plays one scene change: the old copy leaves, the camera glides, the new copy arrives line by line. */
  function goTo(i) {
    if (locked || i === step || i < 0 || i > LAST) return;
    locked = true;
    const prev = step;
    step = i;
    setChrome(i);
    scenes[prev].classList.remove("is-active");
    scenes[prev].classList.add("is-out");
    scenes[prev].setAttribute("aria-hidden", "true");
    later(() => scenes[prev].classList.remove("is-out"), 900);
    const seconds = city ? city.go(i) : 1.9;
    const total = Math.max(seconds, 1.7) * 1000;
    later(() => {
      show(i, true);
      recText.textContent = SCENES[i].spec[0];
      rec.classList.toggle("idle", SCENES[i].spec[1]);
    }, 760);
    later(() => (locked = false), total - 200);
    idleSince = 0;
    later(() => (idleSince = performance.now()), total);
  }

  function jump(i) {
    if (!ready || locked) return;
    if (!atTop()) window.scrollTo({ top: 0, behavior: "smooth" });
    goTo(i);
  }

  /** Past the last scene the page scrolls on to the rest of the home page. */
  function release() {
    locked = true;
    window.scrollTo({ top: el.offsetHeight - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-h")) || 66), behavior: "smooth" });
    later(() => (locked = false), 1100);
  }

  function advance(dir) {
    if (locked) return;
    const next = step + dir;
    if (next > LAST) release();
    else if (next >= 0) goTo(next);
  }

  // A real new flick versus the long inertial tail of the last one: a quiet gap, or a stronger push, starts a new gesture.
  let lastWheel = 0;
  let lastMag = 0;
  function onWheel(e) {
    const now = performance.now();
    const mag = Math.abs(e.deltaY);
    const fresh = now - lastWheel > 70 || mag > lastMag * 1.2 + 2;
    lastWheel = now;
    lastMag = mag;
    if (e.ctrlKey || mag < Math.abs(e.deltaX) || mag === 0 || !listening()) return;
    const dir = e.deltaY > 0 ? 1 : -1;
    if (dir < 0 && step === 0) return; // nothing above the first scene: let the page have it
    e.preventDefault();
    if (!locked && fresh && mag >= 4) advance(dir);
  }

  let touchY = null;
  const onTouchStart = (e) => {
    touchY = e.touches.length === 1 ? e.touches[0].clientY : null;
  };
  const onTouchEnd = (e) => {
    if (touchY === null) return;
    const dy = touchY - e.changedTouches[0].clientY;
    touchY = null;
    if (!listening() || Math.abs(dy) < 44) return;
    if (dy > 0 && step === LAST) return; // the page scrolls on by itself
    if (dy < 0 && step === 0) return;
    advance(dy > 0 ? 1 : -1);
  };

  function onKey(e) {
    if (!listening() || e.altKey || e.ctrlKey || e.metaKey) return;
    const target = e.target instanceof Element ? e.target : document.body;
    if (target.closest("input, textarea, select, [contenteditable]")) return;
    let dir = 0;
    if (e.key === "ArrowDown" || e.key === "PageDown") dir = 1;
    else if (e.key === "ArrowUp" || e.key === "PageUp") dir = -1;
    else if (e.key === " " && !target.closest("button, a")) dir = e.shiftKey ? -1 : 1;
    if (!dir || (dir < 0 && step === 0)) return;
    e.preventDefault();
    advance(dir);
  }

  function onFrame({ p, t, project }) {
    const idle = idleSince ? (performance.now() - idleSince) / 1000 : 0;
    const w = stage.clientWidth;
    const hgt = stage.clientHeight;
    // in the last scene the Stallwart AI card must sit below the buttons, never on them
    let ctaBottom = 0;
    if (step === LAST) {
      const cta = scenes[LAST].querySelector(".sj-cta");
      if (cta) ctaBottom = cta.getBoundingClientRect().bottom - hud.getBoundingClientRect().top;
    }
    for (const tag of tags) {
      const k = tag.when(p);
      const at = k > 0.01 ? project(tag.id) : null;
      const lift = tag.compact ? (tag.hub ? 100 : 66) : 96;
      const showTag = !!at && at.visible && at.x > 60 && at.x < w - 60 && at.y - lift > 84 && at.y < hgt - 90;
      tag.el.classList.toggle("on", showTag && k > 0.02);
      if (!showTag) continue;
      const y = tag.hub && ctaBottom ? Math.max(at.y, ctaBottom + 20 + 96) : at.y;
      tag.el.style.opacity = String(clamp(k * 1.2));
      tag.el.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(y)}px)`;
      if (!tag.small) continue;
      const text = tag.sub(p, idle);
      if (text !== tag.last) {
        tag.last = text;
        tag.small.textContent = text;
      }
    }
  }

  async function boot() {
    try {
      const mod = await import("../vendor/city.js");
      if (dead) return;
      city = mod.createCity({ host: stage, onFrame });
      city.snap(step);
      el.classList.add("is-3d");
      await introDone();
      if (dead) return;
      later(() => {
        city?.arrive();
        el.classList.add("is-live");
        show(step, true);
        recText.textContent = SCENES[step].spec[0];
        rec.classList.toggle("idle", SCENES[step].spec[1]);
        ready = true;
        later(() => (locked = false), 1500);
      }, 350);
    } catch (err) {
      console.error("3D scene unavailable, using the classic hero", err);
      if (!dead) onFail?.();
    }
  }

  setChrome(step);
  window.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchend", onTouchEnd, { passive: true });
  window.addEventListener("keydown", onKey);
  boot();

  return {
    el,
    /** The page calls this while it scrolls over the scene, so nothing is drawn behind it. */
    setPaused(flag) {
      city?.pause(flag);
    },
    destroy() {
      dead = true;
      timers.forEach(clearTimeout);
      timers.clear();
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("keydown", onKey);
      city?.dispose();
    },
  };
}
