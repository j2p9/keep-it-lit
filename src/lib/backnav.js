// Android's back button and back gesture should close the open sheet (or return to Today)
// instead of leaving the app. While something can be closed we keep one extra history entry;
// pressing back consumes it, we close the top thing, and re-arm if more is still open.
import { effect } from '@preact/signals';
import { ready, session } from './store.js';
import { closeOverlay, closeWelcome, hasOpenOverlay, setUi, uiState, welcomeLeaving, welcomeOpen } from './ui.js';

let armed = false;
let ignore = 0;

const welcomeShown = () => welcomeOpen.value && !welcomeLeaving.value;
const closable = () =>
  hasOpenOverlay() || welcomeShown() || (session.value.status === 'signedIn' && ready.value && uiState.value.tab !== 'today');

export function installBackNavigation() {
  effect(() => {
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
  });
}
