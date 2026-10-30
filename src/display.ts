/**
 * Full screen and "install as an app" support.
 *
 * iPadOS Safari only has the prefixed webkit fullscreen calls before 16.4,
 * and never fires beforeinstallprompt: there the app explains how to use
 * Share → Add to Home Screen instead.
 */

interface WebkitDocument {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

interface WebkitElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const doc = () => document as Document & WebkitDocument;

/** Opened from the home screen icon, so it is already an app with no browser bars. */
export function isStandalone(): boolean {
  return (
    matchMedia('(display-mode: standalone)').matches ||
    matchMedia('(display-mode: fullscreen)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  // iPadOS Safari says it is a Mac; only the touch screen gives it away.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function canFullscreen(): boolean {
  return !isStandalone() && !!(doc().fullscreenEnabled || doc().webkitFullscreenEnabled);
}

export function isFullscreen(): boolean {
  return !!(doc().fullscreenElement || doc().webkitFullscreenElement);
}

/** Must be called from a click, or the browser refuses. */
export async function toggleFullscreen(): Promise<void> {
  try {
    if (isFullscreen()) {
      if (doc().exitFullscreen) await doc().exitFullscreen();
      else await doc().webkitExitFullscreen?.();
    } else {
      const el = document.documentElement as HTMLElement & WebkitElement;
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else await el.webkitRequestFullscreen?.();
    }
  } catch {
    // Refused (no user gesture, or not allowed here); nothing to do.
  }
}

export function onFullscreenChange(fn: () => void): () => void {
  document.addEventListener('fullscreenchange', fn);
  document.addEventListener('webkitfullscreenchange', fn);
  return () => {
    document.removeEventListener('fullscreenchange', fn);
    document.removeEventListener('webkitfullscreenchange', fn);
  };
}

// ---------- install ----------

let deferredPrompt: InstallPromptEvent | null = null;
const installListeners = new Set<() => void>();
const notifyInstall = () => installListeners.forEach((fn) => fn());

/** Catch the browser's install offer early; it fires once, soon after load. */
export function watchInstall(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as InstallPromptEvent;
    notifyInstall();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notifyInstall();
  });
}

/**
 * How the app can be installed here: 'prompt' when the browser offers it,
 * 'ios' when the person must use Share → Add to Home Screen, or null.
 */
export function installMode(): 'prompt' | 'ios' | null {
  if (isStandalone()) return null;
  if (deferredPrompt) return 'prompt';
  if (isIOS()) return 'ios';
  return null;
}

/** Show the browser's install dialog. Resolves true if accepted. */
export async function promptInstall(): Promise<boolean> {
  const e = deferredPrompt;
  if (!e) return false;
  deferredPrompt = null;
  try {
    await e.prompt();
    const { outcome } = await e.userChoice;
    return outcome === 'accepted';
  } catch {
    return false;
  } finally {
    notifyInstall();
  }
}

export function onInstallChange(fn: () => void): () => void {
  installListeners.add(fn);
  return () => installListeners.delete(fn);
}
