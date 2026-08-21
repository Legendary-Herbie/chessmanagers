import { describe, expect, it } from 'vitest';
import { matchResultLabel } from './matchPresentation.js';

describe('match presentation', () => {
    it('renders canonical human-readable result labels', () => {
        expect(matchResultLabel('white')).toBe('White wins');
        expect(matchResultLabel('black')).toBe('Black wins');
        expect(matchResultLabel('draw')).toBe('Draw');
        expect(matchResultLabel('invalid')).toBe('Unknown result');
    });
});
