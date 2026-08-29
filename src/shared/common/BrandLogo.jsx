import React from 'react';

export default function BrandLogo({
    className = '',
    tone = 'auto',
    compact = false,
    collapse = 'none',
}) {
    const classes = [
        'brand-logo',
        `brand-logo--${tone}`,
        `brand-logo--collapse-${collapse}`,
        className,
    ].filter(Boolean).join(' ');

    return (
        <span className={classes} aria-hidden="true">
            {tone === 'auto' ? <>
                <img className="brand-logo__lockup brand-logo__lockup--light-theme"
                    src="/primary_logo.svg" alt="" />
                <img className="brand-logo__lockup brand-logo__lockup--dark-theme"
                    src="/compact-logo-light.svg" alt="" />
            </> : (
                <img className="brand-logo__lockup"
                    src={compact ? '/compact-logo-light.svg' : '/primary-logo-inverted.svg'} alt="" />
            )}
            <img className="brand-logo__icon" src="/app_icon.svg" alt="" />
        </span>
    );
}
