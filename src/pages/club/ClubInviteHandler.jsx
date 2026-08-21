import React, { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, useClub, useNotifications } from '../../app/contextHooks.js';
import { clubApi } from '../../features/clubs/api/clubApi.js';

export default function ClubInviteHandler() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const code = searchParams.get('code');
    const navigate = useNavigate();
    const { user } = useAuth();
    const { refreshClubs } = useClub();
    const { notify } = useNotifications();

    useEffect(() => {
        if ((!token && !code) || !user) return;
        async function acceptMembership() {
            try {
                const result = token
                    ? await clubApi.acceptInvite(token)
                    : await clubApi.joinByCode(code);
                await refreshClubs(result.clubId);
                notify('You have joined the club.', 'success');
                navigate('/dashboard', { replace: true });
            } catch (err) {
                notify(err?.message || 'Failed to join club', 'error');
                navigate('/clubs', { replace: true });
            }
        }
        acceptMembership();
    }, [code, token, user, navigate, notify, refreshClubs]);

    if (!token && !code) return <p>Invite token or join code missing.</p>;
    if (!user) {
        const continuation = token
            ? `inviteToken=${encodeURIComponent(token)}`
            : `joinCode=${encodeURIComponent(code)}`;
        return <div><h1>Join a chess club</h1><p>Create an account or sign in to continue.</p><Link to={`/auth/register?${continuation}`}>Create an account</Link>{' · '}<Link to={`/auth/login?${continuation}`}>Sign in</Link></div>;
    }
    return <p>Processing membership…</p>;
}
