export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const seg = (a, b, v) => clamp01((v - a) / (b - a));
export const sstep = (a, b, v) => {
  const t = seg(a, b, v);
  return t * t * (3 - 2 * t);
};
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** Overshooting ease: pops past 1 and settles. */
export const easeBack = (t) => {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

/** Small seeded generator so the city looks the same on every visit. */
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cubic Hermite through keys [{p, v:[...]}]; tangents from neighbours keep the motion continuous. */
export function hermite(keys, p, out) {
  let i = 0;
  while (i < keys.length - 2 && p > keys[i + 1].p) i++;
  const k0 = keys[Math.max(0, i - 1)];
  const k1 = keys[i];
  const k2 = keys[i + 1];
  const k3 = keys[Math.min(keys.length - 1, i + 2)];
  const dt = k2.p - k1.p;
  const t = clamp01((p - k1.p) / dt);
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  const tension = 0.85;
  for (let c = 0; c < out.length; c++) {
    const m1 = ((k2.v[c] - k0.v[c]) / Math.max(1e-4, k2.p - k0.p)) * tension;
    const m2 = ((k3.v[c] - k1.v[c]) / Math.max(1e-4, k3.p - k1.p)) * tension;
    out[c] = h00 * k1.v[c] + h10 * dt * m1 + h01 * k2.v[c] + h11 * dt * m2;
  }
  return out;
}
