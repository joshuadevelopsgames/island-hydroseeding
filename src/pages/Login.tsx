import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e: FormEvent) => {
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
          <h1 style={{ fontSize: '1.375rem', marginBottom: '0.25rem' }}>Sign in</h1>
          <p className="text-secondary" style={{ fontSize: '0.875rem' }}>
            Island Hydroseeding operations
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
        </form>
      </div>
    </div>
  );
}
