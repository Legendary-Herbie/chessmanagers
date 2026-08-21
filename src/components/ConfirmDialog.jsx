import React, { useEffect } from 'react';

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
    // Scroll lock & Escape key
    useEffect(() => {
        if (!isOpen) return;
        document.body.style.overflow = 'hidden';
        const handleEscape = (e) => {
            if (e.key === 'Escape' && onClose) onClose();
        };
        window.addEventListener('keydown', handleEscape);
        return () => {
            document.body.style.overflow = '';
            window.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const confirmBtnClass = variant === 'danger'
        ? 'btn-danger'
        : variant === 'warning'
        ? 'btn-warning'
        : 'btn-primary';

    return (
        <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
            <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
                <div className="modal-card__header">
                    <h2 id="confirm-dialog-title" className="modal-card__title">{title}</h2>
                    <button type="button" className="modal-card__close" onClick={onClose} aria-label="Close modal">
                        ✕
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '4px 0' }}>
                    <p style={{ margin: 0, color: 'var(--text)', lineHeight: 1.5, fontSize: '0.95rem' }}>
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
