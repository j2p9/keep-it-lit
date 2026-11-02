import { tick } from '../lib/haptics.js';

export const Switch = ({ on, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    class={`switch${on ? ' on' : ''}`}
    onClick={() => onChange(!on)}
  />
);

/** iOS-style segmented control with a thumb that slides to the chosen option. */
export function Segmented({ options, value, onChange, label }) {
  const index = Math.max(
    0,
    options.findIndex(([v]) => v === value),
  );
  return (
    <div class="seg" role="radiogroup" aria-label={label} style={{ '--n': options.length, '--i': index }}>
      <span class="seg-thumb" aria-hidden="true" />
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={v === value}
          class={v === value ? 'on' : ''}
          onClick={() => {
            if (v === value) return;
            tick();
            onChange(v);
          }}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export function Stepper({ value, onChange, min = 0, max = 999, label }) {
  return (
    <div class="stepper" role="group" aria-label={label}>
      <button type="button" aria-label="Less" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
        −
      </button>
      <div class="value" aria-live="polite" key={value}>
        {value}
      </div>
      <button type="button" aria-label="More" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        +
      </button>
    </div>
  );
}

export const Logo = ({ size = 88 }) => (
  <img class="logo" src="./icons/icon-192.png?v=2" alt="" width={size} height={size} style={{ width: `${size}px`, height: `${size}px` }} />
);
