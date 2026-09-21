import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// index.css renders the app at 90% via `zoom`. Browsers differ on whether that
// also shrinks 100vh, so measure it and pass the correction to the CSS.
(() => {
  try {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;width:0;height:100vh';
    document.body.appendChild(probe);
    const ratio = probe.getBoundingClientRect().height / window.innerHeight;
    probe.remove();
    if (ratio > 0.5 && ratio < 1.5) document.documentElement.style.setProperty('--vh-comp', String(1 / ratio));
  } catch {
    // leave the default (no correction)
  }
})();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
