import { describe, expect, it } from 'vitest';
import { continuationFromParams, continuationQuery, safeContinuation } from './continuation.js';

describe('authentication continuation', () => {
    it('accepts same-site relative destinations', () => {
        expect(safeContinuation('/clubs/club_123?tab=members')).toBe('/clubs/club_123?tab=members');
        expect(continuationQuery('/clubs/club_123')).toBe('?returnTo=%2Fclubs%2Fclub_123');
    });

    it.each(['https://evil.example', '//evil.example', '/\\evil.example', `/${'x'.repeat(1000)}`])(
        'rejects unsafe destination %s', destination => {
            expect(safeContinuation(destination)).toBe('/dashboard');
        }
    );

    it('keeps legacy invite and join-code parameters working', () => {
        expect(continuationFromParams(new URLSearchParams('inviteToken=invite_123')))
            .toBe('/clubs/join?token=invite_123');
        expect(continuationFromParams(new URLSearchParams('joinCode=123456')))
            .toBe('/clubs/join?code=123456');
    });
});
