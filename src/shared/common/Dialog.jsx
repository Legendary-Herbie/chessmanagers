import React, { useId, useRef } from 'react';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock.js';
import { createPortal } from 'react-dom';
import './dialog.css';
import { useFocusTrap } from '../hooks/useFocusTrap.jsx';
import Button from './Button.jsx';
import Icon from './Icon.jsx';

export default function Dialog({ title, onClose, busy = false, children, className = '', describedBy }) {
    const ref = useRef(null);
    const titleId = useId();
    useFocusTrap(ref);
    useBodyScrollLock();

    return createPortal(<div className="app-dialog-backdrop" onMouseDown={event => {
        if (event.target === event.currentTarget && !busy) onClose();
    }}>
        <div ref={ref} className={`app-dialog ${className}`} role="dialog" aria-modal="true"
            aria-labelledby={titleId} aria-describedby={describedBy} onKeyDown={event => {
                if (event.key === 'Escape') {
                    event.stopPropagation();
                    if (!busy) onClose();
                }
            }}>
            <div className="modal-header"><h2 id={titleId}>{title}</h2>
                <Button variant="secondary" aria-label="Close" disabled={busy} onClick={onClose}><Icon name="x" /></Button>
            </div>
            {children}
        </div>
    </div>, document.body);
}
