import { PlayerRegistrationModel } from '../models/PlayerRegistration.js';

export async function listRegistrations(req, res, next) {
    try {
        // The route already requires an active membership; derive the review scope server-side.
        const registrations = await PlayerRegistrationModel.list(req.params.clubId, req.user.id,
            ['owner', 'admin'].includes(req.clubContext.membership.role));
        res.json({ registrations });
    } catch (error) { next(error); }
}
export async function submitRegistration(req, res, next) {
    try {
        const registration = await PlayerRegistrationModel.submit({ ...req.validated, clubId: req.params.clubId, userId: req.user.id });
        res.status(201).json({ registration });
    } catch (error) { next(error); }
}
export async function reviewRegistration(req, res, next) {
    try {
        const registration = await PlayerRegistrationModel.review({ ...req.validated, clubId: req.params.clubId,
            requestId: req.params.requestId, actorUserId: req.user.id });
        res.json({ registration });
    } catch (error) { next(error); }
}
