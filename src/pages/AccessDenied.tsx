import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { userCanAccessPath } from '../lib/permissions';

export default function AccessDenied() {
  const { currentUser } = useAuth();
  const dashboardOk = currentUser ? userCanAccessPath('/', currentUser) : false;

  return (
    <div className="card" style={{ maxWidth: '520px', margin: '3rem auto', textAlign: 'center' }}>
      <ShieldAlert size={40} style={{ margin: '0 auto 1rem', color: 'var(--lawn-green)' }} />
      <h1 className="mb-2" style={{ fontSize: '1.5rem' }}>
        No access
      </h1>
      <p className="text-secondary mb-4">
        Your account is not allowed to open this page. Ask an administrator to grant page access on{' '}
        <strong>Team &amp; access</strong>.
      </p>
      {dashboardOk ? (
        <Link to="/" className="btn btn-primary">
          Back to dashboard
        </Link>
      ) : (
        <p className="text-secondary text-sm">Switch to a user with dashboard access if available.</p>
      )}
    </div>
  );
}
