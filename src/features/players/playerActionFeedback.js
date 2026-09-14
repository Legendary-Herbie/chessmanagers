export async function runPlayerAction(action, {
    notify,
    successMessage,
    fallbackError,
}) {
    try {
        const result = await action();
        notify(typeof successMessage === 'function' ? successMessage(result) : successMessage, 'success');
        return true;
    } catch (error) {
        notify(error?.message || fallbackError, 'error');
        return false;
    }
}
