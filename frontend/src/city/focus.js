// Depth of field: the scene is drawn once into an offscreen target with its depth, then a single pass blurs everything away from the subject.
// The sharp zone sits on whatever the camera is looking at, so each scene keeps its focus and the rest of the loop softens behind and in front of it.
import * as THREE from "three";

const VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform float uNear, uFar, uFocus, uSlab, uRange, uMaxBlur;
varying vec2 vUv;

float viewDist(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }
float blurAt(float z) { return z > uFar * 0.9 ? 0.0 : smoothstep(0.0, 1.0, (abs(z - uFocus) - uSlab) / uRange); }

void main() {
  float c0 = blurAt(viewDist(vUv));
  float radius = max(c0 * uMaxBlur, 0.9);
  vec3 acc = texture2D(tColor, vUv).rgb;
  float sum = 1.0;
  for (int i = 1; i < 30; i++) {
    float fi = float(i);
    float r = sqrt(fi / 30.0) * radius;
    float a = fi * 2.39996323;
    vec2 uv = vUv + vec2(cos(a), sin(a)) * r * uTexel;
    float ct = blurAt(viewDist(uv));
    // a sharper neighbour must not smear over a blurred pixel: it only counts if its own blur would reach here
    float w = max(clamp(ct * uMaxBlur / max(r, 1.0), 0.0, 1.0), step(r, 1.2));
    acc += texture2D(tColor, uv).rgb * w;
    sum += w;
  }
  gl_FragColor = vec4(acc / sum, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createFocus(renderer) {
  let target = null;
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tColor: { value: null },
      tDepth: { value: null },
      uTexel: { value: new THREE.Vector2(1, 1) },
      uNear: { value: 1 },
      uFar: { value: 800 },
      uFocus: { value: 50 },
      uSlab: { value: 14 },
      uRange: { value: 50 },
      uMaxBlur: { value: 8 },
    },
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const post = new THREE.Scene();
  post.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const size = new THREE.Vector2();

  function build() {
    target?.depthTexture?.dispose();
    target?.dispose();
    renderer.getDrawingBufferSize(size);
    const ss = size.x * size.y < 2.2e6 ? 1.35 : 1;
    const w = Math.max(2, Math.round(size.x * ss));
    const h = Math.max(2, Math.round(size.y * ss));
    const depth = new THREE.DepthTexture(w, h);
    depth.type = THREE.UnsignedIntType;
    target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthTexture: depth, depthBuffer: true, samples: 0 });
    target.texture.minFilter = target.texture.magFilter = THREE.LinearFilter;
    material.uniforms.tColor.value = target.texture;
    material.uniforms.tDepth.value = depth;
    material.uniforms.uTexel.value.set(1 / w, 1 / h);
    return ss;
  }
  let supersample = build();

  return {
    /** Call after the renderer's size or pixel ratio changes. */
    resize() {
      supersample = build();
    },
    /** focus: distance to the subject; spread 0..1 relaxes the blur for the zoomed-out view. */
    render(scene, camera, { focus, spread = 0 }) {
      const u = material.uniforms;
      u.uNear.value = camera.near;
      u.uFar.value = camera.far;
      u.uFocus.value = focus;
      u.uSlab.value = 9 + focus * 0.08 + spread * 90;
      u.uRange.value = 28 + focus * 0.42 + spread * 140;
      u.uMaxBlur.value = (size.y / 900) * supersample * 13 * (1 - 0.8 * spread);
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(post, cam);
    },
    dispose() {
      target?.depthTexture?.dispose();
      target?.dispose();
      material.dispose();
      quad.geometry.dispose();
    },
  };
}
