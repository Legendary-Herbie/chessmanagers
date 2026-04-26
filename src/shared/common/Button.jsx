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
            className={`btn btn-${variant} ${className} ${loading ? 'opacity-80 cursor-not-allowed' : ''}`}
            onClick={loading ? undefined : onClick}
            disabled={disabled || loading}
            aria-label={ariaLabel}
            {...props}
        >
            {loading ? (
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    {typeof children === 'string' ? 'Processing...' : children}
                </div>
            ) : children}
        </button>
    );
}