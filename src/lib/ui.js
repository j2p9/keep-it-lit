import { effect, signal } from '@preact/signals';
import { readJSON, writeJSON } from './local.js';

// Per-device UI state, persisted so iOS killing the app in the background doesn't reset it.
export const uiState = signal({
  tab: 'today',
  calMonth: null,
  calGoal: 'all',
  range: 'week',
  lastWelcome: null,
  installDismissed: false,
  draft: null,
  ...readJSON('ui', {}),
});
effect(() => writeJSON('ui', uiState.value));
export const setUi = (patch) => (uiState.value = { ...uiState.value, ...patch });

// Stack of sheets and full-screen pages.
let seq = 0;
export const overlays = signal([]);
export function openOverlay(type, props = {}) {
  overlays.value = [...overlays.value, { id: ++seq, type, props }];
}
export function closeOverlay(id) {
  overlays.value = id == null ? overlays.value.slice(0, -1) : overlays.value.filter((o) => o.id !== id);
}
export const closeAllOverlays = () => (overlays.value = []);

export const toast = signal(null);
let toastTimer = null;
export function showToast(text, opts = {}) {
  clearTimeout(toastTimer);
  toast.value = { id: ++seq, text, ...opts };
  toastTimer = setTimeout(() => (toast.value = null), opts.duration ?? 3200);
}
export const hideToast = () => (toast.value = null);

// Newly earned awards waiting for their full-screen moment.
const shown = new Set();
export const celebrations = signal([]);
export function celebrate(rows) {
  const fresh = rows.filter((r) => !shown.has(r.award_key));
  fresh.forEach((r) => shown.add(r.award_key));
  if (fresh.length) celebrations.value = [...celebrations.value, ...fresh];
}

export const welcomeOpen = signal(false);
export const recoveryMode = signal(false);
/** True while the onboarding flow is on screen, even after its first goals exist. */
export const onboardingActive = signal(false);
