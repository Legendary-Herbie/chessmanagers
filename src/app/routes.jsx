import React, { lazy, Suspense } from 'react';
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

// Pages — app
import Landing     from '../pages/Landing.jsx';
import NotFound    from '../pages/NotFound.jsx';

// Route-level splitting keeps feature code out of the landing/authentication bundle.
const AccountPage = lazy(() => import('../pages/auth/AccountPage.jsx'));
const Dashboard = lazy(() => import('../pages/Dashboard.jsx'));
const CreateClub = lazy(() => import('../pages/CreateClub.jsx'));
const PlayersPage = lazy(() => import('../pages/players/PlayersPage.jsx'));
const PlayerPage = lazy(() => import('../pages/players/PlayerPage.jsx'));
const MatchesPage = lazy(() => import('../pages/matches/MatchesPage.jsx'));
const TournamentsPage = lazy(() => import('../pages/tournaments/TournamentsPage.jsx'));
const TournamentPage = lazy(() => import('../pages/tournaments/TournamentPage.jsx'));
const LeaderboardPage = lazy(() => import('../pages/leaderboard/LeaderboardPage.jsx'));
const ClubPage = lazy(() => import('../pages/club/ClubPage.jsx'));
const FindClubsPage = lazy(() => import('../pages/club/FindClubsPage.jsx'));
const ClubInviteHandler = lazy(() => import('../pages/club/ClubInviteHandler.jsx'));
const PublicClubPage = lazy(() => import('../pages/club/PublicClubPage.jsx'));
const PublicPlayerPage = lazy(() => import('../pages/club/PublicPlayerPage.jsx'));
const PublicTournamentPage = lazy(() => import('../pages/club/PublicTournamentPage.jsx'));
const AnnouncementsPage = lazy(() => import('../pages/announcements/AnnouncementsPage.jsx'));
const AnnouncementPage = lazy(() => import('../pages/announcements/AnnouncementPage.jsx'));

function LazyPage({ component }) {
    return (
        <Suspense fallback={<div className="page-loading" role="status">Loading page…</div>}>
            {React.createElement(component)}
        </Suspense>
    );
}

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
            <Route path="/" element={<RequireGuest><Landing /></RequireGuest>} />

            {/* Find clubs (public) */}
            <Route element={<PublicLayout />}>
                <Route path="/clubs" element={<LazyPage component={FindClubsPage} />} />
                <Route path="/clubs/join" element={<LazyPage component={ClubInviteHandler} />} />
                <Route path="/clubs/:clubId" element={<LazyPage component={PublicClubPage} />} />
                <Route path="/clubs/:clubId/players/:publicPlayerId" element={<LazyPage component={PublicPlayerPage} />} />
                <Route path="/clubs/:clubId/tournaments/:tournamentId" element={<LazyPage component={PublicTournamentPage} />} />
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
                <Route path="/dashboard" element={<LazyPage component={Dashboard} />} />

                {/* Create club — shown when user has no club yet */}
                <Route path="/create-club" element={<LazyPage component={CreateClub} />} />

                {/* Leaderboard */}
                <Route path="/leaderboard" element={<LazyPage component={LeaderboardPage} />} />

                {/* Players */}
                <Route path="/players"          element={<LazyPage component={PlayersPage} />} />
                <Route path="/players/:playerId" element={<LazyPage component={PlayerPage} />} />

                {/* Matches */}
                <Route path="/matches" element={<LazyPage component={MatchesPage} />} />

                {/* Tournaments */}
                <Route path="/tournaments"                element={<LazyPage component={TournamentsPage} />} />
                <Route path="/tournaments/:tournamentId"  element={<LazyPage component={TournamentPage} />} />

                <Route path="/announcements" element={<LazyPage component={AnnouncementsPage} />} />
                <Route path="/announcements/:announcementId" element={<LazyPage component={AnnouncementPage} />} />

                {/* Club dashboard — authenticated users (admin controls shown only to club admins) */}
                <Route path="/club" element={<LazyPage component={ClubPage} />} />
                <Route path="/account" element={<LazyPage component={AccountPage} />} />
            </Route>

            {/* ── 404 ──────────────────────────────────────────────────── */}
            <Route path="*" element={<NotFound />} />
        </Routes>
    );
}
