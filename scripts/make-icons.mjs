// Renders the app icon (an original flame with a check mark) to the PNG sizes iOS and Android need.
// Run with: npm run icons
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const flame = `
  <path d="M548 130C600 268 790 380 790 610C790 772 665 890 512 890C359 890 234 772 234 618C234 520 280 440 336 384C336 450 360 500 404 528C392 380 440 250 548 130Z" fill="url(#outer)"/>
  <path d="M520 432C560 522 680 582 680 714C680 802 606 858 512 858C418 858 344 802 344 718C344 642 392 592 440 550C444 602 462 634 492 650C482 582 488 502 520 432Z" fill="url(#inner)"/>
  <path d="M428 712L490 772L604 646" fill="none" stroke="#5A1E06" stroke-width="54" stroke-linecap="round" stroke-linejoin="round"/>`;

function iconSvg({ scale = 1, rounded = false, transparent = false } = {}) {
  const t = `translate(512 540) scale(${scale}) translate(-512 -540)`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
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
    </linearGradient>
  </defs>
  ${transparent ? '' : `<rect width="1024" height="1024" ${rounded ? 'rx="230"' : ''} fill="url(#bg)"/>`}
  ${transparent ? '' : `<circle cx="512" cy="640" r="440" fill="url(#glow)" transform="${t}"/>`}
  <g transform="${t}">${flame}</g>
</svg>`;
}

// Monochrome silhouette for Android's small notification badge.
const badgeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <path transform="translate(512 512) scale(1.05) translate(-512 -510)" d="M548 130C600 268 790 380 790 610C790 772 665 890 512 890C359 890 234 772 234 618C234 520 280 440 336 384C336 450 360 500 404 528C392 380 440 250 548 130Z" fill="#fff"/>
</svg>`;

await mkdir('public/icons', { recursive: true });
await writeFile('public/icons/favicon.svg', iconSvg({ rounded: true }));

const outputs = [
  ['apple-touch-icon.png', 180, iconSvg()],
  ['icon-192.png', 192, iconSvg()],
  ['icon-512.png', 512, iconSvg()],
  ['icon-maskable-512.png', 512, iconSvg({ scale: 0.78 })],
  ['badge-72.png', 72, badgeSvg],
];
for (const [name, size, svg] of outputs) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(`public/icons/${name}`);
  console.log(`public/icons/${name}`);
}
