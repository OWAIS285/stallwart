// The stage: a dark mirror floor that fades into the page, one plinth per station, and a route ring that lights up as the story advances.
import * as THREE from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { COLORS, RING, STATION, arcZ } from "./world.js";

const FLOOR = 520;

// the route is one closed loop; angles are radians from +z toward +x, unwrapped so the story runs phone -> families -> back to the phone
export const ROUTE_START = STATION.phone.face;
export const ROUTE_END = STATION.families.face;
export const ROUTE_FULL = STATION.phone.face + Math.PI * 2;

export function createStage() {
  const group = new THREE.Group();

  // mirror floor, with a veil that hides the reflection further from the subject so the floor melts into the dark
  const mirror = new Reflector(new THREE.PlaneGeometry(FLOOR, FLOOR), { textureWidth: 1024, textureHeight: 640, color: 0x646a80, clipBias: 0.003 });
  mirror.rotation.x = -Math.PI / 2;
  group.add(mirror);

  const veilU = { uFocus: { value: new THREE.Vector2() }, uBg: { value: new THREE.Color(COLORS.bg) }, uBase: { value: 0.6 }, uSpan: { value: 1 } };
  const veil = new THREE.Mesh(
    new THREE.PlaneGeometry(FLOOR, FLOOR),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: veilU,
      vertexShader: `varying vec2 vXZ; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vXZ = wp.xz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */ `
        uniform vec2 uFocus; uniform vec3 uBg; uniform float uBase, uSpan; varying vec2 vXZ;
        void main() {
          float d = length(vXZ - uFocus) * 0.8 / uSpan;
          float a = mix(uBase, 1.0, smoothstep(8.0, 40.0, d));
          gl_FragColor = vec4(uBg, a);
          #include <colorspace_fragment>
        }`,
    }),
  );
  veil.rotation.x = -Math.PI / 2;
  veil.position.y = 0.004;
  group.add(veil);

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR, FLOOR), new THREE.ShadowMaterial({ opacity: 0.55 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;
  shadow.receiveShadow = true;
  group.add(shadow);

  // drifting dust over the whole ring, and one soft light cone that follows the subject
  const DUST = 320;
  const dpos = new Float32Array(DUST * 3);
  const dseed = new Float32Array(DUST);
  for (let i = 0; i < DUST; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 96;
    dpos.set([Math.sin(a) * r, Math.random() * 24, Math.cos(a) * r], i * 3);
    dseed[i] = Math.random();
  }
  const dgeo = new THREE.BufferGeometry();
  dgeo.setAttribute("position", new THREE.BufferAttribute(dpos, 3));
  dgeo.setAttribute("aSeed", new THREE.BufferAttribute(dseed, 1));
  const dustMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uTone: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aSeed; uniform float uTime, uPx; varying float vA;
      void main() {
        vec3 p = position;
        p.x += sin(uTime * 0.18 + aSeed * 40.0) * 1.6;
        p.y = mod(p.y + uTime * (0.12 + aSeed * 0.25), 24.0);
        p.z += cos(uTime * 0.14 + aSeed * 25.0) * 1.2;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vA = (0.2 + 0.8 * aSeed) * smoothstep(0.0, 3.0, p.y) * (1.0 - smoothstep(16.0, 24.0, p.y));
        gl_PointSize = (1.2 + aSeed * 1.8) * uPx * (60.0 / -mv.z);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTone; varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = (1.0 - smoothstep(0.0, 0.5, d)) * vA * 0.7;
        gl_FragColor = vec4(mix(vec3(0.7, 0.82, 1.0), vec3(0.78, 0.92, 1.0), uTone), a);
        #include <colorspace_fragment>
      }`,
  });
  const dust = new THREE.Points(dgeo, dustMat);
  dust.frustumCulled = false;
  group.add(dust);

  const coneMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uOpacity: { value: 0.1 }, uColor: { value: new THREE.Color(0x7aa6ff) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uOpacity; uniform vec3 uColor; varying vec2 vUv;
      void main() {
        float a = pow(vUv.y, 1.6) * uOpacity;
        gl_FragColor = vec4(uColor * a, a);
        #include <colorspace_fragment>
      }`,
  });
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 6.5, 30, 48, 1, true), coneMat);
  cone.position.y = 15.7;
  group.add(cone);

  // route: a dashed track around the ring with a lit section that follows the story, then closes the loop
  const routeU = { uLit: { value: ROUTE_START }, uStart: { value: ROUTE_START }, uTone: { value: 0 }, uFade: { value: 1 } };
  const route = new THREE.Mesh(
    new THREE.RingGeometry(RING - 0.14, RING + 0.14, 720, 1),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: routeU,
      vertexShader: `varying vec2 vXZ; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vXZ = wp.xz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */ `
        uniform float uLit, uStart, uTone, uFade; varying vec2 vXZ;
        void main() {
          float ang = atan(vXZ.x, vXZ.y);
          if (ang < uStart) ang += 6.2831853;
          float lit = 1.0 - smoothstep(uLit - 0.03, uLit + 0.03, ang);
          float head = exp(-pow((ang - uLit) / 0.05, 2.0));
          float dash = step(0.5, fract(ang * ${RING.toFixed(1)} * 0.55));
          vec3 azure = vec3(0.35, 0.66, 1.0);
          vec3 ice = vec3(0.75, 0.9, 1.0);
          vec3 c = mix(azure, ice, uTone);
          float a = (0.16 * dash + lit * 0.85 + head * 0.5) * uFade;
          gl_FragColor = vec4(mix(vec3(0.6, 0.68, 0.9), c, clamp(lit + head, 0.0, 1.0)), a);
          #include <colorspace_fragment>
        }`,
    }),
  );
  route.rotation.x = -Math.PI / 2;
  route.position.y = 0.03;
  group.add(route);

  // the last scene's path: a glowing ribbon along the lineup, with a pulse that keeps travelling along it
  const ribbonU = { uShow: { value: 0 }, uTime: { value: 0 } };
  const RIBBON_N = 220;
  const rp = new Float32Array((RIBBON_N + 1) * 2 * 3);
  const ru = new Float32Array((RIBBON_N + 1) * 2 * 2);
  const ri = [];
  for (let i = 0; i <= RIBBON_N; i++) {
    const x = -60 + (120 * i) / RIBBON_N;
    const dz = -0.0132 * x;
    const len = Math.hypot(1, dz);
    const nx = -dz / len;
    const nz = 1 / len;
    for (const side of [-1, 1]) {
      const k = i * 2 + (side > 0 ? 1 : 0);
      rp.set([x + nx * 0.75 * side, 0.035, arcZ(x) + nz * 0.75 * side], k * 3);
      ru.set([x, side], k * 2);
    }
    if (i < RIBBON_N) ri.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const ribbonGeo = new THREE.BufferGeometry();
  ribbonGeo.setAttribute("position", new THREE.BufferAttribute(rp, 3));
  ribbonGeo.setAttribute("uv", new THREE.BufferAttribute(ru, 2));
  ribbonGeo.setIndex(ri);
  const ribbon = new THREE.Mesh(
    ribbonGeo,
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: ribbonU,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uShow, uTime; varying vec2 vUv;
        void main() {
          float x = vUv.x;
          float side = abs(vUv.y);
          float core = 1.0 - smoothstep(0.12, 0.3, side);
          float glow = exp(-side * 3.2) * 0.4;
          float pulse = exp(-pow((x - (fract(uTime * 0.11) * 150.0 - 75.0)) / 3.4, 2.0));
          float ends = smoothstep(-58.0, -50.0, x) * (1.0 - smoothstep(50.0, 58.0, x));
          float a = (core * 0.7 + glow + pulse * (core + 0.35)) * ends * uShow;
          vec3 c = mix(vec3(0.35, 0.66, 1.0), vec3(0.85, 0.95, 1.0), clamp(pulse * 1.4, 0.0, 1.0));
          gl_FragColor = vec4(c, a);
          #include <colorspace_fragment>
        }`,
    }),
  );
  ribbon.frustumCulled = false;
  group.add(ribbon);

  let highQuality = true;

  return {
    group,
    mirror,
    veilU,
    routeU,
    /** The floor's clear area and the light cone follow the subject; span widens the clear area for the zoomed-out view. */
    setFocus(x, z, span = 1) {
      veilU.uFocus.value.set(x, z);
      veilU.uSpan.value = span;
      cone.position.set(x, 15.7, z);
    },
    /** over (0..1) is how far the ring has unfolded into the final lineup: the ring route, light cone and reflections give way to the ribbon. */
    update(t, px, tone, over = 0) {
      dustMat.uniforms.uTime.value = t;
      dustMat.uniforms.uPx.value = px;
      dustMat.uniforms.uTone.value = tone;
      coneMat.uniforms.uColor.value.setHex(tone > 0.5 ? 0xbfe0ff : 0x7aa6ff);
      routeU.uFade.value = 1 - Math.min(1, over * 2.2);
      route.visible = routeU.uFade.value > 0.01;
      ribbonU.uShow.value = Math.max(0, Math.min(1, (over - 0.35) / 0.5));
      ribbonU.uTime.value = t;
      ribbon.visible = ribbonU.uShow.value > 0.01;
      cone.visible = over < 0.25;
      veilU.uBase.value = highQuality ? 0.6 + 0.4 * over : 1;
    },
    setQuality(high) {
      highQuality = high;
      mirror.visible = high;
      veilU.uBase.value = high ? 0.6 : 1;
    },
    dispose() {
      [mirror, veil, shadow, route, ribbon].forEach((m) => {
        m.geometry.dispose();
        m.material.dispose?.();
      });
      mirror.dispose?.();
    },
  };
}

/** A dark glass plinth with a thin accent ring; `lit` (0..1) brightens the ring when this object is the subject. */
export function createPlinth(pos, color, radius = 5.2) {
  const g = new THREE.Group();
  g.position.set(pos.x, 0, pos.z);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius + 0.45, 0.7, 72), new THREE.MeshStandardMaterial({ color: 0x0b1020, metalness: 0.7, roughness: 0.26 }));
  base.position.y = 0.35;
  base.castShadow = base.receiveShadow = true;
  g.add(base);
  const ringMat = new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity: 0.3 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.055, 8, 160), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.7;
  g.add(ring);
  const inner = new THREE.Mesh(new THREE.RingGeometry(radius - 0.9, radius - 0.84, 128), new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity: 0.12, side: THREE.DoubleSide }));
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.705;
  g.add(inner);
  const target = new THREE.Color(color);
  return {
    group: g,
    ringMat,
    innerMat: inner.material,
    setColor(c) {
      ringMat.color.copy(c);
      inner.material.color.copy(c);
    },
    setLit(v) {
      ringMat.opacity = 0.18 + 0.82 * v;
      inner.material.opacity = 0.06 + 0.3 * v;
    },
    baseColor: target,
    dispose() {
      base.geometry.dispose();
      base.material.dispose();
      ring.geometry.dispose();
      ringMat.dispose();
      inner.geometry.dispose();
      inner.material.dispose();
    },
  };
}
