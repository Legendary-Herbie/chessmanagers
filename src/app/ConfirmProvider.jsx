import React, { createContext, useContext, useState, useCallback } from 'react';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
    const [queue, setQueue] = useState([]);

    const confirm = useCallback((options) => {
        return new Promise((resolve) => {
            const id = Math.random().toString(36).slice(2);
            setQueue(q => [...q, { id, options, resolve }]);
        });
    }, []);

    const handleClose = (id, result) => {
        setQueue(q => {
            const item = q.find(x => x.id === id);
            if (item) item.resolve(result);
            return q.filter(x => x.id !== id);
        });
    };

    return (
        <ConfirmContext.Provider value={{ confirm }}>
            {children}
            {queue.map(item => (
                <div key={item.id} className="modal-backdrop" role="dialog" onClick={() => handleClose(item.id, false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} role="alertdialog" aria-modal="true">
                        <div className="modal-header">
                            <h3>{item.options.title || 'Confirm'}</h3>
                        </div>
                        <div className="modal-body">{item.options.message || ''}</div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => handleClose(item.id, false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={() => handleClose(item.id, true)}>{item.options.okText || 'Confirm'}</button>
                        </div>
                    </div>
                </div>
            ))}
        </ConfirmContext.Provider>
    );
}

export function useConfirm() {
    const ctx = useContext(ConfirmContext);
    if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
    return ctx.confirm;
}
