// Android's back button and back gesture should close the open sheet (or return to Today)
// instead of leaving the app. While something can be closed we keep one extra history entry;
// pressing back consumes it, we close the top thing, and re-arm if more is still open.
import { effect } from '@preact/signals';
import { ready, session } from './store.js';
import { closeOverlay, closeWelcome, hasOpenOverlay, setUi, uiState, viewDay, welcomeLeaving, welcomeOpen } from './ui.js';

let armed = false;
let ignore = 0;
let pending = false;

const welcomeShown = () => welcomeOpen.value && !welcomeLeaving.value;
const closable = () =>
  hasOpenOverlay() ||
  welcomeShown() ||
  (session.value.status === 'signedIn' && ready.value && (uiState.value.tab !== 'today' || viewDay.value !== null));

// Runs once things settle, so closing one sheet and opening the next in the same tap
// (templates → goal editor) doesn't drop our entry and then step back out of the app.
function settle() {
  pending = false;
  if (closable()) {
    if (!armed) {
      history.pushState({ kil: 'back' }, '');
      armed = true;
    }
  } else if (armed) {
    // Everything was closed from the UI: drop our entry so the next back leaves normally.
    armed = false;
    ignore += 1;
    history.back();
  }
}

export function installBackNavigation() {
  effect(() => {
    closable(); // subscribe to everything that decides it
    if (pending) return;
    pending = true;
    setTimeout(settle, 0);
  });

  window.addEventListener('popstate', () => {
    if (ignore > 0) {
      ignore -= 1;
      return;
    }
    if (!armed) return;
    armed = false;
    if (hasOpenOverlay()) closeOverlay();
    else if (welcomeShown()) closeWelcome();
    else if (uiState.peek().tab !== 'today') setUi({ tab: 'today' });
    else if (viewDay.peek() !== null) viewDay.value = null;
  });
}
