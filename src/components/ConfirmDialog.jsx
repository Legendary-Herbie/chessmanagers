import React, { useId, useState } from 'react';
import Dialog from '../shared/common/Dialog.jsx';
import Icon from '../shared/common/Icon.jsx';
import Button from '../shared/common/Button.jsx';

export default function ConfirmDialog(props) {
    if (!props.isOpen) return null;
    return <ConfirmationContent {...props} />;
}
function ConfirmationContent({ title = 'Confirm Action', message = 'Are you sure you want to proceed?', confirmLabel = 'Confirm', cancelLabel = 'Cancel', variant = 'primary', loading = false, onConfirm, onClose, children = null, confirmationText, confirmDisabled = false, error }) {
    const [confirmation, setConfirmation] = useState('');
    const messageId = useId();
    return <Dialog title={title} onClose={onClose} busy={loading} className={`confirm-dialog confirm-dialog--${variant}`} describedBy={messageId}>
        <div className="modal-body">
            <span className="confirm-dialog__badge"><Icon name={variant === 'primary' ? 'info' : 'warning'} size="xl" /></span>
            <p id={messageId} className="confirm-dialog__message">{message}</p>
            {children}
            {confirmationText && <label className="form-row"><span>Type {confirmationText} to confirm</span><input className="input" autoComplete="off" value={confirmation} disabled={loading} onChange={event => setConfirmation(event.target.value)} /></label>}
            {error && <p className="error" role="alert">{error}</p>}
        </div>
        <div className="modal-footer confirm-dialog__actions">
            <Button variant="secondary" disabled={loading} onClick={onClose}>{cancelLabel}</Button>
            <Button variant={variant === 'primary' ? 'primary' : variant} disabled={confirmDisabled || Boolean(confirmationText && confirmation !== confirmationText)} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
    </Dialog>;
}
