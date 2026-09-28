import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Original, resolution-independent artwork for the six badminton badge families
// that do not use generated PNGs. Run from any directory with:
// node scripts/generate-achievement-enamel-svg.mjs
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "public", "achievements", "enamel");
mkdirSync(output, { recursive: true });

const tiers = {
  bronze: { light: "#fff1d6", mid: "#d88e50", dark: "#84442c", edge: "#653923", glint: "#ffe8be" },
  silver: { light: "#ffffff", mid: "#b8c7d0", dark: "#647486", edge: "#455568", glint: "#f0fbff" },
  gold: { light: "#fff6c0", mid: "#edbc42", dark: "#95600a", edge: "#6b4211", glint: "#fff2a1" },
};

const star = (x, y, r = 7) => `<path d="M${x} ${y-r} Q${x+r*.18} ${y-r*.18} ${x+r} ${y} Q${x+r*.18} ${y+r*.18} ${x} ${y+r} Q${x-r*.18} ${y+r*.18} ${x-r} ${y} Q${x-r*.18} ${y-r*.18} ${x} ${y-r}Z" fill="url(#metal)" stroke="__EDGE__" stroke-width="1.5"/><path d="M${x} ${y-r*.55} V${y+r*.55} M${x-r*.55} ${y} H${x+r*.55}" stroke="white" stroke-width="1.3" stroke-linecap="round" opacity=".85"/>`;

function shuttlecock(x, y, scale = 1, rotate = 0) {
  return `<g transform="translate(${x} ${y}) rotate(${rotate}) scale(${scale})">
    <path d="M-11 11 -29 -25 Q-20 -31 -11 -21 L-3 -5 -5 -31 Q0 -36 5 -31 L3 -5 11 -21 Q20 -31 29 -25 L11 11Z" fill="url(#ivory)" stroke="url(#metal)" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M-21 -22 -8 8 M0 -29 0 7 M21 -22 8 8 M-10 -21 0 8 M10 -21 0 8" fill="none" stroke="#87a3ad" stroke-width="1.7" opacity=".8"/>
    <path d="M-13 7 Q0 0 13 7 L10 19 Q0 25 -10 19Z" fill="url(#coral)" stroke="url(#metal)" stroke-width="3.5"/>
    <path d="M-8 10 Q0 7 7 10" fill="none" stroke="white" stroke-width="1.8" opacity=".8"/>
  </g>`;
}

function racket(x, y, rotate) {
  return `<g transform="translate(${x} ${y}) rotate(${rotate})">
    <path d="M0 13 V66" stroke="__EDGE__" stroke-width="13" stroke-linecap="round"/>
    <path d="M0 13 V66" stroke="url(#metal)" stroke-width="9" stroke-linecap="round"/>
    <path d="M0 39 V65" stroke="url(#purple)" stroke-width="6" stroke-linecap="round"/>
    <ellipse cy="-18" rx="28" ry="42" fill="url(#teal)" stroke="__EDGE__" stroke-width="9"/>
    <ellipse cy="-18" rx="28" ry="42" fill="none" stroke="url(#metal)" stroke-width="6"/>
    <path d="M-17 -47 V11 M-8 -55 V17 M0 -57 V21 M8 -55 V17 M17 -47 V11 M-23 -39 H23 M-27 -27 H27 M-26 -15 H26 M-23 -3 H23" stroke="#d7eef0" stroke-width="1.8" opacity=".75"/>
    <path d="M-18 -44 Q-3 -54 12 -46" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" opacity=".8"/>
  </g>`;
}

