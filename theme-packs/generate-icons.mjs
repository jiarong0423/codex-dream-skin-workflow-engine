import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

const packs = {
  "knife-shield-dog": {
    palette: {
      dark: "#111820",
      dark2: "#263340",
      accent: "#3ba7ff",
      secondary: "#dce6f0",
      warm: "#e5a945",
      alert: "#ff6b55"
    },
    icons: {
      search: '<path d="M7 14c2.6-4.1 5.6-6 9-6s6.4 1.9 9 6c-2.6 4.1-5.6 6-9 6s-6.4-1.9-9-6Z" fill="url(#accent)" opacity=".9"/><path d="M16 9.5c1.7 2.1 1.7 6.9 0 9-1.7-2.1-1.7-6.9 0-9Z" fill="#081017"/><path d="m22 21 4 4"/>',
      newTask: '<path d="M16 6 24 9v6c0 5-3.2 8.6-8 11-4.8-2.4-8-6-8-11V9l8-3Z" fill="url(#metal)"/><path d="M16 11v9M11.5 15.5h9"/>',
      back: '<path d="M16 6 24 9v6c0 5-3.2 8.6-8 11-4.8-2.4-8-6-8-11V9l8-3Z" fill="url(#metal)"/><path d="m18.5 11.5-4.5 4 4.5 4M14 15.5h7"/>',
      forward: '<path d="M16 6 24 9v6c0 5-3.2 8.6-8 11-4.8-2.4-8-6-8-11V9l8-3Z" fill="url(#metal)"/><path d="m13.5 11.5 4.5 4-4.5 4M11 15.5h7"/>',
      stop: '<path d="m11 6 10 0 5 5v10l-5 5H11l-5-5V11l5-5Z" fill="url(#alert)"/><rect x="12" y="12" width="8" height="8" rx="1"/>',
      settings: '<path d="M16 7v3M16 22v3M7 16h3M22 16h3M9.6 9.6l2.1 2.1M20.3 20.3l2.1 2.1M22.4 9.6l-2.1 2.1M11.7 20.3l-2.1 2.1"/><circle cx="16" cy="16" r="6" fill="url(#metal)"/><circle cx="16" cy="16" r="2.4" fill="#0a1118"/>',
      project: '<path d="M8 24V11l4-4v4l4-4v4l4-4 4 4v13H8Z" fill="url(#metal)"/><path d="M12 24v-5h8v5M11 14h2M15 14h2M19 14h2"/>',
      send: '<path d="m6 24 5-11 14-6-6 14-5-4-8 7Z" fill="url(#accent)"/><path d="m11 13 8 8M14 17l11-10"/>',
      tagTask: '<path d="M7 13 14 6h9l3 3v9l-7 7L7 13Z" fill="url(#metal)"/><circle cx="20.5" cy="10.5" r="1.8" fill="#0b1219"/><path d="m13 16 3 3 5-6"/>',
      files: '<path d="m9 9 7-3 7 3v5l-7 3-7-3V9Z" fill="url(#metal)"/><path d="m9 15 7 3 7-3v5l-7 4-7-4v-5Z" fill="url(#accent)"/>',
      thread: '<path d="M13 11h-2a5 5 0 0 0 0 10h4a5 5 0 0 0 4-2M19 21h2a5 5 0 0 0 0-10h-4a5 5 0 0 0-4 2M11 16h10"/>',
      clean: '<path d="m9 23 9-14 5 3-9 14H8l1-3Z" fill="url(#metal)"/><path d="M8 23h8M18 9l2-3 5 3-2 3"/>',
      run: '<path d="M7 21h8l3-4 5 2-2 5H9l-2-3Z" fill="url(#metal)"/><path d="M8 12h8M6 16h7M18 9l3 3-3 3"/>',
      spark: '<path d="m16 5 2.2 6.8L25 14l-6.8 2.2L16 23l-2.2-6.8L7 14l6.8-2.2L16 5Z" fill="url(#accent)"/><path d="m23 5 .8 2.2L26 8l-2.2.8L23 11l-.8-2.2L20 8l2.2-.8L23 5Z" fill="url(#warm)"/>',
      package: '<path d="m7 11 9-5 9 5v11l-9 5-9-5V11Z" fill="url(#metal)"/><path d="m7 11 9 5 9-5M16 16v11M12 8l9 5"/>',
      trigger: '<circle cx="16" cy="16" r="11" fill="url(#shield)"/><circle cx="16" cy="16" r="8" fill="#76502f" stroke="#d8aa5b"/><circle cx="16" cy="16" r="3.2" fill="url(#metal)"/><path d="M16 8v5M16 19v5M8 16h5M19 16h5" stroke="#d8aa5b" stroke-width="1.1"/>'
    }
  },
  "orbital-stargazer-black-cat": {
    palette: {
      dark: "#101517",
      dark2: "#26302e",
      accent: "#70d7e8",
      secondary: "#eef2dc",
      warm: "#e6b55a",
      alert: "#d87888"
    },
    icons: {
      search: '<path d="M6 15c3-4.6 6.3-6.5 10-6.5s7 1.9 10 6.5c-3 4.6-6.3 6.5-10 6.5S9 19.6 6 15Z" fill="url(#accent)" opacity=".9"/><path d="M16 9.5c1.6 2 1.6 9 0 11-1.6-2-1.6-9 0-11Z" fill="#071011"/><path d="m22 22 4 4"/>',
      newTask: '<ellipse cx="16" cy="18" rx="5" ry="4.5" fill="url(#warm)"/><circle cx="10.5" cy="13" r="2.2" fill="url(#warm)"/><circle cx="15" cy="10.5" r="2.2" fill="url(#warm)"/><circle cx="21" cy="12" r="2.2" fill="url(#warm)"/><path d="M23 19v7M19.5 22.5h7"/>',
      back: '<path d="M22 8c-8 0-12 4-12 9 0 3 2 5 5 5 4 0 6-3 5-7" fill="none"/><path d="m12 9-5 2 3 4"/>',
      forward: '<path d="M10 8c8 0 12 4 12 9 0 3-2 5-5 5-4 0-6-3-5-7" fill="none"/><path d="m20 9 5 2-3 4"/>',
      stop: '<circle cx="16" cy="16" r="9" fill="url(#accent)"/><rect x="12" y="12" width="8" height="8" rx="1.5" fill="#101517" stroke="url(#warm)"/>',
      settings: '<circle cx="16" cy="16" r="8" fill="url(#metal)"/><circle cx="16" cy="16" r="4" fill="#101517"/><path d="M16 5v4M16 23v4M5 16h4M23 16h4"/><circle cx="16" cy="16" r="1.5" fill="url(#accent)"/>',
      project: '<path d="M7 11h8l2 3h8v11H7V11Z" fill="url(#metal)"/><circle cx="18" cy="19" r="4" fill="#101517"/><path d="M18 15c1.8 2.2 1.8 5.8 0 8-1.8-2.2-1.8-5.8 0-8Z" fill="url(#accent)"/>',
      send: '<path d="m6 23 7-15 13-2-3 13-15 7 4-7-6 4Z" fill="url(#accent)"/><path d="m12 19 14-13"/><circle cx="23" cy="9" r="1.5" fill="url(#warm)"/>',
      tagTask: '<path d="M8 13 15 6h8l3 3v8l-7 8L8 13Z" fill="url(#metal)"/><path d="M14 18c4-1 6-4 7-8-4 1-7 3-8 7M14 18l5-5"/>',
      files: '<path d="M8 9h16v6H8V9ZM8 17h16v6H8v-6Z" fill="url(#metal)"/><path d="M11 12h7M11 20h10"/>',
      thread: '<ellipse cx="16" cy="16" rx="10" ry="5.5" fill="none"/><ellipse cx="16" cy="16" rx="5.5" ry="10" fill="none"/><circle cx="23" cy="12" r="2" fill="url(#warm)"/>',
      clean: '<path d="M8 10h12l4 4v10H8V10Z" fill="url(#metal)"/><path d="m10 9 7-3 1 4M11 17h10M12 21h8"/>',
      run: '<path d="M16 6c5 3 7 7 7 11l-4 3-3 7-3-7-4-3c0-4 2-8 7-11Z" fill="url(#metal)"/><circle cx="16" cy="14" r="2.5" fill="#101517"/><path d="m10 21-3 4M22 21l3 4"/>',
      spark: '<path d="m16 5 2.2 6.8L25 14l-6.8 2.2L16 23l-2.2-6.8L7 14l6.8-2.2L16 5Z" fill="url(#warm)"/><circle cx="24" cy="8" r="2" fill="url(#accent)"/>',
      package: '<rect x="8" y="9" width="16" height="15" rx="5" fill="url(#metal)"/><path d="M12 9V7h8v2M11 16h10M16 12v8"/>',
      trigger: '<ellipse cx="16" cy="19" rx="5.8" ry="5" fill="url(#paw)"/><circle cx="8.8" cy="14" r="2.7" fill="url(#paw)"/><circle cx="14" cy="10" r="2.7" fill="url(#paw)"/><circle cx="20.5" cy="10.8" r="2.7" fill="url(#paw)"/><circle cx="24.2" cy="15.3" r="2.5" fill="url(#paw)"/>'
    }
  }
};

