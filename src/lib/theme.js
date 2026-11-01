import { effect } from '@preact/signals';
import { readString, writeString } from './local.js';
import { profile } from './store.js';

const media = window.matchMedia('(prefers-color-scheme: light)');
const BG = { dark: '#110C0B', light: '#F8F2ED' };

/** Follows the user's choice (Auto, Dark, Light) and the iPhone's appearance setting. */
export function applyTheme() {
  const run = () => {
    const pref = profile.value?.settings?.theme || readString('theme', 'auto');
    const mode = pref === 'auto' ? (media.matches ? 'light' : 'dark') : pref;
    const root = document.documentElement;
    root.dataset.theme = mode;
    root.style.background = BG[mode];
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BG[mode]);
    writeString('theme', pref);
  };
  effect(run);
  media.addEventListener?.('change', run);
}
