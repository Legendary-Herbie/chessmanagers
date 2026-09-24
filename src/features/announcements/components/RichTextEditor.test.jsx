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
    it('identifies its formatting controls as a toolbar', () => {
        render(<RichTextEditor value="" onChange={vi.fn()} />);
        expect(screen.getByRole('toolbar', { name: 'Formatting controls' })).toBeTruthy();
    });

    afterEach(cleanup);

    it('retains shortcut formatting and the caret when controlled content updates while typing', () => {
        function Editor() {
            const [value, setValue] = React.useState('');
            return <RichTextEditor value={value} onChange={setValue} />;
        }
        render(<Editor />);
        const editor = screen.getByRole('textbox');
        selectContents(editor);
        fireEvent.keyDown(editor, { key: 'b', ctrlKey: true });
        fireEvent.keyDown(editor, { key: 'i', ctrlKey: true });
        const range = window.getSelection().getRangeAt(0);
        const text = range.startContainer;
        expect(text.parentElement.tagName).toBe('EM');
        text.insertData(range.startOffset, 'Hello');
        range.setStart(text, text.length);
        range.collapse(true);
        fireEvent.input(editor);
        expect(editor.querySelector('strong em').textContent).toContain('Hello');
        expect(window.getSelection().anchorNode).toBe(text);
        expect(screen.getByRole('button', { name: 'Bold' }).getAttribute('aria-pressed')).toBe('true');
    });

    it('formats with keyboard shortcuts and exposes active toolbar state', () => {
        const onChange = vi.fn();
        render(<RichTextEditor value="Hello" onChange={onChange} />);
        const editor = screen.getByRole('textbox');
        selectContents(editor);
        fireEvent.keyDown(editor, { key: 'b', ctrlKey: true });
        expect(onChange).toHaveBeenLastCalledWith('<strong>Hello</strong>');
        expect(screen.getByRole('button', { name: 'Bold' }).getAttribute('aria-pressed')).toBe('true');
    });

    it('passes pasted and dropped files to the existing attachment workflow', () => {
        const onFiles = vi.fn();
        render(<RichTextEditor value="" onChange={vi.fn()} onFiles={onFiles} />);
        const file = new File(['image'], 'photo.png', { type: 'image/png' });
        fireEvent.paste(screen.getByRole('textbox'), { clipboardData: { files: [file] } });
        fireEvent.drop(screen.getByRole('textbox'), { dataTransfer: { files: [file] } });
        expect(onFiles).toHaveBeenCalledTimes(2);
        expect(onFiles).toHaveBeenLastCalledWith([file]);
    });

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
