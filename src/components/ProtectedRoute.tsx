import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { userCanAccessPath } from '../lib/permissions';
import AccessDenied from '../pages/AccessDenied';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, currentUser, isLoading } = useAuth();
  const { pathname } = useLocation();

  // Still resolving the session — show nothing (prevents flash-to-login)
  if (isLoading) return null;

  // Not signed in → send to login, preserving the intended destination
  if (!session || !currentUser) {
    return <Navigate to="/login" state={{ from: pathname }} replace />;
  }

  // Signed in but no permission for this page
  if (!userCanAccessPath(pathname, currentUser)) {
    return <AccessDenied />;
  }

  return <>{children}</>;
}
