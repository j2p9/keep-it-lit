// Renders the app logo (an original flame with a check mark) to every icon and launch-screen size
// iOS and Android use. Run with: npm run icons
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const flame = `
  <path d="M548 130C600 268 790 380 790 610C790 772 665 890 512 890C359 890 234 772 234 618C234 520 280 440 336 384C336 450 360 500 404 528C392 380 440 250 548 130Z" fill="url(#outer)"/>
  <path d="M520 432C560 522 680 582 680 714C680 802 606 858 512 858C418 858 344 802 344 718C344 642 392 592 440 550C444 602 462 634 492 650C482 582 488 502 520 432Z" fill="url(#inner)"/>
  <path d="M428 712L490 772L604 646" fill="none" stroke="#5A1E06" stroke-width="54" stroke-linecap="round" stroke-linejoin="round"/>`;

const iconDefs = `
    <radialGradient id="bg" cx="50%" cy="34%" r="80%">
      <stop offset="0" stop-color="#3E1B10"/>
      <stop offset="0.55" stop-color="#1B0F0C"/>
      <stop offset="1" stop-color="#0E0807"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#FF7A1A" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#FF7A1A" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="outer" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFD37A"/>
      <stop offset="0.45" stop-color="#FF8A1F"/>
      <stop offset="1" stop-color="#FF3D6E"/>
    </linearGradient>
    <linearGradient id="inner" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFF7DC"/>
      <stop offset="1" stop-color="#FFC45A"/>
    </linearGradient>`;

/** The icon artwork in a 1024 box. `scale` shrinks the flame (maskable icons need a safe zone). */
function iconBody({ scale = 1, rounded = false } = {}) {
  const t = `translate(512 540) scale(${scale}) translate(-512 -540)`;
  return `<defs>${iconDefs}</defs>
  <rect width="1024" height="1024" ${rounded ? 'rx="229"' : ''} fill="url(#bg)"/>
  <circle cx="512" cy="640" r="440" fill="url(#glow)" transform="${t}"/>
  <g transform="${t}">${flame}</g>`;
}

const iconSvg = (opts) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${iconBody(opts)}</svg>`;

// Monochrome silhouette for Android's small notification badge.
const badgeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <path transform="translate(512 512) scale(1.05) translate(-512 -510)" d="M548 130C600 268 790 380 790 610C790 772 665 890 512 890C359 890 234 772 234 618C234 520 280 440 336 384C336 450 360 500 404 528C392 380 440 250 548 130Z" fill="#fff"/>
</svg>`;

