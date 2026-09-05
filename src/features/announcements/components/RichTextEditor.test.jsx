import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RichTextEditor from './RichTextEditor.jsx';

function selectContents(element) {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

describe('RichTextEditor', () => {
    afterEach(cleanup);

    it('formats selections without the deprecated execCommand API', () => {
        const onChange = vi.fn();
        render(<RichTextEditor value="Hello" onChange={onChange} />);
        const editor = screen.getByRole('textbox', { name: 'Announcement content' });
        selectContents(editor);

        fireEvent.click(screen.getByRole('button', { name: 'Bold' }));

        expect(onChange).toHaveBeenLastCalledWith('<strong>Hello</strong>');
    });

    it('inserts pasted content as plain text', () => {
        const onChange = vi.fn();
        render(<RichTextEditor value="" onChange={onChange} />);
        const editor = screen.getByRole('textbox', { name: 'Announcement content' });
        selectContents(editor);

        fireEvent.paste(editor, {
            clipboardData: { getData: () => '<img src=x onerror=alert(1)>' },
        });

        expect(editor.querySelector('img')).toBeNull();
        expect(editor.textContent).toBe('<img src=x onerror=alert(1)>');
    });
});
