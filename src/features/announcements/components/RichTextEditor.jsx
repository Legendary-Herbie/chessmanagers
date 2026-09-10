import React, { useEffect, useRef, useState } from 'react';

const commands = [
    ['strong', 'Bold'],
    ['em', 'Italic'],
    ['u', 'Underline'],
    ['ul', 'Bullets'],
    ['ol', 'Numbered list'],
];

function selectionRange(editor) {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return null;
    const range = selection.getRangeAt(0);
    return editor?.contains(range.commonAncestorContainer) ? range : null;
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

export default function RichTextEditor({ value, onChange, disabled = false, onFiles }) {
    const editorRef = useRef(null);
    const [active, setActive] = useState([]);
    useEffect(() => {
        const update = () => {
            const range = selectionRange(editorRef.current);
            const tags = [];
            let node = range?.startContainer;
            while (node && node !== editorRef.current) {
                if (node.nodeType === 1) tags.push(node.tagName.toLowerCase());
                node = node.parentNode;
            }
            setActive(tags);
        };
        document.addEventListener('selectionchange', update);
        return () => document.removeEventListener('selectionchange', update);
    }, []);

    useEffect(() => {
        if (editorRef.current && editorRef.current.innerHTML !== value) {
            editorRef.current.innerHTML = value;
        }
    }, [value]);

    const format = (tagName) => {
        const editor = editorRef.current;
        if (!editor || disabled) return;
        const range = selectionRange(editor);
        if (!range) {
            editor.focus();
            return;
        }

        let ancestor = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
        while (ancestor && ancestor !== editor) {
            if (ancestor.tagName.toLowerCase() === tagName && ancestor.contains(range.endContainer)) {
                const children = [...ancestor.childNodes];
                ancestor.replaceWith(...children);
                if (children.length) moveCaretAfter(children[children.length - 1]);
                setActive(current => current.filter(tag => tag !== tagName));
                onChange(editor.innerHTML);
                return;
            }
            ancestor = ancestor.parentElement;
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
        setActive([tagName]);
        onChange(editor.innerHTML);
    };

    return (
        <div className="rich-editor">
            <div className="rich-editor__toolbar" aria-label="Formatting controls">
                {commands.map(([command, label]) => (
                    <button key={command} type="button" disabled={disabled} aria-pressed={active.includes(command)}
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
                onKeyDown={event => {
                    const command = { b: 'strong', i: 'em', u: 'u' }[event.key.toLowerCase()];
                    if ((event.ctrlKey || event.metaKey) && command) { event.preventDefault(); format(command); }
                }}
                onDragOver={event => { if (onFiles && !disabled) event.preventDefault(); }}
                onDrop={event => {
                    event.preventDefault();
                    if (!disabled) onFiles?.([...event.dataTransfer.files]);
                }}
                onPaste={event => {
                    event.preventDefault();
                    if (disabled) return;
                    if (event.clipboardData.files?.length && onFiles) { onFiles([...event.clipboardData.files]); return; }
                    if (insertPlainText(event.currentTarget, event.clipboardData.getData('text/plain'))) {
                        onChange(event.currentTarget.innerHTML);
                    }
                }}
                suppressContentEditableWarning
            />
        </div>
    );
}
