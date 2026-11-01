import { render } from 'preact';
import './styles/app.css';
import { App } from './app.jsx';
import { boot } from './lib/store.js';
import { openFromUrl, registerServiceWorker } from './lib/sw-register.js';
import { applyTheme } from './lib/theme.js';

applyTheme();
render(<App />, document.getElementById('app'));
boot().then(() => {
  if (location.hash) openFromUrl(location.href);
});
registerServiceWorker();
