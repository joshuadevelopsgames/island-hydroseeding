import { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw, X } from 'lucide-react';

const INSTALL_DISMISS_KEY = 'pwa-install-dismissed-at';
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;
const CHECK_MS = 5 * 60 * 1000;

type BeforeInstallPromptEventTyped = Event & {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: string }>;
};

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/**
 * Install: Web App Manifest + mobile banner (Android `beforeinstallprompt`, iOS Share → Add to Home Screen).
 * Updates: production builds write `dist/build-id.txt` with a unique id matching `import.meta.env.VITE_BUILD_ID`
 * in that build. Poll compares server id to the running bundle; mismatch ⇒ reload prompt (cache-busted URL).
 */
export default function PwaPrompts() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [installVisible, setInstallVisible] = useState(false);
  const [deferredInstall, setDeferredInstall] = useState<BeforeInstallPromptEventTyped | null>(null);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch(`/build-id.txt?t=${Date.now()}`, { cache: 'no-store' });
        if (!r.ok) return;
        const serverId = (await r.text()).trim();
        const localId = import.meta.env.VITE_BUILD_ID;
        if (serverId && localId && serverId !== localId) {
          setNeedRefresh(true);
        }
      } catch {
        /* offline or dev */
      }
    };
    void check();
    const t = window.setInterval(() => void check(), CHECK_MS);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferredInstall(e as BeforeInstallPromptEventTyped);
    };
    window.addEventListener('beforeinstallprompt', onBip);
    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, []);

  useEffect(() => {
    if (!isMobile || isStandalone()) {
      setInstallVisible(false);
      return;
    }
    const raw = localStorage.getItem(INSTALL_DISMISS_KEY);
    if (raw && Date.now() - Number(raw) < DISMISS_MS) return;
    setInstallVisible(true);
  }, [isMobile]);

  const applyUpdate = useCallback(() => {
    const u = new URL(window.location.href);
    u.searchParams.set('_v', String(Date.now()));
    window.location.href = u.toString();
  }, []);

  const dismissInstall = useCallback(() => {
    localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now()));
    setInstallVisible(false);
  }, []);

  const runNativeInstall = async () => {
    if (!deferredInstall?.prompt) return;
    await deferredInstall.prompt();
    setDeferredInstall(null);
  };

  const showInstallBanner = installVisible && isMobile && !isStandalone();
  if (!needRefresh && !showInstallBanner) {
    return null;
  }

  return (
    <>
      {needRefresh && (
        <div className="pwa-toast pwa-toast--update" role="alert">
          <RefreshCw size={18} className="pwa-toast__icon" aria-hidden />
          <span className="pwa-toast__msg">A new version is available.</span>
          <button type="button" className="btn btn-primary pwa-toast__btn" onClick={applyUpdate}>
            Reload
          </button>
        </div>
      )}

      {showInstallBanner && (
        <div className="pwa-install-banner">
          <button
            type="button"
            className="pwa-install-banner__close"
            onClick={dismissInstall}
            aria-label="Dismiss"
          >
            <X size={18} />
          </button>
          <div className="pwa-install-banner__icon" aria-hidden>
            <Download size={22} />
          </div>
          <p className="pwa-install-banner__title">{isIos() ? 'Add to Home Screen (iPhone)' : 'Install this app'}</p>
          {isIos() ? (
            <p className="pwa-install-banner__body">
              In <strong>Safari</strong>, tap the <strong>Share</strong> button (square with arrow pointing up), scroll
              the sheet, then tap <strong>Add to Home Screen</strong> and confirm. That opens the app full screen like
              a native shortcut. When we publish an update, a banner appears — tap <strong>Reload</strong>. If the app
              still looks stale, swipe it away in the app switcher and open it again.
            </p>
          ) : deferredInstall ? (
            <>
              <p className="pwa-install-banner__body">
                Install for quick access. You&apos;ll get a reload prompt when a new version is deployed.
              </p>
              <button type="button" className="btn btn-primary pwa-install-banner__cta" onClick={runNativeInstall}>
                Install app
              </button>
            </>
          ) : (
            <p className="pwa-install-banner__body">
              In <strong>Chrome</strong>, open the menu (⋮) and tap <strong>Install app</strong> or{' '}
              <strong>Add to Home screen</strong>.
            </p>
          )}
        </div>
      )}
    </>
  );
}
