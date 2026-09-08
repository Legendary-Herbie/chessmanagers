import React, { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';

export default function UnsavedChangesWarning({ dirty, saving = false, onDiscard }) {
    const discarding = useRef(false);
    const blocker = useBlocker(() => !discarding.current && (dirty || saving));
    useEffect(() => {
        if (!dirty && !saving) discarding.current = false;
    }, [dirty, saving]);
    useEffect(() => {
        const guard = event => {
            if (!dirty && !saving) return;
            if (saving || !window.confirm('Discard unsaved settings and continue?')) {
                event.preventDefault();
                return;
            }
            discarding.current = true;
            onDiscard();
        };
        window.addEventListener('app:before-context-change', guard);
        return () => window.removeEventListener('app:before-context-change', guard);
    }, [dirty, saving, onDiscard]);
    useEffect(() => {
        if (!dirty && !saving) return undefined;
        const warn = event => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty, saving]);
    return <ConfirmDialog isOpen={blocker.state === 'blocked'} title="Leave without saving?"
        message="Your unsaved settings will be discarded. Stay here to save them."
        confirmLabel="Discard changes and leave" cancelLabel="Keep editing" loading={saving}
        onClose={() => blocker.reset?.()} onConfirm={() => { onDiscard(); blocker.proceed?.(); }} />;
}
