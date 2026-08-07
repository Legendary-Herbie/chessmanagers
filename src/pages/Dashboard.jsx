import React from 'react';
import { useAuth, useClub } from '../app/providers.jsx';
import PendingLinksList from '../features/players/admin/PendingLinksList.jsx';

export default function Dashboard() {
  const { isAdmin } = useAuth();
  const { club } = useClub();

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '1.75rem', color: 'var(--text-strong)' }}>Dashboard</h1>
        <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)' }}>
          Welcome back{club?.name ? ` to ${club.name}` : ''}!
        </p>
      </div>

      {/* Pending player claim requests for admins */}
      {isAdmin && club?.id && (
        <PendingLinksList clubId={club.id} />
      )}
    </div>
  );
}