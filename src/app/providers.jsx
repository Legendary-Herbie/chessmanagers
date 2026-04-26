// providers.jsx — root composer only.
// Each provider lives in its own file; import from there directly
// when you need the hook (e.g. import { useAuth } from './AuthProvider.jsx').

import { ThemeProvider }         from './ThemeProvider.jsx';
import { NotificationsProvider } from './NotificationsProvider.jsx';
import { AuthProvider }          from './AuthProvider.jsx';
import { ClubProvider }          from './ClubProvider.jsx';


export default function Providers({ children }) {
    return (
        <ThemeProvider>
            <NotificationsProvider>
                <AuthProvider>
                    <ClubProvider>
                        {children}
                    </ClubProvider>
                </AuthProvider>
            </NotificationsProvider>
        </ThemeProvider>
    );
}