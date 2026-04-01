import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App.tsx';
import { AuthProvider } from './context/AuthContext';
import PwaPrompts from './components/PwaPrompts';
import { runAppBootstrap } from './lib/cloudSync';
import { initConsoleCapture } from './lib/consoleCapture';
import { initTheme } from './lib/theme';
import { queryClient } from './lib/queryClient';
import { MorphingSquare } from './components/MorphingSquare';
import Toaster from './components/ui/toaster';
import './index.css';

initConsoleCapture();
initTheme();

function Root() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void runAppBootstrap().then((outcome) => {
      if (cancelled) return;
      if (outcome === 'reload') {
        window.location.reload();
        return;
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div className="app-boot-screen">
        <MorphingSquare message="Loading workspace…" />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="app-viewport">
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </QueryClientProvider>
      </div>
      <Toaster defaultPosition="bottom-right" />
      <PwaPrompts />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
