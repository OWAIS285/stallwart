// Layout and palette for "the loop": five stations on a ring, in story order, each facing the middle. Units are roughly metres.
// The camera stands inside the ring and turns to each station in turn; at the end it lifts out to show the whole loop.
// Palette: near-black stage, matte white clay, one cobalt accent; coral only for the scammer, emerald only for protection.

export const RING = 27;

/** Angle of each station around the ring, in degrees, measured from +z toward +x. The gap between the last and the first is where the loop closes. */
export const ANGLE = { phone: -144, orb: -96, bank: -24, card: 48, families: 120 };

const polar = (deg, r = RING) => {
  const a = (deg * Math.PI) / 180;
  return { x: Math.sin(a) * r, z: Math.cos(a) * r, face: a, deg };
};

export const STATION = Object.fromEntries(Object.entries(ANGLE).map(([name, deg]) => [name, polar(deg)]));

const at = (name, y) => [STATION[name].x, y, STATION[name].z];

// Anchor points in the air that the signal arcs connect.
export const AIR = {
  phoneTop: at("phone", 8.6),
  orb: at("orb", 5.8),
  bankMarker: at("bank", 10.6),
  card: at("card", 5.6),
  familyHub: at("families", 8.4),
};

export const COLORS = {
  bg: 0x04070f,
  clay: 0xeef1f8,
  cobalt: 0x3d6bff,
  sky: 0x7db2ff,
  coral: 0xff5468,
  emerald: 0x2fe0a3,
  safe: 0xf3dcae,
  amber: 0xffb454,
  ice: 0xa9e2ff,
};
