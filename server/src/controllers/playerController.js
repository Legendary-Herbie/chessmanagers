import { PlayerModel } from '../models/Player.js';
import { PlayerLinkModel } from '../models/PlayerLink.js';

const MESSAGES = {
    PLAYER_NOT_FOUND: [404, 'Player not found in this club.'],
    LINK_NOT_FOUND: [404, 'Link request not found in this club.'],
    PLAYER_DELETED: [409, 'Deleted players cannot be changed.'],
    PLAYER_NOT_ACTIVE: [409, 'Only active players can be claimed or linked.'],
    INVALID_PLAYER_STATUS: [409, 'Player is not in the required lifecycle state.'],
    LINK_NOT_PENDING: [409, 'This claim request is no longer pending.'],
    CLAIM_CONFLICT: [409, 'The member or player already has a pending or approved claim in this club.'],
    NOT_ACTIVE_MEMBER: [403, 'An active club membership is required.'],
    NOT_LINKED_PLAYER: [403, 'You can only edit your own linked player profile.'],
    NOT_LINK_OWNER: [403, 'You can only unlink your own player profile.'],
    CLUB_NOT_ACTIVE: [409, 'This club is not active.'],
    NO_CHANGES: [400, 'At least one field must be provided.'],
};

function sendFailure(res, result) {
    const [status, message] = MESSAGES[result.code] ?? [400, 'The requested operation could not be completed.'];
    return res.status(status).json({ error: message, code: result.code });
}

export async function getPlayers(req, res, next) {
    try {
        const { q = '', limit = 50, offset = 0 } = req.validatedQuery;
        const result = await PlayerModel.findByClub(req.params.clubId, req.user.id, { q, limit, offset });
        res.json({ players: result.players, total: result.total, limit, offset });
    } catch (error) {
        next(error);
    }
}

export async function getInactivePlayers(req, res, next) {
    try {
        const players = await PlayerModel.findInactiveByClub(req.params.clubId);
        res.json({ players });
    } catch (error) {
        next(error);
    }
}

export async function getPlayer(req, res, next) {
    try {
        const player = await PlayerModel.findByClubAndId(req.params.clubId, req.params.playerId, req.user.id);
        if (!player) return res.status(404).json({ error: 'Player not found in this club.' });
        res.json({ player });
    } catch (error) {
        next(error);
    }
}

export async function createPlayer(req, res, next) {
    try {
        const player = await PlayerModel.create({
            clubId: req.params.clubId,
            actorUserId: req.user.id,
            ...req.validated,
        });
        res.status(201).json({ player });
    } catch (error) {
        next(error);
    }
}

export async function createPlayersBulk(req, res, next) {
    try {
        const created = await PlayerModel.createBulk({
            clubId: req.params.clubId,
            actorUserId: req.user.id,
            players: req.validated.players,
        });
        res.status(201).json({ players: created, count: created.length });
    } catch (error) {
        next(error);
    }
}

export async function updatePlayer(req, res, next) {
    try {
        if (!req.clubContext.capabilities.canManagePlayers) {
            const officialFields = ['name', 'dateOfBirth', 'federationId'];
            if (officialFields.some(field => Object.prototype.hasOwnProperty.call(req.validated, field))) {
                return res.status(403).json({ error: 'Only club admins may change official player identity fields.' });
            }
            const selfChanges = {};
            if (Object.prototype.hasOwnProperty.call(req.validated, 'bio')) selfChanges.bio = req.validated.bio;
            const selfResult = await PlayerModel.updateSelfProfile({
                clubId: req.params.clubId,
                playerId: req.params.playerId,
                userId: req.user.id,
                changes: selfChanges,
            });
            if (!selfResult.ok) return sendFailure(res, selfResult);
            return res.json({ player: selfResult.player });
        }
        const result = await PlayerModel.updateAdmin({
            clubId: req.params.clubId,
            playerId: req.params.playerId,
            actorUserId: req.user.id,
            changes: req.validated,
        });
        if (!result.ok) return sendFailure(res, result);
        return res.json({ player: result.player });
    } catch (error) {
        next(error);
    }
}

export async function updateOwnPlayerProfile(req, res, next) {
    try {
        const result = await PlayerModel.updateSelfProfile({
            clubId: req.params.clubId,
            playerId: req.params.playerId,
            userId: req.user.id,
            changes: req.validated,
        });
        if (!result.ok) return sendFailure(res, result);
        res.json({ player: result.player });
    } catch (error) {
        next(error);
    }
}

async function changePlayerStatus(req, res, next, transition) {
    try {
        const result = await PlayerModel.setStatus({
            clubId: req.params.clubId,
            playerId: req.params.playerId,
            actorUserId: req.user.id,
            ...transition,
        });
        if (!result.ok) return sendFailure(res, result);
        res.json({ player: result.player });
    } catch (error) {
        next(error);
    }
}

export const archivePlayer = (req, res, next) => changePlayerStatus(req, res, next, {
    fromStatus: 'active', toStatus: 'inactive', eventType: 'player.archived',
});

export const restorePlayer = (req, res, next) => changePlayerStatus(req, res, next, {
    fromStatus: 'inactive', toStatus: 'active', eventType: 'player.restored',
});

export const deletePlayer = (req, res, next) => changePlayerStatus(req, res, next, {
    fromStatus: 'inactive', toStatus: 'deleted', eventType: 'player.deleted',
});

export async function claimPlayer(req, res, next) {
    try {
        const result = await PlayerLinkModel.requestClaim({
            clubId: req.params.clubId,
            playerId: req.params.playerId,
            userId: req.user.id,
        });
        if (!result.ok) return sendFailure(res, result);
        res.status(201).json({ link: result.link });
    } catch (error) {
        next(error);
    }
}

export async function getPendingLinks(req, res, next) {
    try {
        const links = await PlayerLinkModel.findPendingByClub(req.params.clubId);
        res.json({ links });
    } catch (error) {
        next(error);
    }
}

export async function approveLink(req, res, next) {
    try {
        const result = await PlayerLinkModel.approve({
            clubId: req.params.clubId,
            linkId: req.params.linkId,
            actorUserId: req.user.id,
        });
        if (!result.ok) return sendFailure(res, result);
        res.json({ link: result.link });
    } catch (error) {
        next(error);
    }
}

export async function rejectLink(req, res, next) {
    try {
        const result = await PlayerLinkModel.reject({
            clubId: req.params.clubId,
            linkId: req.params.linkId,
            actorUserId: req.user.id,
            reason: req.validated.reason ?? null,
        });
        if (!result.ok) return sendFailure(res, result);
        res.json({ link: result.link });
    } catch (error) {
        next(error);
    }
}

export async function unlinkPlayer(req, res, next) {
    try {
        const result = await PlayerLinkModel.unlink({
            clubId: req.params.clubId,
            playerId: req.params.playerId,
            actorUserId: req.user.id,
            actorIsAdmin: req.clubContext.capabilities.canManagePlayers,
            reason: req.validated.reason ?? null,
        });
        if (!result.ok) return sendFailure(res, result);
        res.json({ message: 'Player account link removed.' });
    } catch (error) {
        next(error);
    }
}
