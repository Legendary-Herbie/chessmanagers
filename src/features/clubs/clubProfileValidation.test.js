import { describe, expect, it } from 'vitest';
import { mapClubProfileApiErrors, validateClubProfile } from './clubProfileValidation.js';

const ratingSettings = Object.fromEntries(['blitz', 'rapid', 'classical'].map(category => [category, {
    initialRating: 1500,
    ratingFloor: 500,
    establishedKFactor: 32,
    provisionalKFactor: 40,
    provisionalGames: 10,
}]));

function profile(overrides = {}) {
    return {
        name: '  City Chess Club  ',
        federation: '  USCF  ',
        description: '  Friendly weekly chess  ',
        contact_info: '  Contact the secretary  ',
        settings_json: {
            contacts: {
                website: 'https://club.example.test',
                email: 'hello@club.example.test',
                phone: '+1 555 0100',
                address: '  42 Knight Street  ',
            },
            affiliation: '  City Association  ',
            presentation: { primaryColor: '#2563eb' },
        },
        rating_settings: ratingSettings,
        ...overrides,
    };
}

describe('club profile validation', () => {
    it('normalizes valid profile values before submission', () => {
        const result = validateClubProfile(profile(), { isOwner: true });

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
            name: 'City Chess Club',
            federation: 'USCF',
            description: 'Friendly weekly chess',
            contactInfo: 'Contact the secretary',
            contacts: { address: '42 Knight Street' },
            affiliation: 'City Association',
        });
    });

    it('returns field-specific errors for whitespace, malformed contacts, and invalid rating relationships', () => {
        const result = validateClubProfile(profile({
            name: '   ',
            settings_json: {
                contacts: { website: 'club.example.test', email: 'not-an-email' },
                presentation: { primaryColor: '#2563eb' },
            },
            rating_settings: {
                ...ratingSettings,
                blitz: { ...ratingSettings.blitz, initialRating: 1200, ratingFloor: 1300 },
            },
        }), { isOwner: true });

        expect(result.errors).toMatchObject({
            name: 'Club name is required.',
            website: expect.stringContaining('http://'),
            email: 'Enter a valid email address.',
            'ratingSettings.blitz.ratingFloor': 'Rating floor cannot exceed the initial rating.',
        });
    });

    it('validates badge type and size before any profile request is sent', () => {
        expect(validateClubProfile(profile(), {
            badgeFile: { type: 'image/gif', size: 100 },
        }).errors.badgeFile).toContain('JPEG');
        expect(validateClubProfile(profile(), {
            badgeFile: { type: 'image/png', size: 5 * 1024 * 1024 + 1 },
        }).errors.badgeFile).toContain('5 MB');
    });

    it('maps nested backend validation paths to visible profile fields', () => {
        expect(mapClubProfileApiErrors([
            { field: 'settings.contacts.website', message: 'Invalid website.' },
            { field: 'ratingSettings.rapid.ratingFloor', message: 'Invalid floor.' },
        ])).toEqual({
            website: 'Invalid website.',
            'ratingSettings.rapid.ratingFloor': 'Invalid floor.',
        });
    });
});
