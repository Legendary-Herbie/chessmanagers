import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../config/api.js';
import { authApi } from './authApi.js';

vi.mock('../../../config/api.js', async importOriginal => {
    const original = await importOriginal();
    return {
        ...original,
        API_BASE: 'https://api.example.test',
        api: {
            get: vi.fn(),
            post: vi.fn(),
            patch: vi.fn(),
            delete: vi.fn(),
        },
    };
});

describe('authentication API', () => {
    beforeEach(() => vi.clearAllMocks());

    it('keeps session and lifecycle routes behind the feature boundary', async () => {
        api.get.mockResolvedValue({ user: { id: 'user_1' } });
        api.post.mockResolvedValue({ message: 'ok' });
        api.patch.mockResolvedValue({ message: 'ok' });
        api.delete.mockResolvedValue({ message: 'ok' });

        await authApi.me();
        await authApi.login({ email: 'player@example.test', password: 'secret' });
        await authApi.verifyEmail('verify_1');
        await authApi.changePassword({ currentPassword: 'old', newPassword: 'new' });
        await authApi.deleteAccount({ confirmation: 'DELETE' });

        expect(api.get).toHaveBeenCalledWith('/auth/me', {});
        expect(api.post).toHaveBeenNthCalledWith(1, '/auth/login', {
            email: 'player@example.test',
            password: 'secret',
        });
        expect(api.post).toHaveBeenNthCalledWith(2, '/auth/verify-email', { token: 'verify_1' }, {});
        expect(api.patch).toHaveBeenCalledWith('/auth/password', {
            currentPassword: 'old',
            newPassword: 'new',
        });
        expect(api.delete).toHaveBeenCalledWith('/auth/account', { confirmation: 'DELETE' });
    });

    it('builds an encoded Google OAuth continuation URL', () => {
        expect(authApi.googleStartUrl('/clubs/join?code=123456')).toBe(
            'https://api.example.test/auth/google/start?continuation=%2Fclubs%2Fjoin%3Fcode%3D123456',
        );
    });
});
