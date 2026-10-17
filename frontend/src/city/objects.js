// The five hero objects, in matte white "clay" with glossy details. Each exposes update(state, t), driven by the scroll timeline.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { clamp01, easeBack, lerp } from "./math.js";
import { AIR, COLORS, STATION } from "./world.js";

/** Puts an object on its station and turns its front toward the middle of the ring, where the camera stands. */
function placeAt(g, name) {
  const s = STATION[name];
  g.position.set(s.x, 0, s.z);
  g.rotation.y = s.face + Math.PI;
  return s;
}

const clay = (o = {}) => new THREE.MeshStandardMaterial({ color: COLORS.clay, roughness: 0.55, metalness: 0, ...o });
const gloss = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.2, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.12, ...o });
const lit = (color, k = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false });

function put(parent, geo, mat, x = 0, y = 0, z = 0, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** Translucent bubble: a faint fill with a firm rim, readable on a dark stage. */
function bubble(color, rim = 0.9, fill = 0.06) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 1 }, uRim: { value: rim }, uFill: { value: fill } },
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity, uRim, uFill; varying vec3 vN; varying vec3 vV;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.6);
        gl_FragColor = vec4(uColor, (uFill + f * uRim) * uOpacity);
        #include <colorspace_fragment>
      }`,
  });
}

function floorRings(color, count, width = 0.07) {
  const g = new THREE.Group();
  const items = [];
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(new THREE.RingGeometry(1 - width, 1, 128), new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.06;
    g.add(m);
    items.push(m);
  }
  return {
    group: g,
    setColor: (c) => items.forEach((m) => m.material.color.set(c)),
    update(t, level, radius, speed = 0.4) {
      items.forEach((m, i) => {
        const k = (t * speed + i / count) % 1;
        m.scale.setScalar(Math.max(0.01, 1 + k * radius));
        m.material.opacity = level * (1 - k) * (1 - k);
        m.visible = level > 0.01;
      });
    },
  };
}

function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  let last = "";
  return {
    tex,
    redraw(key, ...args) {
      if (key === last) return;
      last = key;
      draw(g, w, h, ...args);
      tex.needsUpdate = true;
    },
  };
}

const rr = (g, x, y, w, h, r) => {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
};

// ---------------------------------------------------------------- 1. the scammer's phone
function drawPhone(g, w, h, mode, clock) {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, mode === "off" ? "#1a2236" : "#2a0f18");
  grad.addColorStop(1, mode === "off" ? "#0f1626" : "#12060b");
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  const on = mode !== "off";
  g.fillStyle = on ? "#ff8a98" : "#8c9bbb";
  g.font = "700 30px Inter, Segoe UI, sans-serif";
  g.fillText(mode === "connected" ? "CALL CONNECTED" : mode === "off" ? "CALL ENDED" : "INCOMING CALL", w / 2, 120);
  g.fillStyle = on ? "rgba(255,84,104,0.18)" : "rgba(120,130,160,0.12)";
  g.beginPath();
  g.arc(w / 2, 330, 120, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = on ? "#ff5468" : "#8c9bbb";
  g.font = "800 150px Inter, Segoe UI, sans-serif";
  g.fillText("?", w / 2, 385);
  g.fillStyle = on ? "#ffffff" : "#b4c1dd";
  g.font = "800 50px Inter, Segoe UI, sans-serif";
  g.fillText("Unknown number", w / 2, 540);
  g.fillStyle = on ? "#ffb3bd" : "#8c9bbb";
  g.font = "600 32px Inter, Segoe UI, sans-serif";
  g.fillText(mode === "connected" ? clock : "\u201CCBI officer\u201D \u00B7 not verified", w / 2, 592);
  if (on) {
    g.fillStyle = "rgba(255,84,104,0.14)";
    rr(g, 70, 650, w - 140, 62, 31);
    g.fill();
    g.fillStyle = "#ff8a98";
    g.font = "700 28px Inter, Segoe UI, sans-serif";
    g.fillText("\u26A0  Possible scam", w / 2, 692);
  }
  g.fillStyle = mode === "off" ? "#3a4666" : "#e0364a";
  g.beginPath();
  g.arc(w / 2 - 120, 880, 64, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = mode === "off" ? "#3a4666" : "#16a870";
  g.beginPath();
  g.arc(w / 2 + 120, 880, 64, 0, Math.PI * 2);
  g.fill();
}

export function createPhone() {
  const g = new THREE.Group();
  const at = placeAt(g, "phone");
  const body = put(g, new RoundedBoxGeometry(4.8, 9.4, 0.7, 6, 0.55), gloss(0x0d1018, { metalness: 0.8, roughness: 0.3 }), 0, 0, 0);
  const screen = canvasTexture(512, 1024, drawPhone);
  screen.redraw("on", "ring", "");
  const face = new THREE.Mesh(new THREE.PlaneGeometry(4.3, 8.6), new THREE.MeshBasicMaterial({ map: screen.tex, toneMapped: false }));
  face.position.z = 0.36;
  body.add(face);
  const holder = new THREE.Group();
  holder.add(body);
  holder.position.set(0, 5.4, 0);
  holder.rotation.set(0, 0.42, -0.05);
  g.add(holder);

  // broadcast arcs beside the phone: three quarter-arcs that pulse outward
  const arcs = [1.2, 1.9, 2.6].map((r) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.09, 8, 40, Math.PI / 2), new THREE.MeshBasicMaterial({ color: COLORS.coral, toneMapped: false, transparent: true, opacity: 0 }));
    m.position.set(2.6, 4.2, 0.4);
    m.rotation.z = Math.PI / 4 - Math.PI / 4;
    holder.add(m);
    return m;
  });
  const rings = floorRings(COLORS.coral, 3);
  g.add(rings.group);

  return {
    group: g,
    anchor: new THREE.Vector3(at.x, 11.6, at.z),
    update(s, t) {
      const power = 1 - s.scamDim;
      holder.position.y = 5.4 + Math.sin(t * 1.2) * 0.14;
      const ringing = s.dialling * power;
      holder.rotation.z = -0.05 + Math.sin(t * 34) * 0.012 * ringing * (1 - s.answered);
      const sec = Math.round(Math.max(0, (s.p - 0.28) / 0.22) * 167);
      const clock = `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
      const mode = s.scamDim > 0.55 ? "off" : s.answered > 0.5 ? "connected" : "ring";
      screen.redraw(mode + (mode === "connected" ? clock : ""), mode, clock);
      arcs.forEach((a, i) => {
        a.material.opacity = ringing * Math.max(0, Math.sin(t * 5 - i * 0.9)) * 0.9;
      });
      rings.update(t, ringing * 0.9, 9, 0.45);
      face.material.color.setScalar(0.85 + 0.15 * power);
    },
    ring: rings,
  };
}

