/**
 * ELO rating utilities for backend.
 *
 * Default settings — override by passing a settings object.
 * These match what the frontend ratingUtils expect.
 */
export const DEFAULT_SETTINGS = {
    baseK:            32,   // K-factor for established players
    provisionalK:     40,   // K-factor for players below provisionalGames threshold
    provisionalGames: 10,   // games played before a player is considered established
    defaultStartRating: 1200,
    minRating:        500,
    maxRating:        3200,
    roundRatings:     true,
};

// ─── Core ELO functions ───────────────────────────────────────────────────────
export function expectedScore(rSelf, rOpp) {
    return 1 / (1 + Math.pow(10, (rOpp - rSelf) / 400));
}

export function kFactor(player, settings = DEFAULT_SETTINGS) {
    if (!player) return settings.baseK;
    if ((player.games || 0) < (settings.provisionalGames || 0)) return settings.provisionalK;
    return settings.baseK;
}

function resultToScore(result) {
    if (result === 'white') return 1;
    if (result === 'draw')  return 0.5;
    if (result === 'black') return 0;
    throw new Error(`Unknown result value: "${result}". Expected 'white', 'black', or 'draw'.`);
}

// ─── applyMatch ───────────────────────────────────────────────────────────────

/**
 * Applies a match result to a player map.
 *
 * - Does NOT mutate the original player objects — creates new entries via pmap.set().
 * - Returns an enriched match object with rating snapshots (aBefore, aAfter, aDelta, etc.)
 *   so callers can persist rating_history records.
 * - Returns the original match unchanged for unrated matches or missing players.
 *
 * @param {Map}    pmap     - Map of playerId → player object
 * @param {object} match    - Match object with aId (white), bId (black), result, date
 * @param {object} settings - Rating settings
 * @returns {object} Enriched match object
 */
export function applyMatch(pmap, match, settings = DEFAULT_SETTINGS) {
    const A = pmap.get(match.aId); // white
    const B = pmap.get(match.bId); // black

    if (!A || !B) return match;
    if (match.rated === false) return match;

    const aBefore = A.rating;
    const bBefore = B.rating;
    const { newWhiteRating: aAfter, newBlackRating: bAfter } = calculateNewRatings(
        aBefore, bBefore, match.result, A, B, settings,
    );
    const EA = expectedScore(aBefore, bBefore);
    const EB = 1 - EA;
    const SA = resultToScore(match.result);
    const SB = 1 - SA;
    const KA = kFactor(A, settings);
    const KB = kFactor(B, settings);

    // Immutable update — never mutate the objects already in the map
    pmap.set(A.id, {
        ...A,
        prevRating: aBefore,
        rating:     aAfter,
        games:      (A.games  || 0) + 1,
        wins:       (A.wins   || 0) + (SA === 1   ? 1 : 0),
        draws:      (A.draws  || 0) + (SA === 0.5 ? 1 : 0),
        losses:     (A.losses || 0) + (SA === 0   ? 1 : 0),
        lastPlayed: match.date,
    });

    pmap.set(B.id, {
        ...B,
        prevRating: bBefore,
        rating:     bAfter,
        games:      (B.games  || 0) + 1,
        wins:       (B.wins   || 0) + (SB === 1   ? 1 : 0),
        draws:      (B.draws  || 0) + (SB === 0.5 ? 1 : 0),
        losses:     (B.losses || 0) + (SB === 0   ? 1 : 0),
        lastPlayed: match.date,
    });

    // Return enriched match with full rating snapshot
    return {
        ...match,
        aId:       A.id,
        bId:       B.id,
        aName:     A.name,
        bName:     B.name,
        aBefore,
        bBefore,
        aAfter,
        bAfter,
        aDelta:    aAfter - aBefore,
        bDelta:    bAfter - bBefore,
        kA:        KA,
        kB:        KB,
        aExpected: EA,
        bExpected: EB,
    };
}

// ─── calculateNewRatings ──────────────────────────────────────────────────────

/**
 * Thin wrapper consumed by matchController.
 * Takes two current ratings and a result string, returns new ratings.
 *
 * Usage:
 *   const { newWhiteRating, newBlackRating } = calculateNewRatings(
 *       white.rating, black.rating, result, white, black
 *   );
 *
 * @param {number} whiteRating  - Current rating of white player
 * @param {number} blackRating  - Current rating of black player
 * @param {string} result       - 'white' | 'black' | 'draw'
 * @param {object} whitePlayer  - Full white player object (for K-factor)
 * @param {object} blackPlayer  - Full black player object (for K-factor)
 * @param {object} settings     - Optional settings override
 */
export function calculateNewRatings(
    whiteRating,
    blackRating,
    result,
    whitePlayer = null,
    blackPlayer = null,
    settings = DEFAULT_SETTINGS
) {
    const SA = resultToScore(result);
    const SB = 1 - SA;

    const EA = expectedScore(whiteRating, blackRating);
    const EB = 1 - EA;

    const KA = kFactor(whitePlayer, settings);
    const KB = kFactor(blackPlayer, settings);

    let newWhiteRating = whiteRating + KA * (SA - EA);
    let newBlackRating = blackRating + KB * (SB - EB);

    if (settings.roundRatings) {
        newWhiteRating = Math.round(newWhiteRating);
        newBlackRating = Math.round(newBlackRating);
    }

    newWhiteRating = Math.min(settings.maxRating, Math.max(settings.minRating, newWhiteRating));
    newBlackRating = Math.min(settings.maxRating, Math.max(settings.minRating, newBlackRating));

    return { newWhiteRating, newBlackRating };
}

// ─── FIDE performance rating ──────────────────────────────────────────────────

const FIDE_SCORE_TABLE = [
    { score: 0.00, difference: -800 },
    { score: 0.10, difference: -366 },
    { score: 0.20, difference: -240 },
    { score: 0.30, difference: -149 },
    { score: 0.40, difference:  -72 },
    { score: 0.50, difference:    0 },
    { score: 0.60, difference:   72 },
    { score: 0.70, difference:  149 },
    { score: 0.80, difference:  240 },
    { score: 0.90, difference:  366 },
    { score: 1.00, difference:  800 },
];

export function scoreToRatingDifference(scorePercentage) {
    const score = Math.max(0, Math.min(1, scorePercentage));
    for (let i = 0; i < FIDE_SCORE_TABLE.length - 1; i++) {
        const lower = FIDE_SCORE_TABLE[i];
        const upper = FIDE_SCORE_TABLE[i + 1];
        if (score >= lower.score && score <= upper.score) {
            if (score === lower.score) return lower.difference;
            if (score === upper.score) return upper.difference;
            const ratio = (score - lower.score) / (upper.score - lower.score);
            const diff  = lower.difference + ratio * (upper.difference - lower.difference);
            return Math.sign(diff) * Math.round(Math.abs(diff));
        }
    }
    return 0;
}

export function calculatePerformanceRating(avgOpponentRating, scorePercentage) {
    return Math.round(avgOpponentRating + scoreToRatingDifference(scorePercentage));
}
