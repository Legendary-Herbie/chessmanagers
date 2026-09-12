import React from 'react';
import { Children, cloneElement, useLayoutEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';

export default function ActionMenu({ children, label = 'More actions', icon = 'more', heading, panelClassName = '', disabled = false }) {
    const [open, setOpen] = useState(false);
    const root = useRef(null);
    const trigger = useRef(null);
    const panel = useRef(null);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const id = useId();
    useLayoutEffect(() => {
        if (!open) return;
        const rect = trigger.current.getBoundingClientRect();
        const height = panel.current.offsetHeight;
        const width = panel.current.offsetWidth;
        setPosition({ top: Math.max(8, rect.bottom + height + 6 > window.innerHeight ? rect.top - height - 6 : rect.bottom + 6),
            left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)) });
        panel.current.querySelector('[role="menuitem"]:not(:disabled)')?.focus();
        const dismiss = event => { if (!root.current?.contains(event.target) && !panel.current?.contains(event.target)) setOpen(false); };
        const close = () => setOpen(false);
        const onScroll = event => { if (!panel.current?.contains(event.target)) close(); };
        document.addEventListener('pointerdown', dismiss);
        window.addEventListener('resize', close);
        document.addEventListener('scroll', onScroll, true);
        return () => {
            document.removeEventListener('pointerdown', dismiss);
            window.removeEventListener('resize', close);
            document.removeEventListener('scroll', onScroll, true);
        };
    }, [open]);
    function onKeyDown(event) {
        if (event.key === 'Escape') {
            event.stopPropagation(); setOpen(false); trigger.current?.focus();
        } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const items = [...(panel.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') || [])];
            const index = items.indexOf(document.activeElement);
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
                : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
            items[next]?.focus();
        }
    }
    function onBlur(event) {
        if (!root.current?.contains(event.relatedTarget) && !panel.current?.contains(event.relatedTarget)) setOpen(false);
    }
    return <div className="action-menu" ref={root} onKeyDown={onKeyDown}
        onBlur={onBlur}>
        <button ref={trigger} type="button" className="btn btn-secondary action-menu__trigger" aria-label={label}
            disabled={disabled} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}><Icon name={icon} size="lg" /></button>
        {open && createPortal(<div ref={panel} id={id} role="menu" aria-label={label} className={`action-menu__panel ${panelClassName}`} style={position}>
            {heading && <div className="action-menu__heading" role="presentation">{heading}</div>}
            {Children.map(children, child => child && cloneElement(child, { role: 'menuitem', onClick: event => {
                trigger.current?.focus(); setOpen(false); child.props.onClick?.(event);
            } }))}
        </div>, document.body)}
    </div>;
}
