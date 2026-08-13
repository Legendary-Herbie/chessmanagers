import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, endpoints } from '../../config/api.js';
import { useAuth, useNotifications } from '../../app/contextHooks.js';

export default function ClubInviteHandler() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const navigate = useNavigate();
    const { user } = useAuth();
    const { notify } = useNotifications();

    useEffect(() => {
        if (!token || !user) return;
        async function acceptToken() {
            try {
                const result = await api.post(endpoints.clubs.joinByToken(), { token });
                notify('You have joined the club.', 'success');
                navigate(`/clubs/${result.clubId}`, { replace: true });
            } catch (err) {
                notify(err?.message || 'Failed to accept invite', 'error');
                navigate('/clubs', { replace: true });
            }
        }
        acceptToken();
    }, [token, user, navigate, notify]);

    if (!token) return <p>Invite token missing.</p>;
    if (!user) {
        const encoded = encodeURIComponent(token);
        return <div><h1>You’ve been invited to join a club</h1><p>Create an account or sign in to accept this invite.</p><Link to={`/auth/register?inviteToken=${encoded}`}>Create an account</Link>{' · '}<Link to={`/auth/login?inviteToken=${encoded}`}>Sign in</Link></div>;
    }
    return <p>Processing invite…</p>;
}
