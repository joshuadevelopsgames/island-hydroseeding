import { useState, type FormEvent } from 'react';
import { Users, Trash2, UserPlus, ShieldCheck, Check, LayoutDashboard } from 'lucide-react';
import AlertDialog from '../components/AlertDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import { useAuth, DEFAULT_NEW_USER_PAGES } from '../context/AuthContext';
import type { AppUser } from '../context/AuthContext';
import { ALL_ASSIGNABLE_PATHS, PAGE_OPTIONS, normalizeAllowedPages } from '../lib/permissions';

export default function Team() {
  const { users, currentUser, saveUsers, setCurrentUserId } = useAuth();
  const [minUsersAlertOpen, setMinUsersAlertOpen] = useState(false);
  const [userToRemove, setUserToRemove] = useState<string | null>(null);

  const handleAdd = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get('name') || '').trim();
    const email = String(fd.get('email') || '').trim();
    if (!name) return;
    const row: AppUser = {
      id: `u-${Math.random().toString(36).slice(2, 10)}`,
      name,
      email: email || `${name.toLowerCase().replace(/\s+/g, '.')}@islandhydroseeding.com`,
      isAdmin: false,
      allowedPages: [...DEFAULT_NEW_USER_PAGES],
    };
    saveUsers([...users, row]);
    e.currentTarget.reset();
  };

  const remove = (id: string) => {
    if (users.length <= 1) {
      setMinUsersAlertOpen(true);
      return;
    }
    setUserToRemove(id);
  };

  const confirmRemoveUser = () => {
    if (!userToRemove) return;
    const next = users.filter((u) => u.id !== userToRemove);
    saveUsers(next);
    if (currentUser?.id === userToRemove) {
      setCurrentUserId(next[0].id);
    }
    setUserToRemove(null);
  };

  const setIsAdmin = (id: string, isAdmin: boolean) => {
    saveUsers(
      users.map((u) => {
        if (u.id !== id) return u;
        if (isAdmin) {
          return { ...u, isAdmin: true, allowedPages: [...ALL_ASSIGNABLE_PATHS] };
        }
        return {
          ...u,
          isAdmin: false,
          allowedPages: u.allowedPages.length ? normalizeAllowedPages(u.allowedPages) : [...DEFAULT_NEW_USER_PAGES],
        };
      })
    );
  };

  const togglePage = (userId: string, path: string, checked: boolean) => {
    const u = users.find((x) => x.id === userId);
    if (!u || u.isAdmin) return;
    const set = new Set(u.allowedPages);
    if (checked) set.add(path);
    else set.delete(path);
    const nextPages = normalizeAllowedPages([...set]);
    saveUsers(users.map((x) => (x.id === userId ? { ...x, allowedPages: nextPages } : x)));
  };

  const selectAllPages = (userId: string) => {
    const u = users.find((x) => x.id === userId);
    if (!u || u.isAdmin) return;
    saveUsers(users.map((x) => (x.id === userId ? { ...x, allowedPages: [...ALL_ASSIGNABLE_PATHS] } : x)));
  };

  const clearPages = (userId: string) => {
    const u = users.find((x) => x.id === userId);
    if (!u || u.isAdmin) return;
    saveUsers(users.map((x) => (x.id === userId ? { ...x, allowedPages: [] } : x)));
  };

  return (
    <div>
      <AlertDialog
        open={minUsersAlertOpen}
        title="Cannot remove user"
        message="Keep at least one user in the app."
        onClose={() => setMinUsersAlertOpen(false)}
      />
      <ConfirmDialog
        open={userToRemove !== null}
        title="Remove user?"
        message="Remove this person from the team? Tasks assigned to them keep the saved name."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={confirmRemoveUser}
        onCancel={() => setUserToRemove(null)}
      />

      <p className="page-kicker">Access</p>
      <div className="mb-8">
        <h1 className="mb-2">Team & page access</h1>
        <p>
          Add people and choose which app pages each person can open. <strong>Administrators</strong> always have every
          page plus this screen. Stored locally in the browser.
        </p>
      </div>

      {currentUser?.isAdmin && (
        <div className="card mb-8">
          <h3 className="mb-2" style={{ fontSize: '1.0625rem' }}>
            Preview as user
          </h3>
          <p className="text-sm text-muted mb-4" style={{ marginTop: 0 }}>
            Open the app with another team member&apos;s permissions (useful for checking access before you save changes).
          </p>
          <label htmlFor="team-preview-user" className="sr-only">
            Preview as user
          </label>
          <select
            id="team-preview-user"
            className="sidebar-user-select"
            style={{ maxWidth: '28rem', width: '100%' }}
            value={currentUser.id}
            onChange={(e) => setCurrentUserId(e.target.value)}
            aria-label="Preview as user"
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
                {u.isAdmin ? ' (Admin)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

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
              <input id="tu-email" name="email" type="email" placeholder="name@company.com" />
            </div>
          </div>
          <p className="text-sm text-muted" style={{ margin: 0 }}>
            New users get a default set of pages. Adjust access tiles on their card after adding.
          </p>
          <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
            Add user
          </button>
        </form>
      </div>

      <div className="flex flex-col gap-6">
        {users.map((u) => (
          <article key={u.id} className="card team-user-card">
            <div className="team-user-card__header">
              <div className="team-user-card__identity">
                <div className="team-user-card__avatar" aria-hidden>
                  {u.name.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <h3 className="team-user-card__name">{u.name}</h3>
                  <p className="team-user-card__email">{u.email}</p>
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
                    onClick={() => setIsAdmin(u.id, !u.isAdmin)}
                  >
                    <span className="team-access-switch__thumb" />
                  </button>
                </div>
                <button
                  type="button"
                  className="btn-icon btn-icon--danger"
                  title="Remove user"
                  onClick={() => remove(u.id)}
                  disabled={users.length <= 1}
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
                    <button type="button" className="team-access-bulk__btn" onClick={() => selectAllPages(u.id)}>
                      Enable all pages
                    </button>
                    <button type="button" className="team-access-bulk__btn" onClick={() => clearPages(u.id)}>
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
                          onClick={() => togglePage(u.id, p.path, !on)}
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
          above. Direct URLs to other pages show &quot;No access&quot;.
        </p>
      </div>
    </div>
  );
}
