import React from 'react';
import { useId, useState } from 'react';
import Icon from './Icon.jsx';

export default function Disclosure({ title, children, defaultOpen = false, forceOpen = false, className = '' }) {
    const id = useId();
    const [open, setOpen] = useState(defaultOpen);
    const expanded = forceOpen || open;
    return <div className={`disclosure ${className}`} data-open={expanded}>
        <button type="button" className="disclosure__trigger" aria-expanded={expanded} aria-controls={id}
            onClick={() => setOpen(value => !value)}><span>{title}</span><Icon name="chevronDown" /></button>
        <div id={id} className="disclosure__panel" inert={!expanded} aria-hidden={!expanded}>
            <div className="disclosure__inner"><div className="disclosure__content">{children}</div></div>
        </div>
    </div>;
}
