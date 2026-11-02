import { render } from 'preact';
import './styles/app.css';
import './lib/install.js';
import { App } from './app.jsx';
import { installBackNavigation } from './lib/backnav.js';
import { boot } from './lib/store.js';
import { openFromUrl, registerServiceWorker } from './lib/sw-register.js';
import { applyTheme } from './lib/theme.js';

applyTheme();
installBackNavigation();
render(<App />, document.getElementById('app'));
boot().then(() => {
  if (location.hash) openFromUrl(location.href);
});
window.addEventListener('hashchange', () => openFromUrl(location.href));
registerServiceWorker();
