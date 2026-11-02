// Android (and desktop Chrome) offer a real install prompt. We hold on to it so our own
// "Install app" buttons can show it. iOS has no prompt: there the user adds from Safari's Share menu.
import { signal } from '@preact/signals';

export const installPrompt = signal(null);
/** Installed from this browser tab: stop suggesting it here. */
export const installed = signal(false);

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt.value = e;
});
window.addEventListener('appinstalled', () => {
  installPrompt.value = null;
  installed.value = true;
});

/** Shows the browser's install dialog. Must be called from a tap. Resolves true if installed. */
export async function promptInstall() {
  const e = installPrompt.value;
  if (!e) return false;
  installPrompt.value = null;
  await e.prompt();
  const choice = await e.userChoice.catch(() => null);
  const ok = choice?.outcome === 'accepted';
  if (ok) installed.value = true;
  return ok;
}
