import React, { useRef } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useFocusTrap } from './useFocusTrap.jsx';

function Trap({ label }) {
    const ref = useRef(null);
    useFocusTrap(ref, true);
    return <div ref={ref}><button type="button">{label}</button></div>;
}

function Harness({ nested }) {
    return <>
        <button type="button">Outside</button>
        <Trap label="First trap" />
        {nested && <Trap label="Second trap" />}
    </>;
}

describe('useFocusTrap', () => {
    afterEach(cleanup);

    it('lets only the topmost nested trap pull focus back', () => {
        const { rerender } = render(<Harness nested />);
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Second trap' }));

        screen.getByRole('button', { name: 'Outside' }).focus();
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Second trap' }));

        rerender(<Harness nested={false} />);
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'First trap' }));
    });
});
