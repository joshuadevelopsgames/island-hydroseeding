import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './context/AuthContext';
import PwaPrompts from './components/PwaPrompts';
import { runAppBootstrap } from './lib/cloudSync';
import './index.css';

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
        <p className="app-boot-screen__text">Loading workspace…</p>
      </div>
    );
  }

  return (
    <>
      <AuthProvider>
        <App />
      </AuthProvider>
      <PwaPrompts />
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
