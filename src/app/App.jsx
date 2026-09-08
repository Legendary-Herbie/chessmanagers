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

const router = createBrowserRouter([{ path: '*', element:
            <Providers>
                <AuthLogoutListener />
                <AppRoutes />
            </Providers>
}]);

export default function App() {
    return <RouterProvider router={router} />;
}
