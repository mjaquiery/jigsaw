import './styles.css';
import { App } from './app';
import { watchInstall } from './display';

// Stop pinch-zoom, double-tap zoom and page bounce on iPad.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault());
}
document.addEventListener(
  'touchmove',
  (e) => {
    // Only the menu pages may scroll.
    if (!(e.target as Element).closest?.('.page-body, .count-body')) e.preventDefault();
  },
  { passive: false },
);
document.addEventListener('contextmenu', (e) => e.preventDefault());

watchInstall();
new App(document.getElementById('app')!).start();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Offline support is best-effort.
    });
  });
}
