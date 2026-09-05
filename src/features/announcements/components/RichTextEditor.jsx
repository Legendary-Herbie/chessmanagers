import React, { useEffect, useRef } from 'react';

const commands = [
    ['strong', 'Bold'],
    ['em', 'Italic'],
    ['ul', 'Bullets'],
    ['ol', 'Numbered list'],
];

function selectionRange(editor) {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return null;
    const range = selection.getRangeAt(0);
    return editor.contains(range.commonAncestorContainer) ? range : null;
}

function moveCaretAfter(node) {
    const range = document.createRange();
    range.setStartAfter(node);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

function moveCaretInside(node) {
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

function insertPlainText(editor, text) {
    const range = selectionRange(editor);
    if (!range) return false;
    range.deleteContents();

    const fragment = document.createDocumentFragment();
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    let lastNode = null;
    lines.forEach((line, index) => {
        if (index > 0) {
            lastNode = document.createElement('br');
            fragment.append(lastNode);
        }
        if (line) {
            lastNode = document.createTextNode(line);
            fragment.append(lastNode);
        }
    });
    if (!lastNode) lastNode = document.createTextNode('');
    if (!lastNode.parentNode) fragment.append(lastNode);
    range.insertNode(fragment);
    moveCaretAfter(lastNode);
    return true;
}

export default function RichTextEditor({ value, onChange, disabled = false }) {
    const editorRef = useRef(null);

    useEffect(() => {
        if (editorRef.current && editorRef.current.innerHTML !== value) {
            editorRef.current.innerHTML = value;
        }
    }, [value]);

    const format = (tagName) => {
        const editor = editorRef.current;
        if (!editor) return;
        const range = selectionRange(editor);
        if (!range) {
            editor.focus();
            return;
        }

        const wasCollapsed = range.collapsed;
        const wrapper = document.createElement(tagName);
        const content = range.extractContents();
        if (tagName === 'ul' || tagName === 'ol') {
            const item = document.createElement('li');
            item.append(content.childNodes.length ? content : document.createElement('br'));
            wrapper.append(item);
        } else {
            wrapper.append(content.childNodes.length ? content : document.createElement('br'));
        }
        range.insertNode(wrapper);
        if (wasCollapsed) moveCaretInside(tagName === 'ul' || tagName === 'ol' ? wrapper.firstChild : wrapper);
        else moveCaretAfter(wrapper);
        onChange(editor.innerHTML);
    };

    return (
        <div className="rich-editor">
            <div className="rich-editor__toolbar" aria-label="Formatting controls">
                {commands.map(([command, label]) => (
                    <button key={command} type="button" disabled={disabled}
                        onMouseDown={event => event.preventDefault()} onClick={() => format(command)}>
                        {label}
                    </button>
                ))}
                <button type="button" disabled={disabled}
                    onMouseDown={event => event.preventDefault()} onClick={() => format('blockquote')}>
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
                    if (insertPlainText(event.currentTarget, event.clipboardData.getData('text/plain'))) {
                        onChange(event.currentTarget.innerHTML);
                    }
                }}
                suppressContentEditableWarning
            />
        </div>
    );
}
