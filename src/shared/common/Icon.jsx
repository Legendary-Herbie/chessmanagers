import React from 'react';
const paths = {
    x: 'M6 6l12 12M6 18L18 6', check: 'M5 12l4 4L19 6',
    clock: 'M12 8v4l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    edit: 'm15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z',
    chart: 'M3 3v18h18M6 15l5-5 4 3 6-8',
    trophy: 'M8 3h8v5a4 4 0 0 1-8 0zM8 5H4v2a5 5 0 0 0 5 5M16 5h4v2a5 5 0 0 1-5 5M12 12v6M8 21h8M9 18h6',
    players: 'M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M2 21v-2a6 6 0 0 1 12 0v2M17 3a4 4 0 0 1 0 8M18 15a5 5 0 0 1 4 5v1',
    matches: 'M4 3l16 18M20 3 4 21M3 15l6 5M21 15l-6 5',
    search: 'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0M15 15l6 6',
    grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    list: 'M8 5h13M8 12h13M8 19h13M3 5h1M3 12h1M3 19h1',
    menu: 'M3 6h18M3 12h18M3 18h18', chevronDown: 'm6 9 6 6 6-6',
    chevronLeft: 'm15 6-6 6 6 6', chevronRight: 'm9 6 6 6-6 6',
    club: 'M4 21h16M6 17h12l-1-9H7zM6 3v5h12V3h-3v3h-3V3H9v3H6',
    plus: 'M12 5v14M5 12h14', more: 'M5 12h.01M12 12h.01M19 12h.01',
};
export default function Icon({ name, size = 'md', className = '' }) {
    const px = { sm: 12, md: 16, lg: 20, xl: 24 }[size] || 16;
    return <svg width={px} height={px} viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={name === 'more' ? 4 : 1.8} strokeLinecap="round" strokeLinejoin="round"
        className={`app-icon ${className}`} aria-hidden="true" focusable="false"><path d={paths[name] || paths.club} /></svg>;
}
