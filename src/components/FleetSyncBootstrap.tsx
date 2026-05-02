import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { initFleetWorkspaceSync } from '@/lib/fleetWorkspace';

/**
 * Subscribes to fleet localStorage mutations and syncs with /api/fleet when online.
 * Mount once inside the authenticated layout.
 */
export default function FleetSyncBootstrap() {
  const { currentUser } = useAuth();

  useEffect(() => {
    if (!currentUser) return;
    return initFleetWorkspaceSync();
  }, [currentUser?.id]);

  return null;
}
