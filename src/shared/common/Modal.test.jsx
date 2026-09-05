import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Modal from './Modal.jsx';

vi.mock('./Icon.jsx', () => ({ default: () => null }));

describe('Modal semantics', () => {
    afterEach(cleanup);

    it('uses dialog for routine prompts and alertdialog only for alerts', () => {
        const props = { modalInput: '', setModalInput: vi.fn(), closeModal: vi.fn() };
        const { rerender } = render(
            <Modal {...props} modal={{ type: 'prompt', title: 'Add reason', message: 'Optional reason' }} />
        );
        expect(screen.getByRole('dialog', { name: 'Add reason' })).toBeTruthy();

        rerender(<Modal {...props} modal={{ type: 'alert', title: 'Problem', message: 'Try again' }} />);
        expect(screen.getByRole('alertdialog', { name: 'Problem' })).toBeTruthy();
    });
});
