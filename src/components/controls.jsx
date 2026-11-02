import { useState } from 'preact/hooks';
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

/**
 * A passphrase field. It's a masked text field rather than type="password", so iPhone doesn't
 * offer to save it over the account password.
 */
export function SecretInput({ value, onInput, label, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div class="input-wrap">
      <input
        class={`input${show ? '' : ' secret'}`}
        type="text"
        aria-label={label}
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        spellcheck={false}
        data-1p-ignore=""
        data-lpignore="true"
        placeholder={placeholder}
        value={value}
        onInput={(e) => onInput(e.currentTarget.value)}
      />
      <button type="button" class="reveal" onClick={() => setShow(!show)}>
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

/** Read-only text with a Copy button, for the Health key and address. */
export function CopyBox({ text, label }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt(`Copy the ${label.toLowerCase()}:`, text);
    }
  };
  return (
    <div class="copy-box">
      <code aria-label={label}>{text}</code>
      <button type="button" class="btn btn-secondary btn-small" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

export const Logo = ({ size = 88 }) => (
  <img class="logo" src="./icons/icon-192.png?v=2" alt="" width={size} height={size} style={{ width: `${size}px`, height: `${size}px` }} />
);