function renderSvg(label, palette, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="${label}">
  <defs>
    <linearGradient id="base" x1="6" y1="5" x2="27" y2="27" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${palette.dark2}"/>
      <stop offset="1" stop-color="${palette.dark}"/>
    </linearGradient>
    <linearGradient id="accent" x1="8" y1="7" x2="24" y2="25" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${palette.accent}"/>
      <stop offset="1" stop-color="${palette.secondary}"/>
    </linearGradient>
    <linearGradient id="metal" x1="8" y1="6" x2="24" y2="26" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${palette.secondary}"/>
      <stop offset=".48" stop-color="${palette.dark2}"/>
      <stop offset="1" stop-color="${palette.warm}"/>
    </linearGradient>
    <linearGradient id="warm" x1="9" y1="7" x2="23" y2="25" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${palette.secondary}"/>
      <stop offset=".45" stop-color="${palette.warm}"/>
      <stop offset="1" stop-color="${palette.accent}"/>
    </linearGradient>
    <linearGradient id="alert" x1="8" y1="7" x2="24" y2="25" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${palette.alert}"/>
      <stop offset="1" stop-color="${palette.warm}"/>
    </linearGradient>
    <radialGradient id="shield" cx="35%" cy="28%" r="72%">
      <stop offset="0" stop-color="${palette.secondary}"/>
      <stop offset=".28" stop-color="${palette.warm}"/>
      <stop offset=".34" stop-color="${palette.dark2}"/>
      <stop offset="1" stop-color="${palette.dark}"/>
    </radialGradient>
    <radialGradient id="paw" cx="35%" cy="28%" r="75%">
      <stop offset="0" stop-color="${palette.secondary}"/>
      <stop offset=".48" stop-color="${palette.warm}"/>
      <stop offset="1" stop-color="${palette.accent}"/>
    </radialGradient>
    <filter id="shadow" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="1.2" stdDeviation="1.2" flood-color="#000" flood-opacity=".55"/>
    </filter>
  </defs>
  <circle cx="16" cy="16" r="14" fill="url(#base)" stroke="${palette.accent}" stroke-opacity=".55"/>
  <g fill="none" stroke="${palette.secondary}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" filter="url(#shadow)">${body}</g>
</svg>
`;
}

for (const [packName, pack] of Object.entries(packs)) {
  const outputDir = resolve(root, packName, "runtime", "icons");
  mkdirSync(outputDir, { recursive: true });
  for (const [name, body] of Object.entries(pack.icons)) {
    writeFileSync(resolve(outputDir, `${name}.svg`), renderSvg(`${packName} ${name} icon`, pack.palette, body));
  }
}

console.log("generated separate icon sets for knife-shield-dog and orbital-stargazer-black-cat");
