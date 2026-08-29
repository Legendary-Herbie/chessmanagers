import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './contextHooks.js';

// Layouts
import AppLayout from '../shared/layouts/AppLayout.jsx';
import PublicLayout from '../shared/layouts/PublicLayout.jsx';

// Pages — auth
import AuthPage    from '../pages/auth/AuthPage.jsx';
import LoginView   from '../pages/auth/LoginView.jsx';
import RegisterView from '../pages/auth/RegisterView.jsx';
import VerificationPendingView from '../pages/auth/VerificationPendingView.jsx';
import VerifyEmailView from '../pages/auth/VerifyEmailView.jsx';
import ForgotPasswordView from '../pages/auth/ForgotPasswordView.jsx';
import ResetPasswordView from '../pages/auth/ResetPasswordView.jsx';
import OAuthCallbackView from '../pages/auth/OAuthCallbackView.jsx';
import AccountPage from '../pages/auth/AccountPage.jsx';

// Pages — app
import Landing     from '../pages/Landing.jsx';
import Dashboard       from '../pages/Dashboard.jsx';
import CreateClub  from '../pages/CreateClub.jsx';
import NotFound    from '../pages/NotFound.jsx';

// Feature pages
import PlayersPage    from '../pages/players/PlayersPage.jsx';
import PlayerPage     from '../pages/players/PlayerPage.jsx';
import MatchesPage    from '../pages/matches/MatchesPage.jsx';
import TournamentsPage from '../pages/tournaments/TournamentsPage.jsx';
import TournamentPage  from '../pages/tournaments/TournamentPage.jsx';
import LeaderboardPage from '../pages/leaderboard/LeaderboardPage.jsx';
import ClubPage        from '../pages/club/ClubPage.jsx';
import FindClubsPage   from '../pages/club/FindClubsPage.jsx';
import ClubInviteHandler from '../pages/club/ClubInviteHandler.jsx';
import PublicClubPage  from '../pages/club/PublicClubPage.jsx';
import PublicPlayerPage from '../pages/club/PublicPlayerPage.jsx';
import PublicTournamentPage from '../pages/club/PublicTournamentPage.jsx';
import AnnouncementsPage from '../pages/announcements/AnnouncementsPage.jsx';
import AnnouncementPage from '../pages/announcements/AnnouncementPage.jsx';

// ─── Route guards ──────────────────────────────────────────────────────────────

/**
 * Redirects to /auth/login if not authenticated.
 * Shows nothing while auth is still loading to prevent flash.
 */
function RequireAuth({ children }) {
    const { user, loading } = useAuth();
    if (loading) return null;
    if (!user) return <Navigate to="/auth/login" replace />;
    return children;
}

/**
 * Redirects to /dashboard if already authenticated.
 * Used to prevent logged-in users from seeing auth pages.
 */
function RequireGuest({ children }) {
    const { user, loading } = useAuth();
    const location = useLocation();
    if (loading) return null;
    if (user && !['/auth/oauth/callback', '/auth/verify'].includes(location.pathname)) {
        return <Navigate to="/dashboard" replace />;
    }
    return children;
}

// ─── Route tree ───────────────────────────────────────────────────────────────

export default function AppRoutes() {
    return (
        <Routes>
            {/* ── Public ───────────────────────────────────────────────── */}
            <Route path="/" element={<Landing />} />

            {/* Find clubs (public) */}
            <Route element={<PublicLayout />}>
                <Route path="/clubs" element={<FindClubsPage />} />
                <Route path="/clubs/join" element={<ClubInviteHandler />} />
                <Route path="/clubs/:clubId" element={<PublicClubPage />} />
                <Route path="/clubs/:clubId/players/:publicPlayerId" element={<PublicPlayerPage />} />
                <Route path="/clubs/:clubId/tournaments/:tournamentId" element={<PublicTournamentPage />} />
            </Route>

            {/* ── Auth ─────────────────────────────────────────────────── */}
            <Route
                path="/auth"
                element={
                    <RequireGuest>
                        <AuthPage />
                    </RequireGuest>
                }
            >
                <Route index element={<Navigate to="login" replace />} />
                <Route path="login"    element={<LoginView />} />
                <Route path="register" element={<RegisterView />} />
                <Route path="verification-pending" element={<VerificationPendingView />} />
                <Route path="verify" element={<VerifyEmailView />} />
                <Route path="forgot-password" element={<ForgotPasswordView />} />
                <Route path="reset-password" element={<ResetPasswordView />} />
                <Route path="oauth/callback" element={<OAuthCallbackView />} />
            </Route>

            {/* ── Protected app ─────────────────────────────────────────── */}
            <Route
                element={
                    <RequireAuth>
                        <AppLayout />
                    </RequireAuth>
                }
            >
                {/* Dashboard */}
                <Route path="/dashboard" element={<Dashboard />} />

                {/* Create club — shown when user has no club yet */}
                <Route path="/create-club" element={<CreateClub />} />

                {/* Leaderboard */}
                <Route path="/leaderboard" element={<LeaderboardPage />} />

                {/* Players */}
                <Route path="/players"          element={<PlayersPage />} />
                <Route path="/players/:playerId" element={<PlayerPage />} />

                {/* Matches */}
                <Route path="/matches" element={<MatchesPage />} />

                {/* Tournaments */}
                <Route path="/tournaments"                element={<TournamentsPage />} />
                <Route path="/tournaments/:tournamentId"  element={<TournamentPage />} />

                <Route path="/announcements" element={<AnnouncementsPage />} />
                <Route path="/announcements/:announcementId" element={<AnnouncementPage />} />

                {/* Club dashboard — authenticated users (admin controls shown only to club admins) */}
                <Route path="/club" element={<ClubPage />} />
                <Route path="/account" element={<AccountPage />} />
            </Route>

            {/* ── 404 ──────────────────────────────────────────────────── */}
            <Route path="*" element={<NotFound />} />
        </Routes>
    );
}
