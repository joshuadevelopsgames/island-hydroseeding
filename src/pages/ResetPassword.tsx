import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [error, setError]         = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);
  const [done, setDone]           = useState(false);
  const [validLink, setValidLink] = useState<boolean | null>(null); // null = checking

  // Supabase appends #access_token=...&type=recovery to the URL when the
  // user clicks the reset link. The JS client picks it up automatically on
  // onAuthStateChange. We listen here so we know the session is ready.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setValidLink(true);
      }
    });

    // In case the client already processed the hash before this component
    // mounted (rare but possible), check the session.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setValidLink(true);
    }).catch(() => { /* ignore */ });

    // Give it up to 3 s for the hash to be processed; if nothing arrives, the
    // link is invalid or already used.
    const timer = window.setTimeout(() => {
      setValidLink((prev) => (prev === null ? false : prev));
    }, 3000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateErr) {
      setError(updateErr.message);
    } else {
      setDone(true);
      window.setTimeout(() => navigate('/', { replace: true }), 2500);
    }
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
          <h1 style={{ fontSize: '1.375rem', marginBottom: '0.25rem' }}>Set new password</h1>
          <p className="text-secondary" style={{ fontSize: '0.875rem' }}>
            Island Hydroseeding operations
          </p>
        </div>

        {/* ── Checking link ── */}
        {validLink === null && (
          <p className="text-secondary" style={{ textAlign: 'center', fontSize: '0.875rem' }}>
            Verifying reset link…
          </p>
        )}

        {/* ── Invalid / expired link ── */}
        {validLink === false && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'center' }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-danger)', margin: 0 }}>
              This reset link has expired or is invalid. Please request a new one.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate('/login', { replace: true })}
            >
              Back to sign in
            </button>
          </div>
        )}

        {/* ── Set password form ── */}
        {validLink === true && !done && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label htmlFor="rp-password">New password</label>
              <input
                id="rp-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="—"
              />
            </div>

            <div>
              <label htmlFor="rp-confirm">Confirm password</label>
              <input
                id="rp-confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
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
              {loading ? 'Saving…' : 'Save new password'}
            </button>
          </form>
        )}

        {/* ── Success ── */}
        {done && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'center' }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-success)', margin: 0 }}>
              Password updated! Redirecting you to the app…
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