// ---------------------------------------------------------------- 2. Ramesh: the voice orb with a live equalizer ring
export function createOrb() {
  const g = new THREE.Group();
  const at = placeAt(g, "orb");
  const orbU = { uTime: { value: 0 }, uEnergy: { value: 0.2 }, uWake: { value: 0 } };
  const orb = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.0, 6),
    new THREE.ShaderMaterial({
      uniforms: orbU,
      vertexShader: /* glsl */ `
        uniform float uTime, uEnergy, uWake; varying vec3 vN; varying vec3 vV; varying float vD;
        void main() {
          float t = uTime;
          vec3 p = position;
          float d = sin(p.x * 1.6 + t * 0.9) * sin(p.y * 1.8 - t * 0.7) * sin(p.z * 1.6 + t * 1.1);
          d += 0.5 * sin(p.x * 3.4 - t * 1.3 + p.y * 2.4) * sin(p.z * 3.2 + t * 0.8 - p.x * 1.6);
          float amp = (0.05 + uEnergy * 0.2) * (0.3 + 0.7 * uWake);
          vec3 q = position + normal * d * amp * 1.4;
          vD = d;
          vec4 mv = modelViewMatrix * vec4(q, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uEnergy, uWake; varying vec3 vN; varying vec3 vV; varying float vD;
        void main() {
          vec3 n = normalize(vN);
          vec3 v = normalize(vV);
          float f = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.2);
          vec3 deep = vec3(0.03, 0.09, 0.62);
          vec3 sky = vec3(0.36, 0.64, 1.0);
          vec3 col = mix(deep, sky, f * 0.95 + 0.12 * vD);
          vec3 l = normalize(vec3(-0.5, 0.8, 0.7));
          col += vec3(1.0) * pow(max(dot(reflect(-l, n), v), 0.0), 40.0) * 0.8;
          col = mix(vec3(0.14, 0.22, 0.52), col, 0.55 + 0.45 * uWake);
          col *= 1.0 + uEnergy * 0.35;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  const orbGroup = new THREE.Group();
  orbGroup.position.y = AIR.orb[1];
  orbGroup.add(orb);
  g.add(orbGroup);

  // the equalizer ring: bars that rise with Ramesh's voice
  const N = 120;
  const barGeo = new THREE.BoxGeometry(0.085, 1, 0.085);
  barGeo.translate(0, 0.5, 0);
  const bars = new THREE.InstancedMesh(barGeo, new THREE.MeshBasicMaterial({ color: COLORS.sky, toneMapped: false }), N);
  const barRing = new THREE.Group();
  barRing.add(bars);
  g.add(barRing);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const parentQ = new THREE.Quaternion();
  const v3 = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const e = new THREE.Euler();

  // a thin beam ties the orb to its plinth
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, AIR.orb[1], 8, 1, true),
    new THREE.MeshBasicMaterial({ color: COLORS.sky, transparent: true, opacity: 0.25, toneMapped: false }),
  );
  beam.position.y = AIR.orb[1] / 2;
  g.add(beam);
  const rings = floorRings(COLORS.cobalt, 3);
  g.add(rings.group);

  return {
    group: g,
    anchor: new THREE.Vector3(at.x, AIR.orb[1] + 4.4, at.z),
    update(s, t, camera) {
      orbU.uTime.value = t;
      orbU.uEnergy.value = s.energy;
      orbU.uWake.value = s.wake;
      const ring = s.ringing * (1 - s.answered);
      orbGroup.position.y = AIR.orb[1] + Math.sin(t * 1.3) * 0.16 + ring * Math.sin(t * 28) * 0.05;
      orbGroup.scale.setScalar(lerp(0.9, 1.15, s.wake) + s.energy * 0.12);
      // a radial equalizer that always faces the viewer (the camera's turn, expressed in the station's own space)
      barRing.position.y = orbGroup.position.y;
      if (camera) {
        g.getWorldQuaternion(parentQ).invert();
        barRing.quaternion.copy(parentQ).multiply(camera.quaternion);
      }
      barRing.rotateZ(t * 0.1);
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        const wave = 0.5 + 0.5 * Math.sin(i * 0.75 + t * 5.2) * Math.sin(i * 0.23 - t * 2.1);
        const h = 0.16 + s.wake * (0.2 + s.energy * 3.0 * wave);
        v3.set(Math.cos(a) * 3.3, Math.sin(a) * 3.3, 0);
        e.set(0, 0, a - Math.PI / 2);
        q.setFromEuler(e);
        sc.set(1, h, 1);
        m4.compose(v3, q, sc);
        bars.setMatrixAt(i, m4);
      }
      bars.instanceMatrix.needsUpdate = true;
      bars.material.color.set(s.tone > 0.5 ? COLORS.safe : COLORS.sky);
      beam.material.opacity = 0.12 + 0.25 * s.wake;
      rings.update(t, s.wake * (0.3 + s.energy), 11, 0.3);
    },
  };
}

// ---------------------------------------------------------------- 3. the bank, the mule account, the freeze
export function createBank() {
  const g = new THREE.Group();
  const at = placeAt(g, "bank");
  const inner = new THREE.Group();
  inner.scale.setScalar(0.74);
  inner.position.y = 0.7;
  g.add(inner);
  const stone = clay();
  const shade = clay({ color: 0xd3daea });
  put(inner, new THREE.BoxGeometry(10.6, 0.35, 7.2), shade, 0, 0.17, 0);
  put(inner, new THREE.BoxGeometry(9.6, 0.35, 6.4), stone, 0, 0.52, 0);
  put(inner, new THREE.BoxGeometry(8.4, 4, 4.8), stone, 0, 2.9, -0.4);
  for (let i = 0; i < 6; i++) put(inner, new THREE.CylinderGeometry(0.3, 0.33, 4, 20), stone, -3.75 + i * 1.5, 2.9, 2.5);
  put(inner, new THREE.BoxGeometry(9.4, 0.4, 1), stone, 0, 5.1, 2.5);
  const tri = new THREE.Shape();
  tri.moveTo(-4.7, 0);
  tri.lineTo(4.7, 0);
  tri.lineTo(0, 1.9);
  tri.closePath();
  put(inner, new THREE.ExtrudeGeometry(tri, { depth: 0.9, bevelEnabled: false }), shade, 0, 5.3, 2.05);
  put(inner, new THREE.BoxGeometry(8.8, 0.28, 5), shade, 0, 5.0, -0.4);
  put(inner, new THREE.BoxGeometry(1.5, 2.2, 0.08), gloss(COLORS.cobalt), 0, 1.9, 2.1, false);
  put(inner, new THREE.CircleGeometry(0.5, 28), lit(COLORS.cobalt), 0, 6.2, 2.98, false);

  const marker = new THREE.Group();
  marker.position.y = AIR.bankMarker[1];
  const core = put(marker, new THREE.OctahedronGeometry(0.95, 0), gloss(COLORS.coral, { emissive: COLORS.coral, emissiveIntensity: 0.55 }), 0, 0, 0, false);
  const wire = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.OctahedronGeometry(1.35, 0)), new THREE.LineBasicMaterial({ color: COLORS.coral }));
  marker.add(wire);
  const iceMat = bubble(COLORS.ice, 0.95, 0.12);
  const ice = new THREE.Mesh(new THREE.IcosahedronGeometry(2.3, 1), iceMat);
  const iceEdges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(2.3, 1)), new THREE.LineBasicMaterial({ color: COLORS.ice, transparent: true }));
  marker.add(ice, iceEdges);
  const lock = new THREE.Group();
  put(lock, new THREE.BoxGeometry(1.2, 0.9, 0.5), gloss(COLORS.cobalt), 0, 0, 0, false);
  const shackle = put(lock, new THREE.TorusGeometry(0.38, 0.1, 10, 28, Math.PI), gloss(0xe8eefc), 0, 0.44, 0, false);
  lock.position.y = 3.5;
  marker.add(lock);
  g.add(marker);
  const rings = floorRings(COLORS.ice, 2);
  g.add(rings.group);

  return {
    group: g,
    anchor: new THREE.Vector3(at.x, AIR.bankMarker[1] + 4, at.z),
    update(s, t) {
      const pop = easeBack(clamp01(s.mark));
      marker.visible = s.mark > 0.01 && s.over < 0.5;
      marker.scale.setScalar(Math.max(0.001, pop));
      marker.position.y = AIR.bankMarker[1] + Math.sin(t * 1.6) * 0.18;
      core.rotation.y = t * 1.2;
      core.rotation.x = t * 0.6;
      wire.rotation.y = -t * 0.7;
      wire.rotation.z = t * 0.4;
      core.material.emissiveIntensity = lerp(0.55, 0.05, s.freeze);
      iceMat.uniforms.uOpacity.value = s.freeze;
      const iceScale = lerp(0.2, 1, easeBack(s.freeze));
      ice.scale.setScalar(iceScale);
      iceEdges.scale.setScalar(iceScale);
      iceEdges.material.opacity = 0.9 * s.freeze;
      ice.visible = iceEdges.visible = s.freeze > 0.01;
      const drop = easeBack(clamp01(s.lock));
      lock.visible = s.lock > 0.01;
      lock.position.y = lerp(3.5, 2.8, drop) + Math.sin(t * 1.4) * 0.05;
      shackle.position.y = lerp(0.8, 0.44, clamp01((s.lock - 0.55) / 0.3));
      lock.scale.setScalar(Math.max(0.001, drop));
      rings.update(t, s.lock > 0.6 && s.freeze < 1 ? 0.9 : s.freeze * 0.3, 8, 0.5);
    },
    ring: rings,
  };
}

// ---------------------------------------------------------------- 4. the strain card
const CW = 640;
const CH = 820;
const STEPS = ["Says a parcel in your name holds illegal items.", "Claims an arrest warrant is ready.", "Orders you to stay on the line and tell nobody.", "Demands a UPI \u201Csecurity deposit\u201D."];

function wrap(g, text, x, y, maxW, lineH, maxLines = 3) {
  const words = text.split(" ");
  let line = "";
  let row = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (g.measureText(test).width > maxW && line) {
      g.fillText(line, x, y + row * lineH);
      line = word;
      row++;
      if (row >= maxLines) return row;
    } else line = test;
  }
  g.fillText(line, x, y + row * lineH);
  return row + 1;
}

function drawCard(g, w, h, reveal, redact) {
  g.clearRect(0, 0, w, h);
  g.fillStyle = "#0c1226";
  rr(g, 4, 4, w - 8, h - 8, 34);
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = "rgba(125,178,255,0.55)";
  g.stroke();
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.fillStyle = "#7db2ff";
  g.font = "800 22px Inter, Segoe UI, sans-serif";
  g.fillText("STRAIN CAPTURED", 44, 72);
  g.textAlign = "right";
  g.fillStyle = "#7e8db3";
  g.font = "600 20px Inter, Segoe UI, sans-serif";
  g.fillText("identifiers removed", w - 44, 72);
  g.textAlign = "left";
  g.fillStyle = "#ffffff";
  g.font = "800 62px Inter, Segoe UI, sans-serif";
  g.fillText("Digital arrest", 44, 150);
  g.fillStyle = "#9db0d4";
  g.font = "600 24px Inter, Segoe UI, sans-serif";
  g.fillText("Pretends to be: CBI \u00B7 Cyber Crime", 44, 190);
  STEPS.forEach((step, i) => {
    const k = clamp01(reveal * STEPS.length - i);
    if (k <= 0) return;
    const y = 250 + i * 92;
    g.globalAlpha = k;
    g.fillStyle = "rgba(125,178,255,0.18)";
    g.beginPath();
    g.arc(66, y + 8, 21, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#7db2ff";
    g.font = "800 22px Inter, Segoe UI, sans-serif";
    g.textAlign = "center";
    g.fillText(String(i + 1), 66, y + 16);
    g.textAlign = "left";
    g.fillStyle = "#e8eefc";
    g.font = "600 27px Inter, Segoe UI, sans-serif";
    wrap(g, step, 106, y + 14, w - 160, 34, 2);
    g.globalAlpha = 1;
  });
  const qy = 640;
  g.fillStyle = "rgba(255,255,255,0.05)";
  rr(g, 38, qy - 34, w - 76, 112, 20);
  g.fill();
  g.fillStyle = "#7e8db3";
  g.font = "700 18px Inter, Segoe UI, sans-serif";
  g.fillText("SCRIPT EXCERPT", 58, qy - 6);
  g.fillStyle = "#cfe0ff";
  g.font = "600 25px Inter, Segoe UI, sans-serif";
  const lead = "Send the deposit to ";
  g.fillText(lead, 58, qy + 38);
  const lw = g.measureText(lead).width;
  const secret = "rahul.sharma@okaxis";
  g.fillStyle = "#ff9aa8";
  g.font = "700 25px Consolas, monospace";
  g.fillText(secret, 58 + lw, qy + 38);
  const sw = g.measureText(secret).width;
  const bar = sw * clamp01(redact);
  if (bar > 0) {
    g.fillStyle = "#02040a";
    rr(g, 54 + lw, qy + 14, bar + 8, 34, 8);
    g.fill();
    if (redact > 0.98) {
      g.fillStyle = "#2fe0a3";
      g.font = "800 17px Inter, Segoe UI, sans-serif";
      g.fillText("UPI ID REMOVED", 66 + lw, qy + 37);
    }
  }
  g.fillStyle = "#9db0d4";
  g.font = "600 20px Inter, Segoe UI, sans-serif";
  g.fillText(redact > 0.98 ? "Safe to share and teach with" : "Names, numbers and UPI IDs are being removed\u2026", 58, qy + 72);
  ["Fear and urgency", "Secrecy", "Personal UPI ID"].forEach((label, i) => {
    const x = 44 + i * 188;
    g.fillStyle = "rgba(255,84,104,0.16)";
    rr(g, x, 756, 176, 36, 18);
    g.fill();
    g.fillStyle = "#ff9aa8";
    g.font = "700 18px Inter, Segoe UI, sans-serif";
    g.textAlign = "center";
    g.fillText(label, x + 88, 780);
    g.textAlign = "left";
  });
}

export function createCard() {
  const g = new THREE.Group();
  placeAt(g, "card");
  const tex = canvasTexture(CW, CH, drawCard);
  tex.redraw("0-0", 0, 0);
  const holder = new THREE.Group();
  const slab = put(holder, new RoundedBoxGeometry(5.1, 6.5, 0.18, 4, 0.14), gloss(0x0c1226, { metalness: 0.4, roughness: 0.25 }), 0, 0, 0);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(5, 6.4), new THREE.MeshBasicMaterial({ map: tex.tex, transparent: true, toneMapped: false }));
  face.position.z = 0.1;
  slab.add(face);
  holder.position.y = AIR.card[1];
  g.add(holder);
  const rings = floorRings(COLORS.cobalt, 2);
  g.add(rings.group);
  const tmp = new THREE.Vector3();

  return {
    group: g,
    anchor: new THREE.Vector3(),
    update(s, t, camera, curve) {
      const form = clamp01(s.cardForm);
      const pop = easeBack(form);
      // once the card has flown to the families, a copy rests on its own station for the zoomed-out view
      const home = s.cardHome > 0.01;
      holder.visible = (form > 0.01 && s.cardFly < 0.995) || home;
      if (s.cardFly > 0 && curve && !home) {
        curve.getPoint(Math.min(1, s.cardFly), tmp);
        holder.position.copy(g.worldToLocal(tmp));
      } else holder.position.set(0, AIR.card[1] + Math.sin(t * 1.2) * 0.18, 0);
      const shrink = home ? lerp(0.2, 1, easeBack(s.cardHome)) : lerp(1, 0.2, s.cardFly);
      holder.scale.setScalar(Math.max(0.001, (home ? 1 : pop) * shrink));
      holder.rotation.y = Math.sin(t * 0.5) * 0.12 - 0.1 + (home ? 0 : s.cardFly * 0.6);
      this.anchor.copy(holder.position);
      g.localToWorld(this.anchor);
      this.anchor.y += 3.9 * holder.scale.x;
      rings.update(t, home ? 0.5 * s.cardHome : form * (1 - s.cardFly) * 0.6, 8, 0.3);
      tex.redraw(`${Math.round(s.cardReveal * 40)}-${Math.round(s.cardRedact * 40)}`, s.cardReveal, s.cardRedact);
    },
    dispose() {
      tex.tex.dispose();
    },
  };
}

// ---------------------------------------------------------------- 5. the families that get vaccinated
function shieldMesh() {
  const s = new THREE.Shape();
  s.moveTo(0, 1.05);
  s.bezierCurveTo(0.45, 0.9, 0.8, 0.9, 1.0, 0.82);
  s.lineTo(1.0, 0.12);
  s.bezierCurveTo(1.0, -0.5, 0.42, -0.9, 0, -1.12);
  s.bezierCurveTo(-0.42, -0.9, -1.0, -0.5, -1.0, 0.12);
  s.lineTo(-1.0, 0.82);
  s.bezierCurveTo(-0.8, 0.9, -0.45, 0.9, 0, 1.05);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 });
  geo.translate(0, 0, -0.11);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, gloss(COLORS.safe, { emissive: COLORS.safe, emissiveIntensity: 0.35 })));
  const tick = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const a = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.12), tick);
  a.position.set(-0.28, -0.02, 0.2);
  a.rotation.z = Math.PI / 4;
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.0, 0.12), tick);
  b.position.set(0.2, 0.12, 0.2);
  b.rotation.z = -Math.PI / 4;
  g.add(a, b);
  return g;
}

export function createFamilies() {
  const g = new THREE.Group();
  const at = placeAt(g, "families");
  const spots = [[-3.6, 1.8, 0.78], [0.2, -2.2, 0.7], [3.9, 1.6, 0.78]];
  const homes = spots.map(([x, z, k], i) => {
    const h = new THREE.Group();
    h.position.set(x, 0.7, z);
    h.scale.setScalar(k);
    put(h, new THREE.BoxGeometry(3.4, 2.1, 3), clay(), 0, 1.05, 0);
    const roof = put(h, new THREE.ConeGeometry(2.8, 1.5, 4), clay({ color: i % 2 ? 0xc9d4ee : 0xdfe6f6 }), 0, 2.85, 0);
    roof.rotation.y = Math.PI / 4;
    for (const wx of [-0.85, 0.85]) put(h, new THREE.BoxGeometry(0.7, 0.62, 0.08), lit(COLORS.amber, 0.95), wx, 1.2, 1.53, false);
    const bub = new THREE.Mesh(new THREE.SphereGeometry(3.3, 40, 22), bubble(COLORS.safe, 0.95, 0.07));
    bub.position.y = 1.1;
    h.add(bub);
    const token = shieldMesh();
    token.position.y = 5.2;
    token.scale.setScalar(0.62);
    h.add(token);
    return { h, bub, token };
  });
  homes.forEach((x) => g.add(x.h));
  const burst = floorRings(COLORS.safe, 3);
  g.add(burst.group);

  return {
    group: g,
    anchor: new THREE.Vector3(at.x, 11, at.z),
    ring: burst,
    update(s, t) {
      homes.forEach((x, i) => {
        const k = clamp01((s.families - i * 0.16) / 0.45);
        const pop = easeBack(k);
        x.bub.visible = k > 0.01;
        x.bub.scale.setScalar(Math.max(0.001, pop));
        x.bub.material.uniforms.uOpacity.value = 0.85 + 0.15 * Math.sin(t * 1.5 + i);
        x.token.visible = k > 0.01;
        x.token.scale.setScalar(Math.max(0.001, 0.62 * pop));
        x.token.rotation.y = t * 0.9 + i;
        x.token.position.y = 5.2 + Math.sin(t * 1.6 + i * 1.3) * 0.2;
      });
      burst.update(t, s.families > 0.05 ? 0.9 : 0, 14, 0.4);
    },
  };
}
