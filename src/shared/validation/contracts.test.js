import { expect, it } from 'vitest';
import { createClubSchema, createMatchSchema, createPlayerSchema } from '../../../server/shared/validation.js';
import { validate } from '../../../server/src/middleware/validate.js';
import { parseInput } from './parseInput.js';
import { validateClubProfile } from '../../features/clubs/clubProfileValidation.js';

it('uses identical normalized player values and field messages at both API boundaries', () => {
    const payload = { name: '  Alex  ', startRatings: { rapid: 1600 }, bio: '  Hello  ' };
    const request = { body: payload };
    validate(createPlayerSchema)(request, {}, () => {});
    expect(parseInput(createPlayerSchema, payload)).toEqual(request.validated);
    let clientError;
    try { parseInput(createPlayerSchema, { name: ' ' }); } catch (error) { clientError = error; }
    let serverError;
    const response = { status() { return this; }, json(value) { serverError = value; } };
    validate(createPlayerSchema)({ body: { name: ' ' } }, response, () => {});
    expect(clientError.errors).toEqual(serverError.errors);
    expect(clientError.type).toBe('validation');
});
it('shares club federation restrictions and independent rating categories', () => {
    const frontend = validateClubProfile({ name: 'Club', federation: 'TOOLONG' });
    const backend = createClubSchema.safeParse({ name: 'Club', federation: 'TOOLONG' });
    expect(frontend.errors.federation).toBe(backend.error.issues[0].message);
    expect(createMatchSchema.safeParse({ whitePlayerId: 'a', blackPlayerId: 'b', result: 'draw', ratingCategory: 'bullet', isRated: true, playedAt: '2026-09-16T12:00:00Z' }).success).toBe(false);
});
