import React, { useRef, useEffect } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap.jsx';
import Button from 'Button.jsx';
import Icon from 'Icon.jsx';

export default function Modal({ modal, modalInput, setModalInput, closeModal }) {
    const modalContentRef = useRef(null);

    // Use custom hook for focus trap
    useFocusTrap(modalContentRef, !!modal);

    useEffect(() => {
        if (modal) {
            const handleKeyDown = (e) => {
                if (e.key === 'Escape') {
                    closeModal(false);
                }
            };
            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
        }
    }, [modal, closeModal]);

    if (!modal) return null;

    return (
        <div className="modal-backdrop opacity-90" role="presentation" onClick={() => closeModal(false)}>
            <div
                className="modal-content"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="modal-title"
                aria-describedby="modal-body"
                ref={modalContentRef}
                onClick={e => e.stopPropagation()}
            >
                <div className="modal-header border-border/50 pb-4 mb-4 flex items-center justify-between">
                    <h3 id="modal-title" className="text-xl font-black text-strong tracking-tight">
                        {modal.title || 'Notification'}
                    </h3>
                    <Button
                        aria-label="Close"
                        variant="secondary"
                        className="w-10 h-10 rounded-full border-none flex-center p-0 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                        onClick={() => closeModal(false)}
                    >
                        <Icon name="x" size="xl" />
                    </Button>
                </div>

                <div id="modal-body" className="modal-body py-2 text-muted font-medium leading-relaxed">
                    {modal.message}
                </div>

                {modal.type === 'prompt' && (
                    <div className="mt-6">
                        <input
                            autoFocus
                            value={modalInput}
                            onChange={e => setModalInput(e.target.value)}
                            className="input w-full h-14 px-4 font-bold text-lg focus:ring-4"
                            onKeyDown={e => e.key === 'Enter' && closeModal(modalInput)}
                            aria-label="Input field"
                        />
                    </div>
                )}

                <div className="modal-footer flex flex-col md:flex-row justify-center gap-3 mt-8 pt-6 border-border/50">
                    <Button type="button" onClick={() => closeModal(false)} variant="secondary" className="px-6 h-12 rounded-xl font-bold">Cancel</Button>
                    {modal.type === 'confirm' && <Button type="button" onClick={() => closeModal(true)} variant="primary" className="px-8 h-12 rounded-xl font-black shadow-lg shadow-primary/20">Confirm</Button>}
                    {modal.type === 'prompt' && <Button type="button" onClick={() => closeModal(modalInput)} variant="primary" className="px-8 h-12 rounded-xl font-black shadow-lg shadow-primary/20">Submit</Button>}
                </div>
                <div className="mt-4 text-[10px] font-black uppercase tracking-widest text-muted/50 text-center">
                    Press <kbd className="bg-bg-muted px-1.5 py-0.5 rounded border border-border shadow-sm">Esc</kbd> to dismiss
                </div>
            </div>
        </div>
    );
}
