import { PlayerModel } from '../models/Player.js';
import { PlayerLinkModel } from '../models/PlayerLink.js';

// GET /api/v1/clubs/:clubId/players
export async function getPlayers(req, res, next) {
    try {
        const players = await PlayerModel.findByClub(req.params.clubId);
        res.json({ players });
    } catch (err) {
        next(err);
    }
}

// GET /api/v1/clubs/:clubId/players/:playerId
export async function getPlayer(req, res, next) {
    try {
        const player = await PlayerModel.findById(req.params.playerId);

        if (!player) {
            return res.status(404).json({ error: 'Player not found.' });
        }

        res.json({ player });
    } catch (err) {
        next(err);
    }
}

// POST /api/v1/clubs/:clubId/players — admin only
export async function createPlayer(req, res, next) {
    try {
        const { name, rating, bio } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Player name is required.' });
        }

        const player = await PlayerModel.create({
            clubId: req.params.clubId,
            name,
            rating,
            bio,
        });

        res.status(201).json({ player });
    } catch (err) {
        next(err);
    }
}

// PATCH /api/v1/clubs/:clubId/players/:playerId
// Admin can update any player.
// Linked players can only update their own — enforced via requireRole middleware.
export async function updatePlayer(req, res, next) {
    try {
        const { name, bio } = req.body;
        const player = await PlayerModel.update(req.params.playerId, { name, bio });

        if (!player) {
            return res.status(404).json({ error: 'Player not found.' });
        }

        res.json({ player });
    } catch (err) {
        next(err);
    }
}

// DELETE /api/v1/clubs/:clubId/players/:playerId — admin only
export async function deletePlayer(req, res, next) {
    try {
        const deleted = await PlayerModel.delete(req.params.playerId);

        if (!deleted) {
            return res.status(404).json({ error: 'Player not found.' });
        }

        res.json({ message: 'Player deleted.' });
    } catch (err) {
        next(err);
    }
}

// ── Player link management ─────────────────────────────────────────────────────

// POST /api/v1/clubs/:clubId/players/:playerId/claim
// Authenticated user requests to link their account to this player.
export async function claimPlayer(req, res, next) {
    try {
        const { playerId } = req.params;
        const userId = req.user.id;

        // Prevent duplicate claim requests
        const existing = await PlayerLinkModel.findByUser(userId);
        if (existing) {
            return res.status(409).json({
                error: 'You already have a pending or approved link request.',
            });
        }

        const link = await PlayerLinkModel.requestLink(userId, playerId);
        res.status(201).json({ link });
    } catch (err) {
        next(err);
    }
}

// GET /api/v1/clubs/:clubId/links/pending — admin only
export async function getPendingLinks(req, res, next) {
    try {
        const links = await PlayerLinkModel.findPendingByClub(req.params.clubId);
        res.json({ links });
    } catch (err) {
        next(err);
    }
}

// PATCH /api/v1/clubs/:clubId/links/:linkId/approve — admin only
export async function approveLink(req, res, next) {
    try {
        const link = await PlayerLinkModel.approve(req.params.linkId);

        if (!link) {
            return res.status(404).json({ error: 'Link request not found.' });
        }

        res.json({ link });
    } catch (err) {
        next(err);
    }
}

// PATCH /api/v1/clubs/:clubId/links/:linkId/reject — admin only
export async function rejectLink(req, res, next) {
    try {
        const link = await PlayerLinkModel.reject(req.params.linkId);

        if (!link) {
            return res.status(404).json({ error: 'Link request not found.' });
        }

        res.json({ link });
    } catch (err) {
        next(err);
    }
}

// DELETE /api/v1/clubs/:clubId/players/:playerId/unlink — admin only
export async function unlinkPlayer(req, res, next) {
    try {
        const { playerId } = req.params;
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'userId is required.' });
        }

        const removed = await PlayerLinkModel.unlink(userId, playerId);

        if (!removed) {
            return res.status(404).json({ error: 'No active link found.' });
        }

        res.json({ message: 'Player unlinked.' });
    } catch (err) {
        next(err);
    }
}