function motif(id, tier) {
  const n = ["bronze", "silver", "gold"].indexOf(tier) + 1;
  switch (id) {
    case "on-the-board":
      return `<g>
        <rect x="54" y="64" width="148" height="130" rx="22" fill="__EDGE__"/>
        <rect x="58" y="68" width="140" height="122" rx="19" fill="url(#metal)"/>
        <rect x="66" y="76" width="124" height="106" rx="14" fill="url(#purple)" stroke="__GLINT__" stroke-width="2"/>
        <path d="M88 127 113 151 169 96" fill="none" stroke="__EDGE__" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M88 127 113 151 169 96" fill="none" stroke="url(#metal)" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M91 123 112 143 164 94" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" opacity=".75"/>
        ${shuttlecock(169, 173, .46, 30)}
        ${Array.from({length:n}, (_, i) => star(88 + i*20, 91, 4.5)).join("")}
      </g>`;
    case "down-to-wire":
      return `<g>
        <path d="M84 55 H172 M84 201 H172" stroke="__EDGE__" stroke-width="15" stroke-linecap="round"/>
        <path d="M84 55 H172 M84 201 H172" stroke="url(#metal)" stroke-width="11" stroke-linecap="round"/>
        <path d="M93 61 C91 93 105 109 123 126 C103 145 91 163 93 195 H163 C165 163 153 145 133 126 C151 109 165 93 163 61Z" fill="url(#teal)" stroke="__EDGE__" stroke-width="7"/>
        <path d="M97 64 C97 92 109 108 128 123 C147 108 159 92 159 64Z" fill="url(#purple)" opacity=".9"/>
        <path d="M99 190 C99 161 113 147 128 132 C143 147 157 161 157 190Z" fill="url(#coral)"/>
        <path d="M105 77 Q128 94 151 77 M105 178 Q128 161 151 178" fill="none" stroke="__GLINT__" stroke-width="4" stroke-linecap="round" opacity=".9"/>
        <path d="M128 111 V141" stroke="url(#metal)" stroke-width="5" stroke-linecap="round"/>
        ${shuttlecock(179, 160, .49, 22)}
        ${Array.from({length:n}, (_, i) => star(69 + i*17, 151, 5)).join("")}
      </g>`;
    case "clean-sweep":
      return `<g>
        <path d="M60 180 Q118 215 190 177" fill="none" stroke="url(#teal)" stroke-width="11" stroke-linecap="round" opacity=".85"/>
        <path d="M164 56 97 153" stroke="__EDGE__" stroke-width="17" stroke-linecap="round"/>
        <path d="M164 56 97 153" stroke="url(#metal)" stroke-width="12" stroke-linecap="round"/>
        <path d="M162 62 101 148" stroke="white" stroke-width="2" stroke-linecap="round" opacity=".8"/>
        <path d="M93 146 Q112 145 130 160 L113 192 Q84 208 54 185Z" fill="url(#coral)" stroke="__EDGE__" stroke-width="7" stroke-linejoin="round"/>
        <path d="M93 146 Q112 145 130 160 L113 192 Q84 208 54 185Z" fill="none" stroke="url(#metal)" stroke-width="4" stroke-linejoin="round"/>
        <path d="M64 183 96 151 M75 191 104 153 M87 195 112 157 M100 195 119 163" stroke="__GLINT__" stroke-width="2.5" opacity=".7"/>
        ${shuttlecock(170, 135, .68, -26)}
        ${Array.from({length:n}, (_, i) => star(152 + i*18, 183 - i*10, 5.5)).join("")}
      </g>`;
    case "raising-bar":
      return `<g>
        <path d="M63 189 H194" stroke="__EDGE__" stroke-width="10" stroke-linecap="round"/>
        <path d="M63 189 H194" stroke="url(#metal)" stroke-width="7" stroke-linecap="round"/>
        <rect x="68" y="143" width="27" height="44" rx="5" fill="url(#teal)" stroke="url(#metal)" stroke-width="4"/>
        <rect x="111" y="113" width="27" height="74" rx="5" fill="url(#coral)" stroke="url(#metal)" stroke-width="4"/>
        <rect x="154" y="77" width="27" height="110" rx="5" fill="url(#amber)" stroke="url(#metal)" stroke-width="4"/>
        <path d="M75 151 V180 M118 122 V180 M161 86 V180" stroke="white" stroke-width="2.5" opacity=".6"/>
        <path d="M60 137 104 111 131 119 187 56" fill="none" stroke="__EDGE__" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M60 137 104 111 131 119 187 56" fill="none" stroke="url(#metal)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M170 56 H189 V75" fill="none" stroke="url(#metal)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
        ${Array.from({length:n}, (_, i) => star(81 + i*21, 72, 5.5)).join("")}
      </g>`;
    case "good-together":
      return `<g>
        ${racket(100, 121, -28)}
        ${racket(156, 121, 28)}
        ${shuttlecock(128, 145, .63, 0)}
        ${Array.from({length:n}, (_, i) => star(107 + i*21, 54, 6)).join("")}
      </g>`;
    case "making-it-happen":
      return `<g>
        <path d="M77 114 164 70 Q176 66 176 78 V145 Q176 154 164 150 L77 129Z" fill="url(#coral)" stroke="__EDGE__" stroke-width="8" stroke-linejoin="round"/>
        <path d="M77 114 164 70 Q176 66 176 78 V145 Q176 154 164 150 L77 129Z" fill="none" stroke="url(#metal)" stroke-width="5" stroke-linejoin="round"/>
        <ellipse cx="78" cy="122" rx="17" ry="22" fill="url(#teal)" stroke="url(#metal)" stroke-width="6"/>
        <path d="M85 143 96 181 H119 L107 141" fill="url(#teal)" stroke="__EDGE__" stroke-width="7" stroke-linejoin="round"/>
        <path d="M90 149 99 175 H112" fill="none" stroke="url(#metal)" stroke-width="4"/>
        <path d="M190 88 204 78 M193 109 H211 M190 131 204 141" stroke="url(#metal)" stroke-width="7" stroke-linecap="round"/>
        <path d="M64 197 H192 M74 184 H182 M91 173 H165" stroke="__GLINT__" stroke-width="3" opacity=".8"/>
        ${shuttlecock(170, 176, .45, -35)}
        ${Array.from({length:n}, (_, i) => star(91 + i*20, 70, 5)).join("")}
      </g>`;
  }
}

