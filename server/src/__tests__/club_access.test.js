import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../models/Match.js', () => ({
    MatchModel: { findById: vi.fn() },
}));
vi.mock('../models/Player.js', () => ({ PlayerModel: {} }));
vi.mock('../models/Tournament.js', () => ({ TournamentModel: {} }));
vi.mock('../database/database.js', () => ({ default: {} }));
vi.mock('../utils/recalculation.js', () => ({ recalculateRatingsForClub: vi.fn() }));

const { MatchModel } = await import('../models/Match.js');
const { getMatch } = await import('../controllers/matchController.js');

function response() {
    return {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
    };
}

describe('club-scoped match access', () => {
    beforeEach(() => vi.clearAllMocks());

    it('queries a match with the route club ID, preventing cross-club IDOR reads', async () => {
        const req = { params: { clubId: 'club_a', matchId: 'match_from_club_b' } };
        const res = response();
        MatchModel.findById.mockResolvedValue(null);

        await getMatch(req, res, vi.fn());

        expect(MatchModel.findById).toHaveBeenCalledWith('match_from_club_b', 'club_a');
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'Match not found.' });
    });
});
