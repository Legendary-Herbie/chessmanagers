import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../config/api.js';
import { useAuth } from '../../app/providers.jsx';
import { useNotifications } from '../../app/NotificationsProvider.jsx';

export default function ClubInviteHandler() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const navigate = useNavigate();
    const { user } = useAuth();
    const { notify } = useNotifications();

    useEffect(() => {
        async function acceptToken() {
            if (!token) {
                notify('Invite token missing', 'error');
                navigate('/clubs');
                return;
            }

            if (!user) {
                // Not authenticated — redirect to register/login carrying the token
                navigate(`/auth/register?inviteToken=${encodeURIComponent(token)}`);
                return;
            }

            try {
                const res = await api.post('/clubs/join-by-token', { token });
                notify('You have joined the club.', 'success');
                // If server returns clubId, navigate to its public page
                const clubId = res?.clubId || null;
                navigate(clubId ? `/clubs/${clubId}` : '/club');
            } catch (err) {
                notify(err?.message || 'Failed to accept invite', 'error');
                navigate('/clubs');
            }
        }

        acceptToken();
    }, [token, user, navigate, notify]);

    return <div>Processing invite…</div>;
}
