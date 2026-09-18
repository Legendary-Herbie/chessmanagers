import { useEffect } from 'react';

const locks = new Set();
let previousOverflow = '';

export function useBodyScrollLock(enabled = true) {
    useEffect(() => {
        if (!enabled) return;
        const token = Symbol('scroll-lock');
        if (locks.size === 0) {
            previousOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
        }
        locks.add(token);
        return () => {
            locks.delete(token);
            if (locks.size === 0) document.body.style.overflow = previousOverflow;
        };
    }, [enabled]);
}
