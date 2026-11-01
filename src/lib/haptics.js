// A light haptic tick. Android has the Vibration API; iOS Safari (17.4+) gives a system
// haptic when a switch-style checkbox toggles, so we click a hidden one. No-op elsewhere.
const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

export function tick() {
  try {
    if (!coarse) return;
    if (navigator.vibrate) {
      navigator.vibrate(12);
      return;
    }
    const label = document.createElement('label');
    label.ariaHidden = 'true';
    label.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.appendChild(input);
    document.head.appendChild(label);
    label.click();
    document.head.removeChild(label);
  } catch {
    /* haptics are a nicety */
  }
}
