import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ActionMenu from './ActionMenu.jsx';

afterEach(cleanup);
it('supports keyboard actions, Escape and focus restoration', () => {
    const remove = vi.fn();
    render(<ActionMenu><button type="button">Void</button><button type="button" onClick={remove}>Delete</button></ActionMenu>);
    const trigger = screen.getByRole('button', { name: 'More actions' });
    fireEvent.click(trigger);
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Void' }));
    fireEvent.keyDown(document.activeElement, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Delete' }));
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(remove).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).toBeNull();
});
