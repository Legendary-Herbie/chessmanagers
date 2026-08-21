import React from 'react';
import '../../styles/common.css';

export default function Button({
    children,
    onClick,
    variant = 'primary',
    className = '',
    disabled = false,
    loading = false,
    type = 'button',
    'aria-label': ariaLabel,
    ...props
}) {
    return (
        <button
            type={type}
            className={`btn btn-${variant} ${className} ${loading ? 'btn--loading' : ''}`.trim()}
            onClick={loading ? undefined : onClick}
            disabled={disabled || loading}
            aria-label={ariaLabel}
            aria-busy={loading || undefined}
            {...props}
        >
            {loading ? (
                <span className="btn-spinner-wrap">
                    <span className="btn-spinner" aria-hidden="true" />
                    {typeof children === 'string' ? 'Processing…' : children}
                </span>
            ) : children}
        </button>
    );
}
