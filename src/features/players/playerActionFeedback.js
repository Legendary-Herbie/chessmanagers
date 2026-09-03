export async function runPlayerAction(action, {
    notify,
    successMessage,
    fallbackError,
}) {
    try {
        await action();
        notify(successMessage, 'success');
        return true;
    } catch (error) {
        notify(error?.message || fallbackError, 'error');
        return false;
    }
}
