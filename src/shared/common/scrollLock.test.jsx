import React, { StrictMode } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import Dialog from './Dialog.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';

function Overlays({ dialog = true, confirm = true, modal = true, loading = false }) {
    return <StrictMode>
        {dialog && <Dialog title="Edit player" onClose={() => {}} />}
        <ConfirmDialog isOpen={confirm} loading={loading} onClose={() => {}} />
        {modal && <Dialog title="Saved" onClose={() => {}} />}
    </StrictMode>;
}

describe('shared modal scroll lock', () => {
    afterEach(() => { cleanup(); document.body.style.overflow = ''; });

    it.each([
        ['dialog', 'confirm', 'modal'],
        ['modal', 'confirm', 'dialog'],
        ['confirm', 'dialog', 'modal'],
    ])('restores scrolling after closing %s, %s, then %s', (...order) => {
        document.body.style.overflow = 'auto';
        const state = { dialog: true, confirm: true, modal: true };
        const view = render(<Overlays {...state} />);
        expect(document.body.style.overflow).toBe('hidden');
        order.forEach((key, index) => {
            state[key] = false;
            view.rerender(<Overlays {...state} loading />);
            expect(document.body.style.overflow).toBe(index === 2 ? 'auto' : 'hidden');
        });
    });

    it('releases every lock when navigation unmounts overlapping dialogs', () => {
        const view = render(<Overlays />);
        view.rerender(<Overlays loading />);
        view.unmount();
        expect(document.body.style.overflow).toBe('');
    });
});
