import { useState, type FormEvent } from 'react';
import { Users, Trash2, UserPlus, ShieldCheck, Check, LayoutDashboard, Key } from 'lucide-react';
import AlertDialog from '../components/AlertDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import { useAuth, DEFAULT_NEW_USER_PAGES } from '../context/AuthContext';
import type { AppUser } from '../context/AuthContext';
import { ALL_ASSIGNABLE_PATHS, PAGE_OPTIONS, normalizeAllowedPages } from '../lib/permissions';
import { apiFetch } from '../lib/apiClient';

type NewUserResult = { user: AppUser; tempPassword: string };

export default function Team() {
  const { users, currentUser, reloadUsers } = useAuth();
  const [saving, setSaving]                 = useState<string | null>(null); // userId being saved
  const [userToRemove, setUserToRemove]     = useState<string | null>(null);
  const [newUserResult, setNewUserResult]   = useState<NewUserResult | null>(null);
  const [alert, setAlert]                   = useState<{ title: string; message: string } | null>(null);

  // ── Add user ───────────────────────────────────────────────────────────────
  const handleAdd = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd          = new FormData(e.currentTarget);
    const name        = String(fd.get('name') || '').trim();
    const email       = String(fd.get('email') || '').trim();
    if (!name || !email) return;

    setSaving('new');
    try {
      const res = await apiFetch('/api/team', {
        method: 'POST',
        body: JSON.stringify({
          action:       'user.invite',
          email,
          name,
          isAdmin:      false,
          allowedPages: DEFAULT_NEW_USER_PAGES,
        }),
      });
      const data = await res.json() as NewUserResult & { error?: string };
      if (!res.ok) {
        setAlert({ title: 'Error adding user', message: data.error ?? 'Unknown error' });
      } else {
        setNewUserResult(data);
        await reloadUsers();
        e.currentTarget.reset();
      }
    } catch (err) {
      setAlert({ title: 'Error', message: String(err) });
    } finally {
      setSaving(null);
    }
  };

  // ── Remove user ────────────────────────────────────────────────────────────
  const confirmRemove = async () => {
    if (!userToRemove) return;
    setSaving(userToRemove);
    try {
      const res = await apiFetch('/api/team', {
        method: 'POST',
        body: JSON.stringify({ action: 'user.delete', userId: userToRemove }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        setAlert({ title: 'Error removing user', message: data.error ?? 'Unknown error' });
      } else {
        await reloadUsers();
      }
    } catch (err) {
      setAlert({ title: 'Error', message: String(err) });
    } finally {
      setSaving(null);
      setUserToRemove(null);
    }
  };

  // ── Update permissions ─────────────────────────────────────────────────────
  const updatePermissions = async (userId: string, isAdmin: boolean, allowedPages: string[]) => {
    setSaving(userId);
    try {
      const res = await apiFetch('/api/team', {
        method: 'POST',
        body: JSON.stringify({ action: 'permissions.update', userId, isAdmin, allowedPages }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        setAlert({ title: 'Error saving permissions', message: data.error ?? 'Unknown error' });
      } else {
        await reloadUsers();
      }
    } catch (err) {
      setAlert({ title: 'Error', message: String(err) });
    } finally {
      setSaving(null);
    }
  };

  const setIsAdmin = (u: AppUser, isAdmin: boolean) => {
    const allowedPages = isAdmin
      ? ALL_ASSIGNABLE_PATHS
      : (u.allowedPages.length ? normalizeAllowedPages(u.allowedPages) : DEFAULT_NEW_USER_PAGES);
    void updatePermissions(u.id, isAdmin, allowedPages);
  };

  const togglePage = (u: AppUser, path: string, checked: boolean) => {
    if (u.isAdmin) return;
    const set = new Set(u.allowedPages);
    if (checked) set.add(path); else set.delete(path);
    void updatePermissions(u.id, false, normalizeAllowedPages([...set]));
  };

  const selectAllPages = (u: AppUser) => {
    void updatePermissions(u.id, false, ALL_ASSIGNABLE_PATHS);
  };

  const clearPages = (u: AppUser) => {
    void updatePermissions(u.id, false, []);
  };

  return (
    <div>
      <AlertDialog
        open={alert !== null}
        title={alert?.title ?? ''}
        message={alert?.message ?? ''}
        onClose={() => setAlert(null)}
      />

      <ConfirmDialog
        open={userToRemove !== null}
        title="Remove user?"
        message="This will permanently delete the user's account and revoke their access. Tasks and records assigned to them keep the saved name."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={confirmRemove}
        onCancel={() => setUserToRemove(null)}
      />

      {/* Temp password modal shown after invite */}
      {newUserResult && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
          }}
          onClick={() => setNewUserResult(null)}
        >
          <div
            className="card"
            style={{ maxWidth: '26rem', width: '100%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1rem' }}>
              <Key size={20} style={{ color: 'var(--primary-green)' }} />
              <h3 style={{ margin: 0 }}>User created</h3>
            </div>
            <p className="text-secondary text-sm" style={{ marginBottom: '1rem' }}>
              Share these credentials with <strong>{newUserResult.user.name}</strong>. They should change their password after first sign-in.
            </p>
            <div style={{ background: 'var(--surface-raised)', borderRadius: 'var(--radius-sm)', padding: '0.875rem 1rem', marginBottom: '1.25rem' }}>
              <p style={{ margin: '0 0 0.25rem', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Email</p>
              <p style={{ margin: '0 0 0.75rem', fontWeight: 600 }}>{newUserResult.user.email}</p>
              <p style={{ margin: '0 0 0.25rem', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Temporary password</p>
              <p style={{ margin: 0, fontWeight: 600, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {newUserResult.tempPassword}
              </p>
            </div>
            <button className="btn btn-primary w-full" onClick={() => setNewUserResult(null)}>
              Done
            </button>
          </div>
        </div>
      )}

      <p className="page-kicker">Access</p>
      <div className="mb-8">
        <h1 className="mb-2">Team & page access</h1>
        <p>
          Add people and choose which app pages each person can open. <strong>Administrators</strong> always have every
          page plus this screen. Changes take effect on the user's next sign-in.
        </p>
      </div>

      {/* Add user */}
      <div className="card mb-8">
        <h3 className="mb-4 flex items-center gap-2">
          <UserPlus size={20} /> Add user
        </h3>
        <form onSubmit={handleAdd} className="flex flex-col gap-4">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div>
              <label htmlFor="tu-name">Name</label>
              <input id="tu-name" name="name" required placeholder="Full name" />
            </div>
            <div>
              <label htmlFor="tu-email">Email</label>
              <input id="tu-email" name="email" type="email" required placeholder="name@company.com" />
            </div>
          </div>
          <p className="text-sm text-muted" style={{ margin: 0 }}>
            A temporary password will be generated. Share it with the new user — they'll sign in and should change it immediately.
          </p>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ alignSelf: 'flex-start' }}
            disabled={saving === 'new'}
          >
            {saving === 'new' ? 'Adding…' : 'Add user'}
          </button>
        </form>
      </div>

      {/* User cards */}
      <div className="flex flex-col gap-6">
        {users.map((u) => (
          <article key={u.id} className="card team-user-card" style={{ opacity: saving === u.id ? 0.6 : 1, transition: 'opacity 0.15s' }}>
            <div className="team-user-card__header">
              <div className="team-user-card__identity">
                <div className="team-user-card__avatar" aria-hidden>
                  {(u.name || u.email).slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <h3 className="team-user-card__name">{u.name || u.email}</h3>
                  <p className="team-user-card__email">{u.email}</p>
                  {u.id === currentUser?.id && (
                    <span className="badge badge-green" style={{ marginTop: '0.25rem' }}>You</span>
                  )}
                </div>
              </div>
              <div className="team-user-card__actions">
                <div className="team-admin-toggle">
                  <ShieldCheck size={18} className="team-admin-toggle__icon" aria-hidden />
                  <span className="team-admin-toggle__label" id={`admin-label-${u.id}`}>
                    Administrator
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={u.isAdmin}
                    aria-labelledby={`admin-label-${u.id}`}
                    className={`team-access-switch${u.isAdmin ? ' team-access-switch--on' : ''}`}
                    onClick={() => setIsAdmin(u, !u.isAdmin)}
                    disabled={saving === u.id}
                  >
                    <span className="team-access-switch__thumb" />
                  </button>
                </div>
                <button
                  type="button"
                  className="btn-icon btn-icon--danger"
                  title="Remove user"
                  onClick={() => setUserToRemove(u.id)}
                  disabled={u.id === currentUser?.id || saving === u.id}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <div className="team-user-card__access">
              <div className="team-access-section-head">
                <LayoutDashboard size={18} className="team-access-section-head__icon" aria-hidden />
                <div>
                  <p className="team-access-section-head__title">Page access</p>
                  <p className="team-access-section-head__hint">
                    Tap a page to allow or deny. Only enabled pages show in the sidebar.
                  </p>
                </div>
              </div>

              {u.isAdmin ? (
                <div className="team-access-admin-note">
                  <Check size={18} strokeWidth={2.5} aria-hidden />
                  <p>
                    Full access to every module plus <strong>Team & access</strong>. No need to set pages manually.
                  </p>
                </div>
              ) : (
                <>
                  <div className="team-access-bulk">
                    <button type="button" className="team-access-bulk__btn" onClick={() => selectAllPages(u)} disabled={saving === u.id}>
                      Enable all pages
                    </button>
                    <button type="button" className="team-access-bulk__btn" onClick={() => clearPages(u)} disabled={saving === u.id}>
                      Clear all pages
                    </button>
                  </div>
                  <div className="team-access-grid">
                    {PAGE_OPTIONS.map((p) => {
                      const on = u.allowedPages.includes(p.path);
                      return (
                        <button
                          key={p.path}
                          type="button"
                          className={`team-access-tile${on ? ' team-access-tile--on' : ''}`}
                          aria-pressed={on}
                          onClick={() => togglePage(u, p.path, !on)}
                          disabled={saving === u.id}
                        >
                          <span className="team-access-tile__indicator" aria-hidden>
                            {on ? <Check size={16} strokeWidth={3} /> : null}
                          </span>
                          <span className="team-access-tile__label">{p.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </article>
        ))}
      </div>

      <div className="card mt-8">
        <h3 className="mb-2 flex items-center gap-2">
          <Users size={20} /> Summary
        </h3>
        <p className="text-sm text-muted mb-0">
          {users.length} user{users.length !== 1 ? 's' : ''}. Non-admins only see sidebar links for pages you enable
          above. Direct URLs to other pages show &quot;No access&quot;. Permission changes take effect on the user&apos;s next sign-in.
        </p>
      </div>
    </div>
  );
}
