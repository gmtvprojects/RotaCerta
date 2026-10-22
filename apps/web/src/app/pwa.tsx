import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

interface Pwa {
  standalone: boolean;
  online: boolean;
  offlineReady: boolean;
  updateAvailable: boolean;
  /** Instalação nativa disponível (Chrome/Android); no iOS há só o passo a passo manual. */
  canInstall: boolean;
  isIOS: boolean;
  secure: boolean;
  install: () => Promise<void>;
  applyUpdate: () => void;
}

const Ctx = createContext<Pwa | null>(null);
export const usePwa = (): Pwa => {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePwa fora do PwaProvider');
  return v;
};

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

export function PwaProvider({ children }: { children: ReactNode }) {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [standalone, setStandalone] = useState(isStandalone);
  const [online, setOnline] = useState(navigator.onLine);
  const { offlineReady: [offlineReady], needRefresh: [updateAvailable], updateServiceWorker } = useRegisterSW();

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as InstallEvent); };
    const onInstalled = () => { setDeferred(null); setStandalone(true); };
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const value = useMemo<Pwa>(() => ({
    standalone, online, offlineReady, updateAvailable,
    canInstall: !!deferred,
    isIOS: /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
    secure: window.isSecureContext,
    install: async () => {
      if (!deferred) return;
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
    },
    applyUpdate: () => { void updateServiceWorker(true); },
  }), [standalone, online, offlineReady, updateAvailable, deferred, updateServiceWorker]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
