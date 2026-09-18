import ErrorBoundary, { CardError } from '../shared/common/ErrorBoundary.jsx';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Providers from './providers.jsx';
import AppRoutes from './routes.jsx';
import { useEffect } from 'react';
import { useAuth } from './contextHooks.js';
import { clearToken } from '../config/api.js';


function AuthLogoutListener() {
    const { logout } = useAuth();

    useEffect(() => {
        const handle = () => {
            clearToken();
            logout(false);
        };
        window.addEventListener('auth:logout', handle);
        return () => window.removeEventListener('auth:logout', handle);
    }, [logout]);

    return null;
}

// ─── App ──────────────────────────────────────────────────────────────────────

const router = createBrowserRouter([{ path: '*', errorElement: <CardError message="The app could not be displayed." onRetry={() => window.location.reload()} />, element:
            <Providers>
                <AuthLogoutListener />
                <AppRoutes />
            </Providers>
}]);

export default function App() {
    return <ErrorBoundary message="The app could not be displayed."><RouterProvider router={router} /></ErrorBoundary>;
}
