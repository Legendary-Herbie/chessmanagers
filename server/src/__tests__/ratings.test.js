import { describe, expect, it } from 'vitest';
import {
    calculateNewRatings,
    expectedScore,
    kFactor,
} from '../utils/ratings.js';

const settings = {
    establishedKFactor: 32,
    provisionalKFactor: 40,
    provisionalGames: 10,
    ratingFloor: 500,
    roundRatings: true,
};

describe('category Elo engine', () => {
    it('calculates equal-rating wins and draws without rounding intermediate expectations', () => {
        expect(expectedScore(1500, 1500)).toBe(0.5);
        expect(calculateNewRatings(
            1500, 1500, 'white',
            { completedRatedGames: 0 }, { completedRatedGames: 0 }, settings
        )).toEqual({ newWhiteRating: 1520, newBlackRating: 1480 });
        expect(calculateNewRatings(
            1500, 1500, 'draw',
            { completedRatedGames: 0 }, { completedRatedGames: 0 }, settings
        )).toEqual({ newWhiteRating: 1500, newBlackRating: 1500 });
    });

    it('handles upset wins and returns final stored integers', () => {
        const result = calculateNewRatings(
            1000, 2000, 'white',
            { completedRatedGames: 0 }, { completedRatedGames: 0 }, settings
        );
        expect(result).toEqual({ newWhiteRating: 1040, newBlackRating: 1960 });
        expect(Number.isInteger(result.newWhiteRating)).toBe(true);
        expect(Number.isInteger(result.newBlackRating)).toBe(true);
    });

    it('uses each player’s own provisional threshold boundary and K-factor', () => {
        expect(kFactor({ completedRatedGames: 9 }, settings)).toBe(40);
        expect(kFactor({ completedRatedGames: 10 }, settings)).toBe(32);
        expect(calculateNewRatings(
            1500, 1500, 'white',
            { completedRatedGames: 9 }, { completedRatedGames: 10 }, settings
        )).toEqual({ newWhiteRating: 1520, newBlackRating: 1484 });
    });

    it('applies the configured floor and has no artificial maximum cap', () => {
        expect(calculateNewRatings(
            500, 400, 'black',
            { completedRatedGames: 0 }, { completedRatedGames: 0 },
            { ...settings, establishedKFactor: 100, provisionalKFactor: 100 }
        ).newWhiteRating).toBe(500);
        expect(calculateNewRatings(
            4000, 4000, 'white',
            { completedRatedGames: 0 }, { completedRatedGames: 0 }, settings
        ).newWhiteRating).toBe(4020);
    });
});
