import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { userCanAccessPath } from '../lib/permissions';
import AccessDenied from '../pages/AccessDenied';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  const { pathname } = useLocation();

  if (!currentUser) {
    return (
      <div className="card" style={{ maxWidth: '480px', margin: '3rem auto' }}>
        <h2 className="mb-2">No signed-in user</h2>
        <p className="text-secondary">
          Add at least one user on the Team page (admin) or clear site data and reload to restore defaults.
        </p>
      </div>
    );
  }

  if (!userCanAccessPath(pathname, currentUser)) {
    return <AccessDenied />;
  }

  return <>{children}</>;
}
