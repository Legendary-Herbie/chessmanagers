import React, { useEffect, useId, useRef } from 'react';
import { useFocusTrap } from '../shared/hooks/useFocusTrap.jsx';

export default function ConfirmDialog({
    isOpen = false,
    title = 'Confirm Action',
    message = 'Are you sure you want to proceed?',
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    variant = 'primary', // 'primary' | 'danger' | 'warning'
    loading = false,
    onConfirm,
    onClose,
    children = null,
}) {
    const dialogRef = useRef(null);
    const titleId = useId();
    const descriptionId = useId();
    useFocusTrap(dialogRef, isOpen);

    // Scroll lock & Escape key
    useEffect(() => {
        if (!isOpen) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const handleEscape = (e) => {
            if (e.key === 'Escape' && !loading && onClose) onClose();
        };
        window.addEventListener('keydown', handleEscape);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, loading, onClose]);

    if (!isOpen) return null;

    const confirmBtnClass = variant === 'danger'
        ? 'btn-danger'
        : variant === 'warning'
        ? 'btn-warning'
        : 'btn-primary';

    return (
        <div className="modal-overlay" role="presentation"
            onMouseDown={event => event.target === event.currentTarget && !loading && onClose?.()}>
            <div ref={dialogRef} className="modal-card" role="dialog" aria-modal="true"
                aria-labelledby={titleId} aria-describedby={descriptionId} style={{ maxWidth: '440px' }}>
                <div className="modal-card__header">
                    <h2 id={titleId} className="modal-card__title">{title}</h2>
                    <button type="button" className="modal-card__close" onClick={onClose}
                        disabled={loading} aria-label="Close modal">
                        ✕
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '4px 0' }}>
                    <p id={descriptionId} style={{ margin: 0, color: 'var(--text)', lineHeight: 1.5, fontSize: '0.95rem' }}>
                        {message}
                    </p>
                    {children}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                        <button
                            type="button"
                            className="btn-secondary"
                            onClick={onClose}
                            disabled={loading}
                        >
                            {cancelLabel}
                        </button>
                        <button
                            type="button"
                            className={confirmBtnClass}
                            onClick={onConfirm}
                            disabled={loading}
                        >
                            {loading ? 'Processing...' : confirmLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
