// Original bottle illustrations. They are deliberately generic shapes, not drawings of real
// products: shape and cap are picked from the perfume id, the liquid colour from its family.

export const FAMILY_COLORS = {
  zitrisch: ["#f1d36b", "#d9a92c"],
  aquatisch: ["#8fd0ea", "#3d8db8"],
  aromatisch: ["#b9d39a", "#6f9a55"],
  wuerzig: ["#f0a463", "#c0602b"],
  holzig: ["#c99a6e", "#7d5132"],
  ambriert: ["#f2b960", "#b9741d"],
  gourmand: ["#c98a5c", "#6e3d22"],
  ledrig: ["#9b7a62", "#3f2b20"],
  fruchtig: ["#f08a78", "#c2413a"],
  blumig: ["#f2b3c6", "#c96a8a"],
};

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Body outlines in a 200x260 box; the neck sits on top at y≈70.
const BODIES = [
  // tall rectangle with soft corners
  "M52,82 h96 a14,14 0 0 1 14,14 v136 a14,14 0 0 1 -14,14 h-96 a14,14 0 0 1 -14,-14 v-136 a14,14 0 0 1 14,-14 z",
  // wide flacon
  "M36,104 q0,-22 22,-22 h84 q22,0 22,22 v104 q0,38 -38,38 h-52 q-38,0 -38,-38 z",
  // round
  "M100,82 c48,0 78,36 78,82 c0,46 -30,82 -78,82 c-48,0 -78,-36 -78,-82 c0,-46 30,-82 78,-82 z",
  // faceted
  "M70,82 h60 l34,34 v96 l-34,34 h-60 l-34,-34 v-96 z",
  // slim cylinder
  "M64,82 h72 a12,12 0 0 1 12,12 v140 a12,12 0 0 1 -12,12 h-72 a12,12 0 0 1 -12,-12 v-140 a12,12 0 0 1 12,-12 z",
];
const CAPS = [
  '<rect x="78" y="22" width="44" height="52" rx="6"/>',
  '<rect x="70" y="34" width="60" height="40" rx="20"/>',
  '<path d="M80,74 v-30 a20,20 0 0 1 40,0 v30 z"/>',
  '<path d="M84,74 l-10,-48 h52 l-10,48 z"/>',
  '<rect x="86" y="14" width="28" height="60" rx="4"/>',
];

let uid = 0;

/**
 * SVG string for a bottle. opts.level = fill level 0..1, opts.animate = gentle slosh.
 */
export function bottleSVG(p, { level, animate = true, title = true } = {}) {
  const h = hash(p.id);
  const body = BODIES[h % BODIES.length];
  const cap = CAPS[(h >>> 4) % CAPS.length];
  const [light, deep] = FAMILY_COLORS[p.family] ?? ["#ddd", "#999"];
  const fill = level ?? 0.55 + ((h >>> 8) % 30) / 100;
  const id = `b${++uid}`;
  const metal = (h >>> 12) % 2
    ? '<stop offset="0" stop-color="#6b5530"/><stop offset=".35" stop-color="#e9cf95"/><stop offset=".55" stop-color="#b58d4a"/><stop offset="1" stop-color="#5a4523"/>'
    : '<stop offset="0" stop-color="#4b4b4f"/><stop offset=".35" stop-color="#e6e6ea"/><stop offset=".55" stop-color="#9c9ca3"/><stop offset="1" stop-color="#3c3c40"/>';
  const top = 246 - 164 * fill; // liquid surface y
  const wave = animate
    ? `<animate attributeName="d" dur="${5 + (h % 3)}s" repeatCount="indefinite"
         values="${surface(top, 0)};${surface(top, 1)};${surface(top, 0)}"/>`
    : "";
  return `<svg class="bottle" viewBox="0 0 200 260" ${title ? `role="img" aria-label="Illustration eines Flakons"` : 'aria-hidden="true"'}>
  <defs>
    <clipPath id="${id}c"><path d="${body}"/></clipPath>
    <linearGradient id="${id}l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${deep}"/></linearGradient>
    <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity=".0"/><stop offset=".18" stop-color="#fff" stop-opacity=".55"/>
      <stop offset=".3" stop-color="#fff" stop-opacity=".0"/><stop offset=".82" stop-color="#fff" stop-opacity=".12"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="${id}m" x1="0" y1="0" x2="1" y2="0">${metal}</linearGradient>
    <radialGradient id="${id}r" cx=".5" cy="1" r=".9"><stop offset="0" stop-color="${light}" stop-opacity=".55"/><stop offset="1" stop-color="${light}" stop-opacity="0"/></radialGradient>
  </defs>
  <ellipse cx="100" cy="252" rx="78" ry="7" fill="url(#${id}r)" opacity=".9"/>
  <rect x="88" y="66" width="24" height="18" rx="3" class="neck"/>
  <g class="cap" fill="url(#${id}m)">${cap}</g>
  <g clip-path="url(#${id}c)">
    <rect x="0" y="60" width="200" height="200" fill="${light}" opacity=".13"/>
    <path d="${surface(top, 0)}" fill="url(#${id}l)">${wave}</path>
    <rect x="0" y="60" width="200" height="200" fill="url(#${id}g)"/>
    <rect x="0" y="234" width="200" height="16" fill="#fff" opacity=".16"/>
  </g>
  <path d="${body}" class="rim"/>
</svg>`;
}

function surface(y, phase) {
  const a = phase ? 4 : -4;
  return `M0,${y} C50,${y + a} 150,${y - a} 200,${y} V270 H0 Z`;
}
