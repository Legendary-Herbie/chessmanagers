import { PlayerModel } from '../models/Player.js';
import { PlayerLinkModel } from '../models/PlayerLink.js';
import { UserModel } from '../models/User.js';

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

        if (!player || player.club_id !== req.params.clubId) {
            return res.status(404).json({ error: 'Player not found in this club.' });
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
            rating: rating ? parseInt(rating, 10) : 1200,
            bio,
        });

        res.status(201).json({ player });
    } catch (err) {
        next(err);
    }
}

// POST /api/v1/clubs/:clubId/players/bulk — admin only
export async function createPlayersBulk(req, res, next) {
    try {
        const { players } = req.body;

        if (!Array.isArray(players) || players.length === 0) {
            return res.status(400).json({ error: 'players array is required and must not be empty.' });
        }

        for (const p of players) {
            if (!p.name || typeof p.name !== 'string' || !p.name.trim()) {
                return res.status(400).json({ error: 'All players must have a valid name.' });
            }
        }

        const created = await PlayerModel.createBulk({
            clubId: req.params.clubId,
            players,
        });

        res.status(201).json({ players: created, count: created.length });
    } catch (err) {
        next(err);
    }
}

// PATCH /api/v1/clubs/:clubId/players/:playerId
// Admin can update any player.
// Linked players can only update their own — enforced via requireRole & requireSelfOrAdmin middleware.
export async function updatePlayer(req, res, next) {
    try {
        const existing = await PlayerModel.findById(req.params.playerId);
        if (!existing || existing.club_id !== req.params.clubId) {
            return res.status(404).json({ error: 'Player not found in this club.' });
        }

        const { name, bio } = req.body;
        const player = await PlayerModel.update(req.params.playerId, { name, bio });

        res.json({ player });
    } catch (err) {
        next(err);
    }
}

// DELETE /api/v1/clubs/:clubId/players/:playerId — admin only
export async function deletePlayer(req, res, next) {
    try {
        const existing = await PlayerModel.findById(req.params.playerId);
        if (!existing || existing.club_id !== req.params.clubId) {
            return res.status(404).json({ error: 'Player not found in this club.' });
        }

        await PlayerModel.delete(req.params.playerId);
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
        const { playerId, clubId } = req.params;
        const userId = req.user.id;

        const player = await PlayerModel.findById(playerId);
        if (!player || player.club_id !== clubId) {
            return res.status(404).json({ error: 'Player not found in this club.' });
        }

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

// GET /api/v1/clubs/:clubId/links/pending or /player-links/pending — admin only
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
        const linkInfo = await PlayerLinkModel.findById(req.params.linkId);
        if (!linkInfo || linkInfo.club_id !== req.params.clubId) {
            return res.status(404).json({ error: 'Link request not found in this club.' });
        }

        const link = await PlayerLinkModel.approve(req.params.linkId);

        if (!link) {
            return res.status(404).json({ error: 'Link request not found.' });
        }

        // Grant the user the `linked_player` role if not already admin
        try {
            const user = await UserModel.findById(link.user_id);
            if (user && user.role !== 'admin') {
                await UserModel.updateRole(link.user_id, 'linked_player');
            }
        } catch (e) {
            console.error('[WARN] Failed to update user role on link approval:', e);
        }

        res.json({ link });
    } catch (err) {
        next(err);
    }
}

// PATCH /api/v1/clubs/:clubId/links/:linkId/reject — admin only
export async function rejectLink(req, res, next) {
    try {
        const linkInfo = await PlayerLinkModel.findById(req.params.linkId);
        if (!linkInfo || linkInfo.club_id !== req.params.clubId) {
            return res.status(404).json({ error: 'Link request not found in this club.' });
        }

        const link = await PlayerLinkModel.reject(req.params.linkId);

        if (!link) {
            return res.status(404).json({ error: 'Link request not found.' });
        }

        // Check if user has any other approved links, if 0 revert role to member
        try {
            const count = await PlayerLinkModel.countApprovedByUser(link.user_id);
            const user = await UserModel.findById(link.user_id);
            if (count === 0 && user && user.role === 'linked_player') {
                await UserModel.updateRole(link.user_id, 'member');
            }
        } catch (e) {
            console.error('[WARN] Failed to check/revert user role on link rejection:', e);
        }

        res.json({ link });
    } catch (err) {
        next(err);
    }
}

// DELETE /api/v1/clubs/:clubId/players/:playerId/unlink — admin only
export async function unlinkPlayer(req, res, next) {
    try {
        const { playerId, clubId } = req.params;
        const userId = req.body?.userId || req.query?.userId;

        const player = await PlayerModel.findById(playerId);
        if (!player || player.club_id !== clubId) {
            return res.status(404).json({ error: 'Player not found in this club.' });
        }

        // If userId is omitted, find the linked user for this player
        let targetUserId = userId;
        if (!targetUserId && player.linked_user_id) {
            targetUserId = player.linked_user_id;
        }

        if (!targetUserId) {
            return res.status(400).json({ error: 'userId is required to unlink player.' });
        }

        const removed = await PlayerLinkModel.unlink(targetUserId, playerId);

        if (!removed) {
            return res.status(404).json({ error: 'No active link found for this player.' });
        }

        // Check remaining approved links for target user, if 0 revert role to member
        try {
            const count = await PlayerLinkModel.countApprovedByUser(targetUserId);
            const user = await UserModel.findById(targetUserId);
            if (count === 0 && user && user.role === 'linked_player') {
                await UserModel.updateRole(targetUserId, 'member');
            }
        } catch (e) {
            console.error('[WARN] Failed to check/revert user role on unlinking:', e);
        }

        res.json({ message: 'Player unlinked.' });
    } catch (err) {
        next(err);
    }
}