/** Launch screen shown while the Home Screen app opens: the logo, the name and the tagline. */
function splashSvg(w, h) {
  const s = Math.round(w * 0.34);
  const x = Math.round((w - s) / 2);
  const y = Math.round(h * 0.4 - s / 2);
  const r = Math.round(s * 0.2237);
  const title = Math.round(w * 0.082);
  const tag = Math.round(w * 0.037);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <radialGradient id="screenGlow" cx="50%" cy="38%" r="60%">
      <stop offset="0" stop-color="#FF7A1A" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#FF7A1A" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="iconShape"><rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${r}"/></clipPath>
    <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="${Math.round(s * 0.08)}"/>
    </filter>
  </defs>
  <rect width="${w}" height="${h}" fill="#110C0B"/>
  <rect width="${w}" height="${h}" fill="url(#screenGlow)"/>
  <rect x="${x}" y="${y + s * 0.08}" width="${s}" height="${s}" rx="${r}" fill="#FF5A28" opacity="0.45" filter="url(#shadow)"/>
  <g clip-path="url(#iconShape)">
    <svg x="${x}" y="${y}" width="${s}" height="${s}" viewBox="0 0 1024 1024">${iconBody()}</svg>
  </g>
  <text x="${w / 2}" y="${y + s + title * 1.75}" text-anchor="middle" font-family="Segoe UI, Helvetica Neue, Arial, sans-serif"
    font-weight="800" font-size="${title}" letter-spacing="${-title * 0.02}" fill="#FBF4EF">Keep It Lit</text>
  <text x="${w / 2}" y="${y + s + title * 1.75 + tag * 1.9}" text-anchor="middle" font-family="Segoe UI, Helvetica Neue, Arial, sans-serif"
    font-weight="500" font-size="${tag}" fill="#FBF4EF" fill-opacity="0.6">Small daily wins. Big streaks.</text>
</svg>`;
}

// Icons for Android's long-press shortcuts (manifest "shortcuts"), drawn like the tab bar icons.
const SHORTCUT_GLYPHS = {
  today:
    '<path d="M12 2.8c.6 3.2-1.3 5-2.8 6.6C7.8 11 6.8 12.6 6.8 15a5.2 5.2 0 0 0 10.4 0c0-2-.9-3.6-2-4.8-.3 1.4-1 2.3-2.1 2.7.5-3.2-.2-6.8-1.1-10.1Z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  progress: '<path d="M5 20v-7M10 20V6M15 20v-9M20 20V4"/>',
  awards: '<circle cx="12" cy="14.5" r="5.5"/><path d="M8.6 10 6 3.2h4L12 7.6l2-4.4h4L15.4 10"/>',
};
const shortcutSvg = (glyph) => `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
  <defs>
    <linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="24" y2="24">
      <stop offset="0" stop-color="#FFC15A"/><stop offset="0.5" stop-color="#FF7A1A"/><stop offset="1" stop-color="#FF3D6E"/>
    </linearGradient>
  </defs>
  <rect width="192" height="192" fill="#1B1513"/>
  <g transform="translate(42 42) scale(4.5)" fill="none" stroke="url(#g)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>
</svg>`;

// iPhone screens in points (portrait) and pixel ratio. Keep in sync with index.html.
export const SPLASH_SCREENS = [
  [440, 956, 3],
  [420, 912, 3],
  [402, 874, 3],
  [430, 932, 3],
  [393, 852, 3],
  [428, 926, 3],
  [390, 844, 3],
  [375, 812, 3],
  [414, 896, 3],
  [414, 896, 2],
  [414, 736, 3],
  [375, 667, 2],
];

await mkdir('public/icons', { recursive: true });
await mkdir('public/splash', { recursive: true });
await writeFile('public/icons/favicon.svg', iconSvg({ rounded: true }));

const icons = [
  ['apple-touch-icon.png', 180, iconSvg()],
  ['apple-touch-icon-167.png', 167, iconSvg()],
  ['apple-touch-icon-152.png', 152, iconSvg()],
  ['apple-touch-icon-120.png', 120, iconSvg()],
  ['icon-192.png', 192, iconSvg()],
  ['icon-512.png', 512, iconSvg()],
  ['icon-maskable-512.png', 512, iconSvg({ scale: 0.78 })],
  ['badge-72.png', 72, badgeSvg],
];
for (const [name, size, svg] of icons) {
  await sharp(Buffer.from(svg)).resize(size, size).flatten({ background: '#0E0807' }).png().toFile(`public/icons/${name}`);
  console.log(`public/icons/${name}`);
}
// The badge must keep its transparency.
await sharp(Buffer.from(badgeSvg)).resize(72, 72).png().toFile('public/icons/badge-72.png');

for (const [name, glyph] of Object.entries(SHORTCUT_GLYPHS)) {
  await sharp(Buffer.from(shortcutSvg(glyph))).resize(96, 96).png().toFile(`public/icons/shortcut-${name}.png`);
  console.log(`public/icons/shortcut-${name}.png`);
}

for (const [w, h, dpr] of SPLASH_SCREENS) {
  const W = w * dpr;
  const H = h * dpr;
  const file = `public/splash/splash-${W}x${H}.png`;
  await sharp(Buffer.from(splashSvg(W, H))).png({ palette: true, quality: 92, compressionLevel: 9 }).toFile(file);
  console.log(file);
}
