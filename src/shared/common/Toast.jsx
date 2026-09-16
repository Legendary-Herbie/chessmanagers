import React, { useEffect, useRef, useState } from 'react';
import './toast.css';

export default function Toast({ notification, dismiss }) {
    const { id, message, type, duration } = notification;
    const remaining = useRef(duration);
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const paused = hovered || focused;
    useEffect(() => {
        if (paused || duration <= 0) return;
        const started = Date.now();
        const timer = setTimeout(() => dismiss(id), remaining.current);
        return () => { clearTimeout(timer); remaining.current = Math.max(0, remaining.current - (Date.now() - started)); };
    }, [dismiss, duration, id, paused]);
    return <div className={`app-toast app-toast--${type}`} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
        <span role={type === 'error' ? 'alert' : 'status'}>{message}</span>
        <button type="button" aria-label="Dismiss notification" onClick={() => dismiss(id)}>×</button>
        {duration > 0 && <div className="app-toast__progress" aria-hidden="true" style={{ animationDuration: `${duration}ms`, animationPlayState: paused ? 'paused' : 'running' }} />}
    </div>;
}
