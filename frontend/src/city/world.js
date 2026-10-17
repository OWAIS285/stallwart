// Layout and palette for "the loop": five stations on a ring, in story order, each facing the middle. Units are roughly metres.
// The camera stands inside the ring and turns to each station in turn. In the last scene the ring unfolds into one wide, shallow arc
// (OVERVIEW) so all five stations stand side by side, in story order, facing the viewer.
// Palette follows the site: black and blue, silver for the caller. Coral appears only on the scammer's phone.

export const RING = 27;

/** Angle of each station around the ring, in degrees, measured from +z toward +x. The gap between the last and the first is where the loop closes. */
export const ANGLE = { phone: -144, orb: -96, bank: -24, card: 48, families: 120 };

const polar = (deg, r = RING) => {
  const a = (deg * Math.PI) / 180;
  return { x: Math.sin(a) * r, z: Math.cos(a) * r, face: a, deg };
};

export const STATION = Object.fromEntries(Object.entries(ANGLE).map(([name, deg]) => [name, polar(deg)]));

// The last scene's lineup: Stallwart AI at the heart, the catching side (scam call, bank alert) on its left and the protecting side (strain, families) on its right,
// along a gentle arc that bows toward the viewer, each station a little larger than on the ring and the AI the largest.
export const ARC_X = { phone: -43, bank: -21.5, orb: 0, card: 21.5, families: 43 };
export const arcZ = (x) => 9 - 0.0066 * x * x;
export const OVERVIEW = Object.fromEntries(Object.entries(ARC_X).map(([name, x]) => [name, { x, z: arcZ(x) }]));
export const OVERVIEW_SCALE = { phone: 1.3, orb: 1.55, bank: 1.08, card: 1.3, families: 0.86 };

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
  horizon: 0x081a3c,
  clay: 0xeef1f8,
  cobalt: 0x3d6bff,
  sky: 0x7db2ff,
  coral: 0xff5468,
  safe: 0xbfe0ff,
  amber: 0xffb454,
  ice: 0xa9e2ff,
};
