import { ClubModel } from '../models/Club.js';
import { PlayerModel } from '../models/Player.js';
import { removeImageAsset, storeImageAsset } from '../services/ImageAssetService.js';

export async function uploadPlayerPhoto(req, res, next) {
    let storedUrl;
    try {
        const existing = await PlayerModel.findByClubAndId(req.params.clubId, req.params.playerId, req.user.id);
        if (!existing) return res.status(404).json({ error: 'Player not found in this club.' });
        storedUrl = await storeImageAsset(req.file, `player-${req.params.playerId}`);
        const isAdmin = req.clubContext.capabilities.canManagePlayers;
        const result = isAdmin
            ? await PlayerModel.updateAdmin({
                clubId: req.params.clubId,
                playerId: req.params.playerId,
                actorUserId: req.user.id,
                changes: { photoUrl: storedUrl },
            })
            : await PlayerModel.updateSelfProfile({
                clubId: req.params.clubId,
                playerId: req.params.playerId,
                userId: req.user.id,
                changes: { photoUrl: storedUrl },
            });
        if (!result.ok) {
            await removeImageAsset(storedUrl);
            const status = result.code === 'PLAYER_NOT_FOUND' ? 404 : result.code === 'NOT_LINKED_PLAYER' ? 403 : 409;
            return res.status(status).json({ error: 'The player photo could not be updated.', code: result.code });
        }
        await removeImageAsset(existing.photo_url);
        return res.json({ player: result.player });
    } catch (error) {
        if (storedUrl) await removeImageAsset(storedUrl).catch(() => {});
        return next(error);
    }
}

export async function uploadClubBadge(req, res, next) {
    let storedUrl;
    try {
        storedUrl = await storeImageAsset(req.file, `club-${req.params.clubId}`);
        const previousUrl = req.clubContext.club.logo;
        const club = await ClubModel.updateManagementSettings(req.params.clubId, req.user.id, { logo: storedUrl });
        if (!club) {
            await removeImageAsset(storedUrl);
            return res.status(404).json({ error: 'Club not found.' });
        }
        await removeImageAsset(previousUrl);
        return res.json({ club });
    } catch (error) {
        if (storedUrl) await removeImageAsset(storedUrl).catch(() => {});
        return next(error);
    }
}