const frame = "M128 12 C146 28 174 25 190 43 C211 47 220 68 222 87 C237 106 237 150 222 169 C220 188 211 209 190 213 C174 231 146 228 128 244 C110 228 82 231 66 213 C45 209 36 188 34 169 C19 150 19 106 34 87 C36 68 45 47 66 43 C82 25 110 28 128 12Z";

function svg(id, tier) {
  const metal = tiers[tier];
  const artwork = motif(id, tier).replaceAll("__EDGE__", metal.edge).replaceAll("__GLINT__", metal.glint);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="${id.replaceAll("-", " ")} ${tier} enamel badge">
  <defs>
    <linearGradient id="metal" x1="0%" y1="0%" x2="100%" y2="100%"><stop stop-color="${metal.light}"/><stop offset=".36" stop-color="${metal.mid}"/><stop offset=".58" stop-color="${metal.dark}"/><stop offset=".78" stop-color="${metal.light}"/><stop offset="1" stop-color="${metal.mid}"/></linearGradient>
    <linearGradient id="ivory" x1="0%" y1="0%" x2="100%" y2="100%"><stop stop-color="#ffffff"/><stop offset=".6" stop-color="#e5eee8"/><stop offset="1" stop-color="#a9bbc2"/></linearGradient>
    <radialGradient id="purple" cx="35%" cy="24%" r="95%"><stop stop-color="#823268"/><stop offset=".54" stop-color="#511447"/><stop offset="1" stop-color="#27102f"/></radialGradient>
    <linearGradient id="teal" x1="0%" y1="0%" x2="100%" y2="100%"><stop stop-color="#b2f8dc"/><stop offset=".28" stop-color="#29b7a6"/><stop offset=".7" stop-color="#08746f"/><stop offset="1" stop-color="#064d59"/></linearGradient>
    <linearGradient id="coral" x1="0%" y1="0%" x2="100%" y2="100%"><stop stop-color="#ffd0ab"/><stop offset=".35" stop-color="#f57970"/><stop offset=".8" stop-color="#bd3d61"/><stop offset="1" stop-color="#812751"/></linearGradient>
    <linearGradient id="amber" x1="0%" y1="0%" x2="100%" y2="100%"><stop stop-color="#fff4b4"/><stop offset=".45" stop-color="#ffbf37"/><stop offset="1" stop-color="#a85711"/></linearGradient>
    <filter id="shadow" x="-25%" y="-25%" width="150%" height="160%"><feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#24132d" flood-opacity=".34"/></filter>
  </defs>
  <g filter="url(#shadow)">
    <path d="${frame}" fill="${metal.edge}"/>
    <path d="${frame}" transform="translate(128 128) scale(.975) translate(-128 -128)" fill="url(#metal)"/>
    <path d="${frame}" transform="translate(128 128) scale(.84) translate(-128 -128)" fill="url(#purple)" stroke="${metal.glint}" stroke-width="4"/>
    <path d="M55 83 Q128 20 201 83" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" opacity=".52"/>
    <path d="M47 176 Q128 234 209 176" fill="none" stroke="${metal.dark}" stroke-width="4" stroke-linecap="round" opacity=".65"/>
    ${artwork}
    <path d="M45 107 Q35 128 45 149" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" opacity=".5"/>
  </g>
</svg>\n`;
}

const families = ["on-the-board", "down-to-wire", "clean-sweep", "raising-bar", "good-together", "making-it-happen"];
for (const family of families) {
  for (const tier of Object.keys(tiers)) {
    writeFileSync(join(output, `${family}-${tier}.svg`), svg(family, tier));
  }
}
