/** Shared gradients, referenced as url(#kil-flame) by rings, bars and calendar marks. */
export function GradientDefs() {
  return (
    <svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="kil-flame" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#FFC15A" />
          <stop offset="0.5" stop-color="#FF7A1A" />
          <stop offset="1" stop-color="#FF3D6E" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Apple-style progress ring. `value` is 0..1. */
export function Ring({ size = 120, stroke = 12, value = 0, color = 'url(#kil-flame)', glow = false, label, children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value || 0));
  const mid = size / 2;
  return (
    <div
      class={`ring${glow && v >= 1 ? ' glow' : ''}`}
      style={{ width: `${size}px`, height: `${size}px` }}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={mid} cy={mid} r={r} fill="none" stroke="var(--ring-track)" stroke-width={stroke} />
        {v > 0 && (
          <circle
            class="ring-arc"
            cx={mid}
            cy={mid}
            r={r}
            fill="none"
            stroke={color}
            stroke-width={stroke}
            stroke-linecap="round"
            stroke-dasharray={c}
            stroke-dashoffset={c * (1 - v)}
            transform={`rotate(-90 ${mid} ${mid})`}
          />
        )}
      </svg>
      {children && <div class="ring-center">{children}</div>}
    </div>
  );
}
