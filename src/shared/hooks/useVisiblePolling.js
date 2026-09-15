import { useEffect, useRef } from 'react';

// One request at a time; hidden tabs never schedule background work.
export function useVisiblePolling(callback, interval) {
    const latest = useRef(callback);
    useEffect(() => { latest.current = callback; }, [callback]);
    useEffect(() => {
        let stopped = false;
        let timer;
        let running = false;
        let lastActivity = Date.now();
        const schedule = () => {
            clearTimeout(timer);
            if (stopped || document.visibilityState === 'hidden') return;
            const idleSteps = Math.min(3, Math.floor((Date.now() - lastActivity) / (interval * 3)));
            timer = setTimeout(tick, interval * 2 ** idleSteps);
        };
        async function tick() {
            clearTimeout(timer);
            if (stopped || running || document.visibilityState === 'hidden') return;
            running = true;
            try { await latest.current(); } finally { running = false; schedule(); }
        }
        const activity = () => {
            const wasIdle = Date.now() - lastActivity >= interval * 3;
            lastActivity = Date.now();
            if (wasIdle && !running) schedule();
        };
        const visibility = () => {
            clearTimeout(timer);
            if (document.visibilityState !== 'hidden') { lastActivity = Date.now(); void tick(); }
        };
        document.addEventListener('visibilitychange', visibility);
        document.addEventListener('pointerdown', activity);
        document.addEventListener('keydown', activity);
        void tick();
        return () => {
            stopped = true; clearTimeout(timer);
            document.removeEventListener('visibilitychange', visibility);
            document.removeEventListener('pointerdown', activity);
            document.removeEventListener('keydown', activity);
        };
    }, [interval, callback]);
}
