import React, { useId } from 'react';
import './toggleSwitch.css';
export default function ToggleSwitch({ label, description, checked, onChange, disabled = false }) {
    const descriptionId = useId();
    return <div className="toggle-card"><div><span className="toggle-card__title">{label}</span>{description && <p id={descriptionId}>{description}</p>}</div><button type="button" className="toggle-switch" role="switch" aria-checked={checked} aria-label={label} aria-describedby={description ? descriptionId : undefined} disabled={disabled} onClick={() => onChange(!checked)}><span /></button></div>;
}
