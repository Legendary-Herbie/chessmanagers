import { ClubModel } from '../models/Club.js';

// GET /api/v1/clubs/mine
// Returns the club associated with the authenticated user.
// Called by ClubProvider in providers.jsx on mount.
export async function getMyClub(req, res, next) {
    try {
        const club = await ClubModel.findByUserId(req.user.id);

        if (!club) {
            return res.status(404).json({ error: 'No club found for this account.' });
        }

        res.json({ club });
    } catch (err) {
        next(err);
    }
}

// GET /api/v1/clubs/:clubId
export async function getClub(req, res, next) {
    try {
        const club = await ClubModel.findById(req.params.clubId);

        if (!club) {
            return res.status(404).json({ error: 'Club not found.' });
        }

        res.json({ club });
    } catch (err) {
        next(err);
    }
}

// POST /api/v1/clubs — admin only
export async function createClub(req, res, next) {
    try {
        const { name, description, logo, contactInfo } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Club name is required.' });
        }

        const club = await ClubModel.create({
            name,
            ownerId: req.user.id,
            description,
            logo,
            contactInfo,
        });

        // Add the creating user as the first member
        await ClubModel.addMember(club.id, req.user.id);

        res.status(201).json({ club });
    } catch (err) {
        next(err);
    }
}

// PATCH /api/v1/clubs/:clubId — admin only
export async function updateClub(req, res, next) {
    try {
        const { name, description, logo, contactInfo } = req.body;
        const club = await ClubModel.update(req.params.clubId, {
            name, description, logo, contactInfo,
        });

        if (!club) {
            return res.status(404).json({ error: 'Club not found.' });
        }

        res.json({ club });
    } catch (err) {
        next(err);
    }
}

// GET /api/v1/clubs/:clubId/members — admin only
export async function getMembers(req, res, next) {
    try {
        const members = await ClubModel.getMembers(req.params.clubId);
        res.json({ members });
    } catch (err) {
        next(err);
    }
}

// DELETE /api/v1/clubs/:clubId/members/:userId — admin only
export async function removeMember(req, res, next) {
    try {
        const { clubId, userId } = req.params;
        const removed = await ClubModel.removeMember(clubId, userId);

        if (!removed) {
            return res.status(404).json({ error: 'Member not found.' });
        }

        res.json({ message: 'Member removed.' });
    } catch (err) {
        next(err);
    }
}
