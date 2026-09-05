import { useEffect } from 'react';

const activeTraps = [];

/**
 * Traps focus within the ref element while active.
 * Restores focus to the previously focused element on cleanup.
 *
 * @param {React.MutableRefObject<HTMLElement>} ref    - The element to trap focus in.
 * @param {boolean}                             active - Whether the trap is active.
 */
export function useFocusTrap(ref, active = true) {
    useEffect(() => {
        if (!active || !ref.current) return;

        const element = ref.current;
        const trap = { element };
        activeTraps.push(trap);
        const isTopTrap = () => activeTraps[activeTraps.length - 1] === trap;

        // Save the element that was focused before the trap activated
        // so we can restore focus when the trap is released (e.g. modal closes).
        const previouslyFocused = document.activeElement;

        const focusableSelectors = [
            'button',
            '[href]',
            'input',
            'select',
            'textarea',
            '[tabindex]:not([tabindex="-1"])',
        ].join(', ');

        // offsetParent === null incorrectly excludes position:fixed elements
        // (common in modals). Checking computed style is more reliable.
        const isVisible = (el) => {
            const style = getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
        };

        const getFocusableItems = () =>
            Array.from(element.querySelectorAll(focusableSelectors)).filter(
                (el) => !el.hasAttribute('disabled') && isVisible(el)
            );

        const handleKeyDown = (e) => {
            if (e.key !== 'Tab' || !isTopTrap()) return;

            const focusable = getFocusableItems();
            if (focusable.length === 0) {
                e.preventDefault();
                return;
            }

            const first = focusable[0];
            const last  = focusable[focusable.length - 1];

            if (e.shiftKey) {
                if (document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                if (document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };

        // If focus escapes the trap (e.g. programmatic focus elsewhere),
        // pull it back to the first focusable item.
        // Note: `active` is not checked here — if this effect is running, active is true.
        const handleFocusIn = (e) => {
            if (isTopTrap() && element && !element.contains(e.target)) {
                const focusable = getFocusableItems();
                if (focusable.length > 0) focusable[0].focus();
            }
        };

        // Set initial focus to the first focusable item if focus is not already inside
        const focusable = getFocusableItems();
        if (focusable.length > 0 && !element.contains(document.activeElement)) {
            focusable[0].focus();
        }

        element.addEventListener('keydown', handleKeyDown);
        document.addEventListener('focusin', handleFocusIn);

        return () => {
            element.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('focusin', handleFocusIn);
            const wasTopTrap = isTopTrap();
            const trapIndex = activeTraps.indexOf(trap);
            if (trapIndex !== -1) activeTraps.splice(trapIndex, 1);

            // Restore focus to the element that was active before the trap
            if (wasTopTrap && previouslyFocused && typeof previouslyFocused.focus === 'function') {
                previouslyFocused.focus();
            }
        };

    // ref is a stable useRef object — excluded from deps intentionally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active]);
}
