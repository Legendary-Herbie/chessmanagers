export default function Icon({ name, size = 'md', className = '' }) {
    const sizeMap = { sm: 12, md: 16, lg: 20, xl: 24 };
    const px = sizeMap[size] || sizeMap.md;
    if (name === 'x') {
        return (
            <svg width={px} height={px} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
                <path d="M6 6L18 18M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        );
    }
    // Fallback: simple circle
    return (
        <svg width={px} height={px} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
        </svg>
    );
}
