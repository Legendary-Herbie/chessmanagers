import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import './dialog.css';
import { useFocusTrap } from '../hooks/useFocusTrap.jsx';
import Button from './Button.jsx';

export default function Dialog({ title, onClose, busy = false, children, className = '' }) {
    const ref = useRef(null);
    const titleId = useId();
    useFocusTrap(ref);
    useEffect(() => {
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = previous; };
    }, []);

    return createPortal(<div className="app-dialog-backdrop" onMouseDown={event => {
        if (event.target === event.currentTarget && !busy) onClose();
    }}>
        <div ref={ref} className={`app-dialog ${className}`} role="dialog" aria-modal="true"
            aria-labelledby={titleId} onKeyDown={event => {
                if (event.key === 'Escape') {
                    event.stopPropagation();
                    if (!busy) onClose();
                }
            }}>
            <div className="modal-header"><h3 id={titleId}>{title}</h3>
                <Button variant="secondary" disabled={busy} onClick={onClose}>Close</Button>
            </div>
            {children}
        </div>
    </div>, document.body);
}
