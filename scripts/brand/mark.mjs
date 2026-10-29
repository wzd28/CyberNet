// The CyberNet AI mark: one geometry, four optical weights. Single source for every raster icon
// (scripts/render-icons.mjs), public/cybernet-mark.svg and the CSS mask tokens in
// ui-src/css/00-tokens.css (--cn-mark-sm, --cn-mark-xs). The inline SVGs in public/index.html are
// written out by hand from the same numbers; ui-src/DESIGN.md "Brand mark" has the table.
//
// Geometry (viewBox 0 0 24 26):
//   shield  six points, stroked, round joins and round caps. The outline STARTS AT THE BOTTOM POINT
//           (12,24), so the top point is always a real corner: a dashed draw (the sign-in gate) never
//           puts its two line ends at the top, and a closed path joins there like at any other corner.
//   shackle an arc on two legs, stroked, round caps (its legs end inside the body).
//   body    a rounded rectangle, filled; the standard weights cut a keyhole out of it (even-odd), so
//           the hole shows whatever is behind the mark.

export const SHIELD_D = "M12 24 L4 15 L3 6 L12 2 L21 6 L20 15 Z";
export const CYAN = "#22D3EE";

const BODY = { x: 8.3, y: 12.5, w: 7.4, h: 6.2, r: 1.2 };
const SHACKLE_D = "M9.6 12.5v-2.3a2.4 2.4 0 0 1 4.8 0v2.3";
// keyhole: a circle (12, 15.2) r 1 over a slot 1 wide that ends round at y 17.8
const KEYHOLE_D = "M11.5 16.066A1 1 0 1 1 12.5 16.066V17.3A.5 .5 0 0 1 11.5 17.3Z";

export const WEIGHTS = {
  // 40 px and up: the Business loader (40x44), raster icons of 96 px and up
  standard: { outline: 1.8, shackle: 1.6, body: BODY, shackleD: SHACKLE_D, keyhole: true },
  // the sign-in gate (34 to 116 px): a finer line for the big drawn mark
  gate: { outline: 1.3, shackle: 1.3, body: BODY, shackleD: SHACKLE_D, keyhole: true },
  // 20 to 36 px (header, dialogs, footer, legal pages, Pricing, favicon 32/48): heavier line, solid lock
  small: { outline: 2, shackle: 1.8, body: BODY, shackleD: SHACKLE_D, keyhole: false },
  // 18 px and under (favicon 16, the About footnote): heavier still, a larger lock with a tighter shackle
  micro: { outline: 2.6, shackle: 2.1, body: { x: 8.1, y: 12.4, w: 7.8, h: 6.6, r: 1.3 }, shackleD: "M9.7 12.4v-2.1a2.3 2.3 0 0 1 4.6 0v2.1", keyhole: false },
};

const n = (v) => String(Math.round(v * 1000) / 1000);
function bodyD({ x, y, w, h, r }) {
  const R = x + w, B = y + h;
  return `M${n(x + r)} ${n(y)}H${n(R - r)}A${n(r)} ${n(r)} 0 0 1 ${n(R)} ${n(y + r)}V${n(B - r)}A${n(r)} ${n(r)} 0 0 1 ${n(R - r)} ${n(B)}H${n(x + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(B - r)}V${n(y + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}Z`;
}

/** The mark's inner elements (no <svg> wrapper) in one colour. */
export function markInner(weight = "standard", color = CYAN) {
  const w = WEIGHTS[weight];
  if (!w) throw new Error(`unknown mark weight: ${weight}`);
  const body = w.keyhole
    ? `<path d="${bodyD(w.body)}${KEYHOLE_D}" fill="${color}" fill-rule="evenodd"/>`
    : `<rect x="${n(w.body.x)}" y="${n(w.body.y)}" width="${n(w.body.w)}" height="${n(w.body.h)}" rx="${n(w.body.r)}" fill="${color}"/>`;
  return `<path d="${SHIELD_D}" stroke="${color}" stroke-width="${w.outline}" stroke-linejoin="round" stroke-linecap="round"/>`
    + `<path d="${w.shackleD}" stroke="${color}" stroke-width="${w.shackle}" stroke-linecap="round"/>`
    + body;
}

/** A standalone SVG document. `box` places the 24x26 viewBox inside a larger canvas: {w, h, x, y, s}
 *  (canvas size, top-left of the viewBox and its scale, in canvas units); `bg` paints the canvas.
 *  `glow` ({color, blur, opacity}, with a box only; blur in canvas px) lays a soft light of the mark's
 *  own shape under it, the way the round badge artwork draws its mark. */
export function markSvg(weight = "standard", { color = CYAN, box = null, bg = null, glow = null } = {}) {
  if (!box) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 26" fill="none">${markInner(weight, color)}</svg>`;
  const { w, h, x, y, s } = box;
  const mark = `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})">${markInner(weight, color)}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none">`
    + (bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : "")
    + (glow
      ? `<filter id="cn-glow" filterUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}" color-interpolation-filters="sRGB">`
        + `<feGaussianBlur in="SourceAlpha" stdDeviation="${glow.blur}" result="b"/><feFlood flood-color="${glow.color}" flood-opacity="${glow.opacity}"/>`
        + `<feComposite in2="b" operator="in" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
        + `<g filter="url(#cn-glow)">${mark}</g>`
      : mark)
    + `</svg>`;
}

/** The CSS mask token (black on transparent, URL-encoded the way ui-src/css writes data URIs). */
export function markMaskUri(weight) {
  const svg = markSvg(weight, { color: "#000" }).replace(/"/g, "'");
  return `url("data:image/svg+xml,${svg.replace(/#/g, "%23").replace(/</g, "%3C").replace(/>/g, "%3E")}")`;
}

/** Drawn extent of the mark in viewBox units (the stroke included): left, top, right, bottom. */
export function markExtent(weight = "standard") {
  const h = WEIGHTS[weight].outline / 2;
  // round joins: the outline reaches exactly half a stroke beyond each point
  return { l: 3 - h, t: 2 - h, r: 21 + h, b: 24 + h };
}
