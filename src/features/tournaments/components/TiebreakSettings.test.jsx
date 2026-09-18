import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TiebreakHelp } from './TiebreakSettings.jsx';

describe('TiebreakHelp', () => {
    it('renders hover help outside the scrolling table and dismisses with Escape', () => {
        const { container } = render(<div style={{ overflow: 'auto' }}><TiebreakHelp name="buchholz" /></div>);
        fireEvent.mouseEnter(screen.getByRole('button', { name: 'Buchholz' }));
        const tooltip = screen.getByRole('tooltip');
        expect(tooltip.textContent).toContain('Sum of all opponents');
        expect(container.contains(tooltip)).toBe(false);
        expect(tooltip.parentElement).toBe(document.body);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('tooltip')).toBeNull();
    });

    it('describes the focused header and supports tap and outside dismissal', () => {
        render(<TiebreakHelp name="directHeadToHead" />);
        const trigger = screen.getByRole('button', { name: 'Head-to-head (H2H)' });
        fireEvent.focus(trigger);
        expect(trigger.getAttribute('aria-describedby')).toBe(screen.getByRole('tooltip').id);
        fireEvent.blur(trigger);
        expect(screen.queryByRole('tooltip')).toBeNull();
        fireEvent.click(trigger);
        expect(screen.getByRole('tooltip').textContent).toContain('Direct results');
        fireEvent.pointerDown(document.body);
        expect(screen.queryByRole('tooltip')).toBeNull();
    });
});
