/**
 * Stable accent colors for remote collaborators (cursor, ring, node highlight).
 */

function hashUid(uid: string): number {
  let h = 0;
  for (let i = 0; i < uid.length; i += 1) {
    h = (Math.imul(31, h) + uid.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export type PeerPresenceAccent = {
  /** SVG / text stroke */
  stroke: string;
  /** Solid fill for pills */
  fill: string;
  /** Softer ring / glow */
  softRing: string;
  /** Light surface for name bubble — same hue as cursor */
  pillBg: string;
};

/** Hue 200–320° — cyan–lavender family, distinct per uid. */
export function uidToPeerAccent(uid: string): PeerPresenceAccent {
  const h = 200 + (hashUid(uid) % 121);
  const s = 72;
  const lStroke = 42;
  const lFill = 48;
  const lSoft = 92;
  const lPill = 93;
  const stroke = `hsl(${h} ${s}% ${lStroke}%)`;
  const fill = `hsl(${h} ${s}% ${lFill}%)`;
  const softRing = `hsl(${h} ${Math.min(s + 8, 85)}% ${lSoft}% / 0.45)`;
  const pillBg = `hsl(${h} ${Math.min(s, 58)}% ${lPill}%)`;
  return {
    stroke,
    fill,
    softRing,
    pillBg,
  };
}
