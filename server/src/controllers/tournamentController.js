import { TournamentModel } from '../models/Tournament.js';
import { PlayerModel } from '../models/Player.js';

const VALID_TYPES    = ['round_robin', 'knockout', 'swiss', 'arena'];
const VALID_STATUSES = ['upcoming', 'active', 'completed'];

// GET /api/v1/clubs/:clubId/tournaments
export async function getTournaments(req, res, next) {
    try {
        const { status } = req.query;
        const tournaments = await TournamentModel.findByClub(req.params.clubId, { status });
        res.json({ tournaments });
    } catch (err) {
        next(err);
    }
}

// GET /api/v1/clubs/:clubId/tournaments/:tournamentId
export async function getTournament(req, res, next) {
    try {
        const { clubId, tournamentId } = req.params;
        const tournament = await TournamentModel.findById(tournamentId, clubId);
        if (!tournament) {
            return res.status(404).json({ error: 'Tournament not found.' });
        }
        const [players, standings] = await Promise.all([
            TournamentModel.getPlayers(tournamentId, clubId),
            TournamentModel.getStandings(req.params.tournamentId),
        ]);

        res.json({ tournament, players, standings });
    } catch (err) {
        next(err);
    }
}

// POST /api/v1/clubs/:clubId/tournaments — admin only
export async function createTournament(req, res, next) {
    try {
        const { name, type, startDate, endDate } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Tournament name is required.' });
        }
        if (!VALID_TYPES.includes(type)) {
            return res.status(400).json({ error: `Type must be one of: ${VALID_TYPES.join(', ')}.` });
        }
        if (!startDate) {
            return res.status(400).json({ error: 'Start date is required.' });
        }

        const tournament = await TournamentModel.create({
            clubId: req.params.clubId,
            name,
            type,
            startDate,
            endDate,
        });

        res.status(201).json({ tournament });
    } catch (err) {
        next(err);
    }
}

// PATCH /api/v1/clubs/:clubId/tournaments/:tournamentId — admin only
export async function updateTournament(req, res, next) {
    try {
        const { name, startDate, endDate } = req.body;
        const tournament = await TournamentModel.update(req.params.tournamentId, req.params.clubId, {
            name, startDate, endDate,
        });

        if (!tournament) {
            return res.status(404).json({ error: 'Tournament not found.' });
        }

        res.json({ tournament });
    } catch (err) {
        next(err);
    }
}

// PATCH /api/v1/clubs/:clubId/tournaments/:tournamentId/status — admin only
export async function setTournamentStatus(req, res, next) {
    try {
        const { status } = req.body;

        if (!VALID_STATUSES.includes(status)) {
            return res.status(400).json({ error: `Status must be one of: ${VALID_STATUSES.join(', ')}.` });
        }

        const tournament = await TournamentModel.setStatus(req.params.tournamentId, req.params.clubId, status);

        if (!tournament) {
            return res.status(404).json({ error: 'Tournament not found.' });
        }

        res.json({ tournament });
    } catch (err) {
        next(err);
    }
}

// DELETE /api/v1/clubs/:clubId/tournaments/:tournamentId — admin only
export async function deleteTournament(req, res, next) {
    try {
        const deleted = await TournamentModel.delete(req.params.tournamentId, req.params.clubId);

        if (!deleted) {
            return res.status(404).json({ error: 'Tournament not found.' });
        }

        res.json({ message: 'Tournament deleted.' });
    } catch (err) {
        next(err);
    }
}

// ── Player roster management ───────────────────────────────────────────────────

// GET /api/v1/clubs/:clubId/tournaments/:tournamentId/players
export async function getTournamentPlayers(req, res, next) {
    try {
        const tournament = await TournamentModel.findById(req.params.tournamentId, req.params.clubId);
        if (!tournament) return res.status(404).json({ error: 'Tournament not found.' });
        const players = await TournamentModel.getPlayers(req.params.tournamentId, req.params.clubId);
        res.json({ players });
    } catch (err) {
        next(err);
    }
}

// POST /api/v1/clubs/:clubId/tournaments/:tournamentId/players — admin only
export async function addTournamentPlayer(req, res, next) {
    try {
        const { playerId } = req.body;
        const { tournamentId, clubId } = req.params;

        if (!playerId) {
            return res.status(400).json({ error: 'playerId is required.' });
        }

        // Confirm the player exists before adding
        const player = await PlayerModel.findById(playerId);
        if (!player || player.club_id !== clubId) {
            return res.status(404).json({ error: 'Player not found in this club.' });
        }

        const entry = await TournamentModel.addPlayer(tournamentId, playerId, clubId);
        if (!entry) return res.status(404).json({ error: 'Tournament not found in this club.' });
        res.status(201).json({ entry });
    } catch (err) {
        next(err);
    }
}

// DELETE /api/v1/clubs/:clubId/tournaments/:tournamentId/players/:playerId — admin only
export async function removeTournamentPlayer(req, res, next) {
    try {
        const { tournamentId, playerId } = req.params;
        const removed = await TournamentModel.removePlayer(tournamentId, playerId, req.params.clubId);

        if (!removed) {
            return res.status(404).json({ error: 'Player not in this tournament.' });
        }

        res.json({ message: 'Player removed from tournament.' });
    } catch (err) {
        next(err);
    }
}

// GET /api/v1/clubs/:clubId/tournaments/:tournamentId/standings
export async function getTournamentStandings(req, res, next) {
    try {
        const tournament = await TournamentModel.findById(req.params.tournamentId, req.params.clubId);
        if (!tournament) return res.status(404).json({ error: 'Tournament not found.' });
        const standings = await TournamentModel.getStandings(req.params.tournamentId);
        res.json({ standings });
    } catch (err) {
        next(err);
    }
}
