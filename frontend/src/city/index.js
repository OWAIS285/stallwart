// "The loop": five stations on a ring of dark floor, each facing the middle. The page plays the story in steps: go(i) glides to scene i,
// and in the last scene the ring unfolds into one wide arc so all five stations stand side by side, facing you.
// createCity() returns a controller; the page calls go(step) and reads back screen anchors for its labels.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { createArc } from "./arcs.js";
import { createBank, createCard, createFamilies, createOrb, createPhone } from "./objects.js";
import { createFocus } from "./focus.js";
import { clamp01, easeInOut, easeOut, lerp, seg, sstep } from "./math.js";
import { ROUTE_END, ROUTE_FULL, createPlinth, createStage } from "./stage.js";
import { AIR, ANGLE, COLORS, OVERVIEW, OVERVIEW_SCALE, STATION } from "./world.js";

const D2R = Math.PI / 180;

// Story progress where each scene is fully resolved (everything that scene shows has finished playing).
// 0 Stallwart standing by · 1 the call comes in and Ramesh answers · 2 the bank · 3 the strain · 4 the vaccine · 5 the whole journey
const REST = [0.04, 0.41, 0.58, 0.71, 0.93, 1];

const S = STATION;
const between = (a, b) => ({ x: (S[a].x + S[b].x) / 2, z: (S[a].z + S[b].z) / 2 });
const callMid = between("phone", "orb");

// Where the camera rests in each scene: [yaw deg, pitch deg, distance, targetX, targetY, targetZ, shift].
// The camera stands inside the ring, looking out at each station front on (yaw = the station's angle + 180).
// Shift slides the subject toward the right-hand side, clear of the copy column; the last view is straight on, low and wide, with nothing shifted.
const IN = 180;
const SHIFT = 0.17;
const VIEWS = [
  [ANGLE.orb + IN - 10, 11, 42, S.orb.x, 4.2, S.orb.z, SHIFT],
  [(ANGLE.phone + ANGLE.orb) / 2 + IN, 12, 82, callMid.x, 6.4, callMid.z, SHIFT],
  [ANGLE.bank + IN - 10, 11, 54, S.bank.x, 7.6, S.bank.z, SHIFT],
  [ANGLE.card + IN - 12, 10, 48, S.card.x, 5.2, S.card.z, SHIFT],
  [ANGLE.families + IN - 14, 14, 62, S.families.x, 3.8, S.families.z, SHIFT],
  [360, 11, 158, 0, 15, 4, 0],
];

const bump = (a, b, c, d, p) => sstep(a, b, p) * (1 - sstep(c, d, p));
// how high above each station its label hangs in the last scene
const PIN_Y = { phone: 11.4, orb: 10.2, bank: 8.6, card: 10.6, families: 9.4 };

