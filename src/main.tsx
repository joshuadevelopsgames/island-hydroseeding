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
import { isMisconfigured } from './lib/supabase';
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

  if (isMisconfigured) {
    return (
      <div className="app-boot-screen" style={{ flexDirection: 'column', gap: '1rem', maxWidth: '32rem', margin: '0 auto', textAlign: 'center' }}>
        <p style={{ fontWeight: 700, fontSize: '1.125rem', color: 'var(--text-primary)' }}>
          Missing Supabase configuration
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9375rem', lineHeight: 1.6 }}>
          Add the following to your <code style={{ background: 'var(--surface-raised)', padding: '0.1em 0.4em', borderRadius: '4px' }}>.env.local</code> file and restart the dev server:
        </p>
        <pre style={{
          background: 'var(--surface-raised)', borderRadius: '8px', padding: '1rem',
          textAlign: 'left', fontSize: '0.8125rem', overflowX: 'auto', lineHeight: 1.7,
          border: '1px solid var(--border-color)',
        }}>
{`VITE_SUPABASE_URL=https://qeoxpngobqbhacimvamc.supabase.co
VITE_SUPABASE_ANON_KEY=<your anon key>

# Get the anon key from:
# Supabase dashboard → Project Settings → API`}
        </pre>
      </div>
    );
  }

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
