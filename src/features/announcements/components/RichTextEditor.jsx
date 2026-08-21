import React, { useEffect, useRef } from 'react';

const commands = [
    ['bold', 'Bold'],
    ['italic', 'Italic'],
    ['insertUnorderedList', 'Bullets'],
    ['insertOrderedList', 'Numbered list'],
];

export default function RichTextEditor({ value, onChange, disabled = false }) {
    const editorRef = useRef(null);

    useEffect(() => {
        if (editorRef.current && editorRef.current.innerHTML !== value) {
            editorRef.current.innerHTML = value;
        }
    }, [value]);

    const format = (command, commandValue = null) => {
        editorRef.current?.focus();
        document.execCommand(command, false, commandValue);
        onChange(editorRef.current?.innerHTML || '');
    };

    return (
        <div className="rich-editor">
            <div className="rich-editor__toolbar" aria-label="Formatting controls">
                {commands.map(([command, label]) => (
                    <button key={command} type="button" disabled={disabled} onClick={() => format(command)}>
                        {label}
                    </button>
                ))}
                <button type="button" disabled={disabled} onClick={() => format('formatBlock', 'blockquote')}>
                    Quote
                </button>
            </div>
            <div
                ref={editorRef}
                className="rich-editor__content"
                contentEditable={!disabled}
                role="textbox"
                aria-label="Announcement content"
                aria-multiline="true"
                onInput={event => onChange(event.currentTarget.innerHTML)}
                onPaste={event => {
                    event.preventDefault();
                    document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
                }}
                suppressContentEditableWarning
            />
        </div>
    );
}
