import { useState, useCallback } from 'react';

// Lightweight in-app toast system.
// Usage:
//   const { notify } = useNotifications();
//   notify('Match recorded', 'success');
//   notify('Something went wrong', 'error');

import { NotificationsContext } from './contextHooks.js';

let _id = 0;

export function NotificationsProvider({ children }) {
    const [notifications, setNotifications] = useState([]);

    const dismiss = useCallback((id) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    const notify = useCallback((message, type = 'info', duration = 4000) => {
        const id = ++_id;
        setNotifications(prev => [...prev, { id, message, type }]);
        if (duration > 0) {
            setTimeout(() => dismiss(id), duration);
        }
    }, [dismiss]);

    return (
        <NotificationsContext.Provider value={{ notifications, notify, dismiss }}>
            {children}
        </NotificationsContext.Provider>
    );
}
