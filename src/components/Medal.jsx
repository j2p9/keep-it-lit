import { useMemo } from 'preact/hooks';

// [highlight, body, shadow] for each tier's metallic gradient.
const TIERS = {
  bronze: ['#F6B98A', '#C2743F', '#7A3E1C'],
  silver: ['#F7F9FB', '#BAC3CF', '#6C7684'],
  gold: ['#FFEAA3', '#F2B01E', '#A06200'],
  platinum: ['#EEF8FF', '#9FC6E9', '#4B77A2'],
  legendary: ['#FFD98A', '#FF6A3D', '#A8103C'],
  flame: ['#FFC86A', '#FF7A1A', '#D8204C'],
  ice: ['#DDF3FF', '#7CC8FF', '#2A6CAE'],
  cosmic: ['#E8D8FF', '#9B6BFF', '#47279E'],
};

const pt = (r, deg) => {
  const a = (deg * Math.PI) / 180;
  return `${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)}`;
};
const polygon = (pts) => `M${pts.join('L')}Z`;
const ngon = (n, r) => polygon(Array.from({ length: n }, (_, i) => pt(r, -90 + (360 / n) * i)));
const star = (n, r1, r2) => polygon(Array.from({ length: n * 2 }, (_, i) => pt(i % 2 ? r2 : r1, -90 + (180 / n) * i)));
const circle = (r) => `M${50 - r} 50A${r} ${r} 0 1 0 ${50 + r} 50A${r} ${r} 0 1 0 ${50 - r} 50Z`;

const SHAPES = {
  circle: { outer: circle(47), inner: circle(38) },
  hex: { outer: ngon(6, 49), inner: ngon(6, 40) },
  star: { outer: star(14, 49, 42), inner: circle(36) },
  shield: {
    outer: 'M50 3 L91 16 V48 C91 74 73 89 50 97 C27 89 9 74 9 48 V16 Z',
    inner: 'M50 11.5 L83 22 V48 C83 69 68.5 81.5 50 88.5 C31.5 81.5 17 69 17 48 V22 Z',
  },
};

let seq = 0;

/** An original SVG medal: tier gradient, shape, glyph and optional number. */
export function Medal({ def, size = 84, locked = false, count = 0, secret = false }) {
  const id = useMemo(() => `md${++seq}`, []);
  const [hi, mid, lo] = TIERS[def.tier] || TIERS.bronze;
  const shape = SHAPES[def.shape] || SHAPES.circle;
  const glyph = secret ? '❔' : def.glyph;
  const text = secret ? null : def.label;
  return (
    <span class={`medal${locked ? ' locked' : ''}`} style={{ width: `${size}px`, height: `${size}px` }} aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 100 100">
        <defs>
          <linearGradient id={`${id}a`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color={hi} />
            <stop offset="0.55" stop-color={mid} />
            <stop offset="1" stop-color={lo} />
          </linearGradient>
          <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color={mid} />
            <stop offset="1" stop-color={lo} />
          </linearGradient>
          <radialGradient id={`${id}c`} cx="0.32" cy="0.22" r="0.8">
            <stop offset="0" stop-color="#fff" stop-opacity="0.6" />
            <stop offset="0.45" stop-color="#fff" stop-opacity="0" />
          </radialGradient>
        </defs>
        <path d={shape.outer} fill={`url(#${id}a)`} />
        <path d={shape.inner} fill={`url(#${id}b)`} />
        <path d={shape.inner} fill={`url(#${id}c)`} />
        <path d={shape.inner} fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.2" />
        {text ? (
          <>
            <text x="50" y="45" text-anchor="middle" font-size="18">
              {glyph}
            </text>
            <text
              x="50"
              y="71"
              text-anchor="middle"
              font-size={text.length > 3 ? 18 : 25}
              font-weight="800"
              fill="#fff"
              style="font-family: var(--font-round); paint-order: stroke; stroke: rgba(0,0,0,0.2); stroke-width: 2.5px"
            >
              {text}
            </text>
          </>
        ) : (
          <text x="50" y="62" text-anchor="middle" font-size="34">
            {glyph}
          </text>
        )}
      </svg>
      {count > 1 && <span class="count">×{count}</span>}
    </span>
  );
}
