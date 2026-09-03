import { describe, expect, it, vi } from 'vitest';
import { runPlayerAction } from './playerActionFeedback.js';

describe('player action feedback', () => {
    it('reports successful actions through the application notification system', async () => {
        const notify = vi.fn();
        const action = vi.fn().mockResolvedValue(undefined);

        await expect(runPlayerAction(action, {
            notify,
            successMessage: 'Player archived.',
            fallbackError: 'Failed to archive player.',
        })).resolves.toBe(true);

        expect(action).toHaveBeenCalledOnce();
        expect(notify).toHaveBeenCalledWith('Player archived.', 'success');
    });

    it('reports API failures without opening a browser alert', async () => {
        const notify = vi.fn();
        const action = vi.fn().mockRejectedValue(new Error('Archive permission denied'));

        await expect(runPlayerAction(action, {
            notify,
            successMessage: 'Player archived.',
            fallbackError: 'Failed to archive player.',
        })).resolves.toBe(false);

        expect(notify).toHaveBeenCalledWith('Archive permission denied', 'error');
    });

    it('uses a stable fallback when an API failure has no message', async () => {
        const notify = vi.fn();

        await runPlayerAction(() => Promise.reject(null), {
            notify,
            successMessage: 'Claim request submitted.',
            fallbackError: 'Failed to submit claim request.',
        });

        expect(notify).toHaveBeenCalledWith('Failed to submit claim request.', 'error');
    });
});