export function createCity({ host, onFrame } = {}) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", alpha: false });
  renderer.setClearColor(COLORS.bg, 1);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.className = "city-canvas";
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.bg);
  scene.fog = new THREE.Fog(COLORS.bg, 110, 330);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.32;
  const camera = new THREE.PerspectiveCamera(26, 1, 1, 800);

  scene.add(new THREE.AmbientLight(0x2a3d78, 0.55));
  const key = new THREE.DirectionalLight(0xfff0de, 2.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -26, right: 26, top: 22, bottom: -22, near: 5, far: 120 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.05;
  key.shadow.radius = 4;
  const rim = new THREE.DirectionalLight(0x4f7dff, 2.4);
  scene.add(key, key.target, rim, rim.target);

  const stage = createStage();
  const phone = createPhone();
  const orb = createOrb();
  const bank = createBank();
  const card = createCard();
  const families = createFamilies();
  const plinths = {
    phone: createPlinth(S.phone, COLORS.coral, 5.6),
    orb: createPlinth(S.orb, COLORS.cobalt, 5.6),
    bank: createPlinth(S.bank, COLORS.cobalt, 7.6),
    card: createPlinth(S.card, COLORS.sky, 5.6),
    families: createPlinth(S.families, COLORS.safe, 9.2),
  };
  const world = new THREE.Group();
  const stationGroups = [["phone", phone.group], ["orb", orb.group], ["bank", bank.group], ["card", card.group], ["families", families.group]];
  world.add(stage.group, ...Object.values(plinths).map((p) => p.group), phone.group, orb.group, bank.group, card.group, families.group);
  scene.add(world);

  const arcCall = createArc({ from: AIR.phoneTop, to: AIR.orb, lift: 9, color: COLORS.coral, radius: 0.1, packets: 7, bead: 0.28, flow: 6 });
  const arcBank = createArc({ from: AIR.orb, to: AIR.bankMarker, lift: 10, color: COLORS.sky, radius: 0.09, packets: 7, bead: 0.26, flow: 5 });
  const arcStrain = createArc({ from: AIR.bankMarker, to: AIR.card, lift: 8, color: 0xdfe8ff, radius: 0.06, packets: 4, bead: 0.2, flow: 4 });
  const arcFamily = createArc({ from: AIR.card, to: AIR.familyHub, lift: 11, color: COLORS.safe, radius: 0.1, packets: 8, bead: 0.28, flow: 5 });
  world.add(arcCall.group, arcBank.group, arcStrain.group, arcFamily.group);

  // the protection wave: a ring that races out along the floor from the families
  const wave = new THREE.Mesh(new THREE.RingGeometry(0.992, 1, 256), new THREE.MeshBasicMaterial({ color: COLORS.safe, toneMapped: false, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  wave.rotation.x = -Math.PI / 2;
  wave.position.set(S.families.x, 0.09, S.families.z);
  world.add(wave);

  const camVals = [0, 0, 0, 0, 0, 0, 0];
  let camYaw = 0;
  let spread = 0;
  const lookAt = new THREE.Vector3();
  const right = new THREE.Vector3();
  const toCam = new THREE.Vector3();
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  const anchors = {
    scam: phone.anchor,
    orb: orb.anchor,
    bank: bank.anchor,
    card: card.anchor,
    families: families.anchor,
    // fixed points above each station, for the labels in the last scene (kept in step with the stations as they move)
    s_phone: new THREE.Vector3(S.phone.x, PIN_Y.phone, S.phone.z),
    s_orb: new THREE.Vector3(S.orb.x, PIN_Y.orb, S.orb.z),
    s_bank: new THREE.Vector3(S.bank.x, PIN_Y.bank, S.bank.z),
    s_card: new THREE.Vector3(S.card.x, PIN_Y.card, S.card.z),
    s_families: new THREE.Vector3(S.families.x, PIN_Y.families, S.families.z),
  };
  let fx = null;
  try {
    fx = createFocus(renderer);
  } catch (err) {
    console.warn("Depth of field unavailable, drawing the scene directly", err);
  }
  const ndc = new THREE.Vector3();
  const grey = new THREE.Color(0x9097ad);
  const tmpColor = new THREE.Color();

  let quality = "high";
  let width = 1;
  let height = 1;
  let dpr = 1;
  let fit = 1;
  let step = 0;
  let from = 0;
  let travel = 1;
  let travelFor = 1;
  let progress = REST[0];
  let arriveAt = null;
  let visible = true;
  let running = true;
  let raf = 0;
  let last = performance.now();
  let clock = 0;
  const frames = { n: 0, sum: 0 };

  function applyQuality() {
    const high = quality === "high";
    dpr = Math.min(window.devicePixelRatio || 1, high ? 2 : 1.25);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    const size = high ? 2048 : 1024;
    if (key.shadow.mapSize.x !== size) {
      key.shadow.mapSize.set(size, size);
      key.shadow.map?.dispose();
      key.shadow.map = null;
    }
    stage.setQuality(high);
    fx?.resize();
  }

  function resize() {
    const r = host.getBoundingClientRect();
    width = Math.max(2, Math.round(r.width));
    height = Math.max(2, Math.round(r.height));
    camera.aspect = width / height;
    fit = Math.min(1.7, Math.max(0.9, 1.25 / camera.aspect));
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    fx?.resize();
  }

  const ro = new ResizeObserver(resize);
  ro.observe(host);
  const io = new IntersectionObserver((entries) => (visible = entries[0].isIntersecting), { threshold: 0 });
  io.observe(host);
  const onMove = (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  };
  window.addEventListener("pointermove", onMove, { passive: true });

  /** Everything that happens in the story, as a pure function of scroll progress. */
  function stateAt(p, t) {
    const wake = 0.6 + 0.4 * sstep(0.255, 0.3, p);
    const speech = Math.max(0, Math.sin(t * 2.3) * Math.sin(t * 0.7 + 1)) * 0.55 * (1 - sstep(0.43, 0.46, p)) * sstep(0.29, 0.32, p);
    return {
      p,
      answered: sstep(0.255, 0.3, p),
      dialling: sstep(0.14, 0.17, p) * (1 - sstep(0.3, 0.33, p)),
      ringing: sstep(0.18, 0.2, p),
      wake,
      energy: Math.min(1, 0.12 + wake * 0.14 + speech + 0.1 * seg(0.46, 0.52, p) * (1 - seg(0.52, 0.58, p))),
      arcCall: seg(0.15, 0.235, p),
      arcCallLevel: 1 - 0.5 * sstep(0.46, 0.52, p) - 0.4 * sstep(0.8, 0.9, p),
      arcBank: seg(0.44, 0.5, p),
      arcBankLevel: 1 - 0.6 * sstep(0.6, 0.66, p),
      mark: seg(0.5, 0.525, p),
      lock: seg(0.525, 0.55, p),
      freeze: seg(0.54, 0.575, p),
      arcStrain: seg(0.575, 0.6, p),
      arcStrainLevel: 1 - sstep(0.62, 0.66, p),
      cardForm: seg(0.585, 0.62, p),
      cardReveal: seg(0.6, 0.66, p),
      cardRedact: seg(0.66, 0.7, p),
      cardFly: easeInOut(seg(0.725, 0.785, p)),
      cardHome: seg(0.95, 1, p),
      arcFamily: seg(0.715, 0.75, p),
      arcFamilyLevel: 1 - 0.65 * sstep(0.84, 0.92, p),
      families: seg(0.765, 0.83, p),
      waveOn: sstep(0.77, 0.79, p),
      waveRadius: lerp(0, 96, easeOut(seg(0.775, 0.93, p))),
      wave: seg(0.775, 0.93, p),
      scamDim: sstep(0.8, 0.93, p),
      tone: sstep(0.78, 0.92, p),
    };
  }

  function placeCamera(t, dt) {
    // blend between the two scenes' views; the camera pulls back a little mid-flight, which sells the distance
    const e = easeInOut(travel);
    const a = VIEWS[from];
    const b = VIEWS[step];
    for (let c = 0; c < 7; c++) camVals[c] = lerp(a[c], b[c], e);
    camVals[2] += Math.sin(Math.PI * e) * Math.min(30, 3 + Math.hypot(b[3] - a[3], b[5] - a[5]) * 0.5);
    spread = clamp01((camVals[2] - 80) / 30);
    pointer.sx += (pointer.x - pointer.sx) * Math.min(1, dt * 3);
    pointer.sy += (pointer.y - pointer.sy) * Math.min(1, dt * 3);
    const drift = reduce ? 0 : 1;
    const yaw = (camVals[0] + pointer.sx * 3 + Math.sin(t * 0.11) * 1.6 * drift) * D2R;
    camYaw = yaw;
    const pitch = (camVals[1] - pointer.sy * 1.4 + Math.sin(t * 0.17) * 0.6 * drift) * D2R;
    const dist = camVals[2] * fit;
    lookAt.set(camVals[3], camVals[4], camVals[5]);
    camera.position.set(lookAt.x + dist * Math.sin(yaw) * Math.cos(pitch), lookAt.y + dist * Math.sin(pitch), lookAt.z + dist * Math.cos(yaw) * Math.cos(pitch));
    camera.lookAt(lookAt);
    // slide the camera sideways to push the scene clear of the copy (a view offset would break the mirror floor's camera)
    const shift = width / height > 1.25 ? camVals[6] : 0;
    if (shift > 0.001) {
      const halfW = Math.tan((camera.fov * D2R) / 2) * dist * camera.aspect;
      right.set(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(-shift * 2 * halfW);
      camera.position.add(right);
      lookAt.add(right);
      camera.lookAt(lookAt);
    }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    if (!visible || !running) return;
    clock += dt;
    if (travel < 1) travel = Math.min(1, travel + dt / travelFor);
    // story events play at an even pace while the camera eases in and out
    progress = lerp(REST[from], REST[step], travel * 0.6 + easeInOut(travel) * 0.4);
    const p = progress;
    const s = stateAt(p, clock);

    // the row of objects rises into place once, then everything stays put
    const arrive = arriveAt === null ? 0 : easeOut(clamp01((clock - arriveAt) / 1.8));
    world.visible = arrive > 0.001;
    world.position.y = -(1 - arrive) * 9;

    placeCamera(clock, dt);
    s.over = spread;
    // in the last scene the ring unfolds into a wide arc and every station turns to face the viewer, a little larger, so all five read clearly
    const ov = easeInOut(spread);
    for (const [name, g] of stationGroups) {
      const base = S[name].face + Math.PI;
      const px = lerp(S[name].x, OVERVIEW[name].x, ov);
      const pz = lerp(S[name].z, OVERVIEW[name].z, ov);
      const sc = lerp(1, OVERVIEW_SCALE[name], ov);
      g.position.set(px, 0, pz);
      g.scale.setScalar(sc);
      g.rotation.y = base + Math.atan2(Math.sin(camYaw - base), Math.cos(camYaw - base)) * spread;
      plinths[name].group.position.set(px, 0, pz);
      plinths[name].group.scale.setScalar(sc);
      anchors[`s_${name}`].set(px, PIN_Y[name] * sc, pz);
    }
    const tx = camVals[3];
    const tz = camVals[5];
    stage.setFocus(tx, tz, 1 + spread * 3);
    stage.update(clock, dpr, s.tone, ov);
    // the lights ride with the camera, so every station, whichever way it faces, is lit from the viewer's upper left with a cool rim behind
    const sy = Math.sin(camYaw);
    const cy = Math.cos(camYaw);
    key.position.set(tx - 16 * cy + 28 * sy, 36, tz + 16 * sy + 28 * cy);
    key.target.position.set(tx, 0, tz);
    rim.position.set(tx + 34 * cy - 34 * sy, 20, tz - 34 * sy - 34 * cy);
    rim.target.position.set(tx, 4, tz);
    const ext = 26 + spread * 76;
    if (Math.abs(key.shadow.camera.right - ext) > 0.5) {
      Object.assign(key.shadow.camera, { left: -ext, right: ext, top: ext * 0.85, bottom: -ext * 0.85 });
      key.shadow.camera.updateProjectionMatrix();
    }
    scene.fog.near = lerp(60, 280, spread);
    scene.fog.far = lerp(260, 760, spread);

    // plinth rings: dim, except for the scene's subject
    const hero = 0.3 * (1 - sstep(0.1, 0.15, p));
    const litOf = {
      phone: Math.max(hero, bump(0.14, 0.18, 0.3, 0.35, p)),
      orb: Math.max(hero * 3, bump(0.26, 0.3, 0.5, 0.54, p)),
      bank: Math.max(hero, bump(0.45, 0.5, 0.6, 0.64, p)),
      card: Math.max(hero, bump(0.58, 0.62, 0.74, 0.78, p)),
      families: Math.max(hero, bump(0.72, 0.78, 1.01, 1.02, p)),
    };
    for (const [name, pl] of Object.entries(plinths)) {
      const dx = Math.hypot(S[name].x - S.families.x, S[name].z - S.families.z);
      const green = name === "phone" ? 0 : s.waveOn * sstep(dx - 2, dx + 2, s.waveRadius);
      tmpColor.copy(pl.baseColor).lerp(new THREE.Color(COLORS.safe), green);
      if (name === "phone") tmpColor.lerp(grey, s.scamDim);
      pl.setColor(tmpColor);
      pl.setLit(Math.max(litOf[name], green * 0.9, sstep(0.95, 1, p) * 0.7));
    }
    // the route lights up station by station, then closes the loop in the last scene
    const run = lerp(S.phone.face - 0.05, ROUTE_END, clamp01((p - 0.1) / 0.8));
    const close = easeInOut(clamp01((p - 0.93) / 0.07));
    stage.routeU.uLit.value = close > 0 ? lerp(ROUTE_END, ROUTE_FULL, close) : run;
    stage.routeU.uTone.value = s.tone;

    phone.update(s, clock);
    orb.update(s, clock, camera);
    bank.update(s, clock);
    families.update(s, clock);
    const arcFade = 1 - sstep(0, 0.25, spread);
    arcCall.update(clock, s.arcCall, s.arcCallLevel * arcFade, 0.1 + 0.08 * s.wake);
    arcBank.update(clock, s.arcBank, s.arcBankLevel * arcFade, 0.14);
    arcStrain.update(clock, s.arcStrain, s.arcStrainLevel * arcFade, 0.18);
    arcFamily.update(clock, s.arcFamily, s.arcFamilyLevel * arcFade, 0.14);
    card.update(s, clock, camera, arcFamily.curve);

    wave.visible = s.waveOn > 0.01 && s.wave < 0.995;
    wave.scale.setScalar(Math.max(0.01, s.waveRadius));
    wave.material.opacity = (1 - s.wave) * 0.85;

    if (fx && quality === "high") fx.render(scene, camera, { focus: camera.position.distanceTo(lookAt), spread });
    else renderer.render(scene, camera);

    if (arrive >= 1 && !reduce && quality === "high") {
      frames.n++;
      frames.sum += dt;
      if (frames.n >= 90) {
        const avg = frames.sum / frames.n;
        frames.n = 0;
        frames.sum = 0;
        if (avg > 1 / 24) controller.setQuality("low");
      }
    }
    onFrame?.({ p, t: clock, state: s, project });
  }

  /** Screen position (CSS px inside the host) of a named world anchor. */
  function project(name) {
    const v = anchors[name];
    if (!v) return { x: 0, y: 0, visible: false };
    ndc.copy(v).project(camera);
    return { x: (ndc.x * 0.5 + 0.5) * width, y: (-ndc.y * 0.5 + 0.5) * height, visible: ndc.z < 1 && ndc.z > -1 };
  }

  if ((navigator.hardwareConcurrency || 4) <= 2) quality = "low";
  resize();
  applyQuality();
  last = performance.now();
  raf = requestAnimationFrame(frame);

  const controller = {
    canvas,
    /** Glide to scene i (0..5). Returns the seconds the flight takes so the page can pace its copy to it. */
    go(i) {
      const next = Math.max(0, Math.min(REST.length - 1, Math.round(i)));
      if (next === step && travel >= 1) return 0;
      from = step;
      step = next;
      travel = 0;
      travelFor = reduce ? 0.01 : Math.min(3.2, 1.9 + Math.abs(step - from) * 0.28);
      return travelFor;
    },
    /** Jump straight to scene i without a flight (first paint, deep links). */
    snap(i) {
      step = from = Math.max(0, Math.min(REST.length - 1, Math.round(i)));
      travel = 1;
    },
    get step() {
      return step;
    },
    arrive() {
      if (arriveAt === null) arriveAt = clock + 0.05;
    },
    project,
    get quality() {
      return quality;
    },
    setQuality(q) {
      if (q === quality) return;
      quality = q;
      applyQuality();
    },
    dispose() {
      cancelAnimationFrame(raf);
      running = false;
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      [stage, arcCall, arcBank, arcStrain, arcFamily, card, fx, ...Object.values(plinths)].forEach((m) => m?.dispose?.());
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
  return controller;
}
