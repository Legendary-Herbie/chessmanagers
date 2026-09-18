import { LeaderboardModel } from '../models/Leaderboard.js';
import { PlayerModel } from '../models/Player.js';
import { TournamentModel } from '../models/Tournament.js';
import { PublicClubAccessService } from '../services/PublicClubAccessService.js';
import { getTournamentDetail } from '../services/TournamentService.js';
import { toPublicClubPresentation, toPublicPlayer, toPublicTournament } from '../utils/publicDtos.js';

async function publicClub(clubId, res) {
    const club = await PublicClubAccessService.getPublicClub(clubId);
    if (!club) res.status(404).json({ error: 'Resource not found.' });
    return club;
}

function toPublicLeaderboardEntry(source) {
    const entry = { ...source };
    delete entry.playerId;
    return entry;
}

export async function getPublicClub(req, res, next) {
    try {
        const club = await publicClub(req.params.clubId, res);
        if (club) res.json({ club: toPublicClubPresentation(club) });
    } catch (error) {
        next(error);
    }
}

export async function getPublicLeaderboard(req, res, next) {
    try {
        const club = await publicClub(req.params.clubId, res);
        if (!club) return;
        if (!club.public_leaderboard) return res.status(404).json({ error: 'Resource not found.' });
        const { category = 'rapid', limit = 50, offset = 0, q = '' } = req.validatedQuery;
        const leaderboard = await LeaderboardModel.getByClub(req.params.clubId, { category, limit, offset, q });
        res.json({ leaderboard: {
            ...leaderboard,
            entries: leaderboard.entries.map(toPublicLeaderboardEntry),
        } });
    } catch (error) {
        next(error);
    }
}

export async function getPublicTournament(req, res, next) {
    try {
        const { clubId, tournamentId } = req.params;
        if (!await publicClub(clubId, res)) return;
        const tournament = await TournamentModel.findById(tournamentId, clubId);
        if (!tournament) return res.status(404).json({ error: 'Resource not found.' });
        const [players, detail] = await Promise.all([
            TournamentModel.getPlayers(tournamentId, clubId), getTournamentDetail(clubId, tournamentId),
        ]);
        const publicIds = new Map(players.map(player => [player.id, player.public_id]));
        res.json({
            tournament: toPublicTournament(tournament),
            players: players.map(toPublicPlayer),
            standings: detail.standings.map(({ playerId, playerName, ...standing }) => ({
                publicPlayerId: publicIds.get(playerId),
                name: playerName,
                score: standing.matchPoints,
                ...standing,
            })),
        });
    } catch (error) {
        next(error);
    }
}

export async function getPublicPlayer(req, res, next) {
    try {
        const { clubId, playerId } = req.params;
        if (!await publicClub(clubId, res)) return;
        const player = await PlayerModel.findByPublicId(clubId, playerId);
        if (!player) return res.status(404).json({ error: 'Resource not found.' });
        res.json({ player: toPublicPlayer(player) });
    } catch (error) {
        next(error);
    }
}
