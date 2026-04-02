import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

type View = 'sign-in' | 'forgot-password';

export default function Login() {
  const navigate = useNavigate();
  const [view, setView]         = useState<View>('sign-in');

  // Sign-in state
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  // Forgot-password state
  const [fpEmail, setFpEmail]       = useState('');
  const [fpLoading, setFpLoading]   = useState(false);
  const [fpSent, setFpSent]         = useState(false);
  const [fpError, setFpError]       = useState<string | null>(null);

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    navigate('/', { replace: true });
  };

  const handleForgotPassword = async (e: FormEvent) => {
    e.preventDefault();
    setFpError(null);
    setFpLoading(true);

    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(fpEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setFpLoading(false);

    if (resetErr) {
      setFpError(resetErr.message);
    } else {
      setFpSent(true);
    }
  };

  const switchToForgot = () => {
    setFpEmail(email); // pre-fill with whatever they typed in sign-in
    setFpError(null);
    setFpSent(false);
    setView('forgot-password');
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        background: 'var(--bg-color)',
      }}
    >
      <div className="card" style={{ width: '100%', maxWidth: '22rem' }}>
        {/* Logo / brand */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <img
            src="/ih-logo.png"
            alt="Island Hydroseeding"
            style={{ height: '2.5rem', margin: '0 auto 1rem', display: 'block' }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
          <h1 style={{ fontSize: '1.375rem', marginBottom: '0.25rem' }}>
            {view === 'sign-in' ? 'Sign in' : 'Reset password'}
          </h1>
          <p className="text-secondary" style={{ fontSize: '0.875rem' }}>
            Island Hydroseeding operations
          </p>
        </div>

        {/* ── Sign-in form ── */}
        {view === 'sign-in' && (
          <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@islandhydroseeding.com"
              />
            </div>

            <div>
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="—"
              />
            </div>

            {error && (
              <p
                style={{
                  fontSize: '0.875rem',
                  color: 'var(--color-danger)',
                  background: 'var(--color-danger-bg)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.625rem 0.875rem',
                  margin: 0,
                }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ marginTop: '0.25rem' }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>

            <button
              type="button"
              onClick={switchToForgot}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                fontSize: '0.875rem',
                color: 'var(--primary-green)',
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              Forgot password?
            </button>
          </form>
        )}

        {/* ── Forgot-password form ── */}
        {view === 'forgot-password' && !fpSent && (
          <form onSubmit={handleForgotPassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p className="text-secondary" style={{ fontSize: '0.875rem', margin: 0 }}>
              Enter your email and we'll send you a link to reset your password.
            </p>

            <div>
              <label htmlFor="fp-email">Email</label>
              <input
                id="fp-email"
                type="email"
                autoComplete="email"
                value={fpEmail}
                onChange={(e) => setFpEmail(e.target.value)}
                required
                placeholder="you@islandhydroseeding.com"
              />
            </div>

            {fpError && (
              <p
                style={{
                  fontSize: '0.875rem',
                  color: 'var(--color-danger)',
                  background: 'var(--color-danger-bg)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.625rem 0.875rem',
                  margin: 0,
                }}
              >
                {fpError}
              </p>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={fpLoading}
            >
              {fpLoading ? 'Sending…' : 'Send reset link'}
            </button>

            <button
              type="button"
              onClick={() => setView('sign-in')}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                fontSize: '0.875rem',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              ← Back to sign in
            </button>
          </form>
        )}

        {/* ── Sent confirmation ── */}
        {view === 'forgot-password' && fpSent && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'center' }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-primary)', margin: 0 }}>
              Check your inbox — if <strong>{fpEmail}</strong> has an account, a reset link is on its way.
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setView('sign-in')}
            >
              Back to sign in
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
