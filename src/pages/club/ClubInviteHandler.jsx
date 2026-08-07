import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider.jsx';
import { api, endpoints } from '../../config/api.js';

export default function ClubInviteHandler() {
    const { clubId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [status, setStatus] = useState('processing');

    useEffect(() => {
        async function acceptInvite() {
            const params = new URLSearchParams(window.location.search);
            const token = params.get('token');

            if (!token) {
                // If no token but clubId present, redirect to public club page
                if (clubId) return navigate(`/clubs/${clubId}`);
                setStatus('invalid');
                return;
            }

            if (!user) {
                // Not authenticated — redirect to register with invite token
                const url = `/auth/register?inviteToken=${encodeURIComponent(token)}`;
                navigate(url, { replace: true });
                return;
            }

            try {
                // Authenticated — accept invite token
                await api.post(endpoints.clubs.joinByToken(), { token });
                setStatus('joined');
                setTimeout(() => navigate('/club', { replace: true }), 800);
            } catch (err) {
                console.error('Invite accept failed', err);
                setStatus('failed');
            }
        }
        acceptInvite();
    }, [clubId, user]);

    if (status === 'processing') return <div className="muted">Processing invite…</div>;
    if (status === 'invalid') return <div className="muted">Invalid invite link.</div>;
    if (status === 'failed') return <div className="muted">Failed to accept invite. Try again later or contact the club admin.</div>;
    if (status === 'joined') return <div className="muted">Successfully joined — redirecting…</div>;

    return null;
}
