import { effect, signal } from '@preact/signals';
import { readJSON, writeJSON } from './local.js';

// How long closing sheets, pages, toasts and the welcome screen take to animate out.
export const EXIT_MS = 260;

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

// Stack of sheets and full-screen pages. Closing ones stay briefly so they can animate out.
let seq = 0;
export const overlays = signal([]);
export function openOverlay(type, props = {}) {
  overlays.value = [...overlays.value, { id: ++seq, type, props }];
}
export function closeOverlay(id) {
  const list = overlays.value;
  const target = id == null ? [...list].reverse().find((o) => !o.closing) : list.find((o) => o.id === id);
  if (!target || target.closing) return;
  overlays.value = list.map((o) => (o === target ? { ...o, closing: true } : o));
  setTimeout(() => (overlays.value = overlays.value.filter((o) => o.id !== target.id)), EXIT_MS);
}
export function closeAllOverlays() {
  overlays.value = overlays.value.map((o) => ({ ...o, closing: true }));
  setTimeout(() => (overlays.value = overlays.value.filter((o) => !o.closing)), EXIT_MS);
}
export const hasOpenOverlay = () => overlays.value.some((o) => !o.closing);

export const toast = signal(null);
let toastTimer = null;
export function showToast(text, opts = {}) {
  clearTimeout(toastTimer);
  toast.value = { id: ++seq, text, ...opts };
  toastTimer = setTimeout(hideToast, opts.duration ?? 3200);
}
export function hideToast() {
  const t = toast.value;
  if (!t || t.leaving) return;
  clearTimeout(toastTimer);
  toast.value = { ...t, leaving: true };
  toastTimer = setTimeout(() => {
    if (toast.value?.id === t.id) toast.value = null;
  }, 200);
}

// Newly earned awards waiting for their full-screen moment.
const shown = new Set();
export const celebrations = signal([]);
export function celebrate(rows) {
  const fresh = rows.filter((r) => !shown.has(r.award_key));
  fresh.forEach((r) => shown.add(r.award_key));
  if (fresh.length) celebrations.value = [...celebrations.value, ...fresh];
}

export const welcomeOpen = signal(false);
export const welcomeLeaving = signal(false);
export function closeWelcome() {
  if (!welcomeOpen.value || welcomeLeaving.value) return;
  welcomeLeaving.value = true;
  setTimeout(() => {
    welcomeOpen.value = false;
    welcomeLeaving.value = false;
  }, EXIT_MS);
}

export const recoveryMode = signal(false);
/** True while the onboarding flow is on screen, even after its first goals exist. */
export const onboardingActive = signal(false);
