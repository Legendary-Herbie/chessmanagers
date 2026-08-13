import { createContext, useContext } from 'react';

export const AuthContext = createContext(null);
export const ClubContext = createContext(null);
export const ThemeContext = createContext(null);
export const NotificationsContext = createContext(null);

function useRequiredContext(context, name) {
    const value = useContext(context);
    if (!value) throw new Error(`${name} must be used within its provider`);
    return value;
}

export const useAuth = () => useRequiredContext(AuthContext, 'useAuth');
export const useClub = () => useRequiredContext(ClubContext, 'useClub');
export const useTheme = () => useRequiredContext(ThemeContext, 'useTheme');
export const useNotifications = () => useRequiredContext(NotificationsContext, 'useNotifications');
