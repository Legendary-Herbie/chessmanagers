import { useEffect } from 'react';

export function useSearchShortcut(includeCommand = true) {
    useEffect(() => {
        const onKeyDown = event => {
            if (event.defaultPrevented || event.isComposing || event.altKey || event.shiftKey) return;
            const shortcut = (event.key === '/' && !event.ctrlKey && !event.metaKey)
                || (includeCommand && event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey));
            if (!shortcut || event.target.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]')
                || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
            const search = [...document.querySelectorAll('input[type="search"], input[aria-label^="Search"], input[placeholder^="Search"]')]
                .find(input => !input.disabled && input.getClientRects().length && !input.closest('[hidden], [inert]'));
            if (search) { event.preventDefault(); search.focus(); }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [includeCommand]);
}
