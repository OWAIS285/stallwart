// Signal arcs: a crisp coloured tube that draws itself along a curve, with white-rimmed beads riding it.
import * as THREE from "three";

const TUBE_VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const TUBE_FRAG = /* glsl */ `
uniform float uProg, uTime, uOpacity, uFlow;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float u = vUv.x;
  float shown = step(u, uProg);
  float dash = smoothstep(0.35, 0.65, sin(u * 150.0 - uTime * uFlow) * 0.5 + 0.5);
  float head = exp(-pow((uProg - u) * 20.0, 2.0)) * step(u, uProg + 0.002);
  float a = shown * (0.55 + 0.45 * dash) * uOpacity;
  vec3 col = mix(uColor, vec3(1.0), head * 0.7);
  if (a < 0.02) discard;
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;

export function createArc({ from, to, lift = 14, color = 0xff4d5e, radius = 0.1, packets = 8, bead = 0.3, flow = 5 }) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const mid = a.clone().lerp(b, 0.5);
  mid.y += lift;
  const c1 = a.clone().lerp(mid, 0.55);
  c1.y += lift * 0.15;
  const c2 = b.clone().lerp(mid, 0.55);
  c2.y += lift * 0.15;
  const curve = new THREE.CubicBezierCurve3(a, c1, c2, b);
  const col = new THREE.Color(color);

  const tubeMat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { uProg: { value: 0 }, uTime: { value: 0 }, uOpacity: { value: 1 }, uFlow: { value: flow }, uColor: { value: new THREE.Vector3(col.r, col.g, col.b) } },
    vertexShader: TUBE_VERT,
    fragmentShader: TUBE_FRAG,
  });
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 110, radius, 8, false), tubeMat);
  tube.frustumCulled = false;

  const rim = new THREE.InstancedMesh(new THREE.SphereGeometry(bead * 1.25, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }), packets);
  const core = new THREE.InstancedMesh(new THREE.SphereGeometry(bead, 14, 10), new THREE.MeshBasicMaterial({ color }), packets);
  rim.frustumCulled = core.frustumCulled = false;
  const phase = Float32Array.from({ length: packets }, (_, i) => i / packets);
  const m = new THREE.Matrix4();
  const tmp = new THREE.Vector3();
  const group = new THREE.Group();
  group.add(tube, rim, core);

  return {
    group,
    curve,
    /** progress 0..1 draws the tube; speed is how fast beads travel; level fades the whole arc. */
    update(t, progress, level = 1, speed = 0.12) {
      group.visible = progress > 0.001 && level > 0.01;
      if (!group.visible) return;
      tubeMat.uniforms.uProg.value = progress;
      tubeMat.uniforms.uTime.value = t;
      tubeMat.uniforms.uOpacity.value = level;
      for (let i = 0; i < packets; i++) {
        const u = (phase[i] + t * speed) % 1;
        curve.getPoint(u * progress, tmp);
        const grow = Math.sin(Math.PI * Math.min(1, u * 1.02)) * level * (progress > 0.02 ? 1 : 0);
        m.makeScale(Math.max(0.001, grow), Math.max(0.001, grow), Math.max(0.001, grow)).setPosition(tmp);
        rim.setMatrixAt(i, m);
        core.setMatrixAt(i, m);
      }
      rim.instanceMatrix.needsUpdate = core.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      tube.geometry.dispose();
      tubeMat.dispose();
      rim.geometry.dispose();
      core.geometry.dispose();
      rim.material.dispose();
      core.material.dispose();
    },
  };
}
