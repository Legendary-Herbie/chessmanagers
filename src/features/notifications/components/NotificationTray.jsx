import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClub } from '../../../app/contextHooks.js';
import { notificationApi } from '../api/notificationApi.js';
import { notificationDestination } from '../notificationDestination.js';

const EVENT_COPY = {
    'membership.request_pending': 'A membership request needs review.',
    'join_request.approved': 'Your membership request was approved.',
    'join_request.rejected': 'Your membership request was not approved.',
    'player_claim.approved': 'Your player claim was approved.',
    'player_claim.pending': 'A player claim needs review.',
    'player_claim.rejected': 'Your player claim was not approved.',
    'player_link.unlinked': 'Your player profile was unlinked.',
    'match.recorded': 'A match involving your player was recorded.',
    'match.corrected': 'A match involving your player was corrected.',
    'match.voided': 'A match involving your player was voided.',
    'match.deleted': 'A match involving your player was deleted.',
    'tournament.registered': 'Your player was registered for a tournament.',
    'tournament.removed': 'Your player was removed from a tournament.',
    'tournament.withdrawn': 'Your player was withdrawn from a tournament.',
    'tournament.pairing': 'A new tournament pairing is ready.',
    'tournament.result': 'A tournament result was recorded.',
    'tournament.status': 'A tournament status changed.',
    'announcement.published': 'A club announcement was published.',
};

function notificationDetail(notification) {
    const payload = notification.payload || {};
    if (notification.eventType.startsWith('match.')) {
        return `${payload.whitePlayerName || 'White player'} vs ${payload.blackPlayerName || 'Black player'}`;
    }
    if (notification.eventType.startsWith('tournament.')) return payload.tournamentName;
    if (notification.eventType === 'membership.request_pending') return payload.applicantName;
    if (notification.eventType === 'player_claim.pending') return `${payload.applicantName || 'Applicant'} · ${payload.playerName || 'Player'}`;
    if (notification.eventType === 'announcement.published') return payload.title;
    if (notification.eventType.startsWith('player_')) return payload.playerName;
    return null;
}

function BellIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export default function NotificationTray() {
    const navigate = useNavigate();
    const { selectClub, activeClubs = [] } = useClub();
    const trayRef = useRef(null);
    const [open, setOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [deletingId, setDeletingId] = useState(null);
    const [mutating, setMutating] = useState(false);
    const mutationPending = useRef(false);
    const loadVersion = useRef({ value: 0 });
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        if (mutationPending.current) return;
        const version = ++loadVersion.current.value;
        setLoading(true);
        setError(null);
        try {
            const [list, unread] = await Promise.all([
                notificationApi.list({ limit: 30 }),
                notificationApi.unreadCount(),
            ]);
            if (version !== loadVersion.current.value) return;
            setNotifications(list.notifications);
            setUnreadCount(unread.count);
        } catch (loadError) {
            if (version === loadVersion.current.value) setError(loadError.message || 'Could not load notifications.');
        } finally {
            if (version === loadVersion.current.value) setLoading(false);
        }
    }, []);

    useEffect(() => {
        const requestState = loadVersion.current;
        load();
        const timer = setInterval(load, 60_000);
        return () => { clearInterval(timer); requestState.value++; };
    }, [load]);

    useEffect(() => {
        if (!open) return undefined;
        const close = event => {
            if (!trayRef.current?.contains(event.target)) setOpen(false);
        };
        const escape = event => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', close);
        document.addEventListener('keydown', escape);
        return () => {
            document.removeEventListener('mousedown', close);
            document.removeEventListener('keydown', escape);
        };
    }, [open]);

    const toggle = async () => {
        const next = !open;
        setOpen(next);
        if (next) await load();
    };

    const runMutation = async (request, update, fallback) => {
        if (mutationPending.current) return;
        mutationPending.current = true;
        loadVersion.current.value++;
        setLoading(false);
        setMutating(true);
        setError(null);
        try {
            await request();
            update();
            return true;
        } catch (requestError) {
            setError(requestError.message || fallback);
            return false;
        } finally {
            mutationPending.current = false;
            setMutating(false);
        }
    };

    const markRead = notification => {
        if (notification.readAt) return true;
        return runMutation(() => notificationApi.markRead(notification.id), () => {
            setNotifications(current => current.map(item => (
                item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item
            )));
            setUnreadCount(current => Math.max(0, current - 1));
        }, 'Could not mark the notification as read. Please try again.');
    };

    const markAllRead = () => runMutation(() => notificationApi.markAllRead(), () => {
        const readAt = new Date().toISOString();
        setNotifications(current => current.map(item => ({ ...item, readAt: item.readAt || readAt })));
        setUnreadCount(0);
    }, 'Could not mark notifications as read. Please try again.');

    const openNotification = async notification => {
        const marked = await markRead(notification);
        if (marked === false) return;
        const canSelectClub = activeClubs.some(entry => entry.club.id === notification.clubId);
        if (notification.clubId && canSelectClub) await selectClub(notification.clubId);
        setOpen(false);
        navigate(notificationDestination(notification));
    };

    const dismiss = async notification => {
        if (mutationPending.current) return;
        setDeletingId(notification.id);
        await runMutation(() => notificationApi.dismiss(notification.id), () => {
            setNotifications(current => current.filter(item => item.id !== notification.id));
            if (!notification.readAt) setUnreadCount(current => Math.max(0, current - 1));
        }, 'Could not delete the notification.');
        setDeletingId(null);
    };

    return (
        <div className="notification-tray" ref={trayRef}>
            <button
                type="button"
                className="notification-tray__trigger"
                aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
                aria-haspopup="dialog"
                aria-expanded={open}
                onClick={toggle}
            >
                <BellIcon />
                {unreadCount > 0 && (
                    <span className="notification-tray__badge" aria-hidden="true">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {open && (
                <section className="notification-tray__panel" role="dialog" aria-label="Notifications">
                    <div className="notification-tray__header">
                        <div>
                            <strong>Notifications</strong>
                            <span>{unreadCount ? `${unreadCount} unread` : 'All caught up'}</span>
                        </div>
                        {unreadCount > 0 && (
                            <button type="button" disabled={mutating} onClick={markAllRead}>Mark all read</button>
                        )}
                    </div>

                    {loading && notifications.length === 0 && (
                        <p className="notification-tray__state">Loading notifications…</p>
                    )}
                    {error && <p className="notification-tray__state notification-tray__state--error" role="alert">{error}</p>}
                    {!loading && !error && notifications.length === 0 && (
                        <p className="notification-tray__state">No notifications yet.</p>
                    )}
                    {notifications.length > 0 && (
                        <ul className="notification-tray__list">
                            {notifications.map(notification => (
                                <li key={notification.id}>
                                    <div className="notification-tray__row">
                                        <button
                                            type="button"
                                            className={`notification-tray__item${notification.readAt ? '' : ' notification-tray__item--unread'}`}
                                            onClick={() => openNotification(notification)}
                                            disabled={mutating}
                                        >
                                            <span className="notification-tray__item-copy">
                                                <strong>{EVENT_COPY[notification.eventType] || 'Club update'}</strong>
                                                {notificationDetail(notification) && <span>{notificationDetail(notification)}</span>}
                                                <small>{notification.clubName}</small>
                                                <span className="notification-tray__action">Open relevant page →</span>
                                            </span>
                                            {!notification.readAt && <span className="notification-tray__unread-dot" aria-label="Unread" />}
                                        </button>
                                        <button type="button" className="notification-tray__delete"
                                            aria-label={`Delete notification: ${EVENT_COPY[notification.eventType] || 'Club update'}`}
                                            disabled={mutating || deletingId === notification.id}
                                            onClick={() => dismiss(notification)}>
                                            <span aria-hidden="true">×</span>
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}
        </div>
    );
}
