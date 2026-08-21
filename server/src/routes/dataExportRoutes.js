import express from 'express';
import { z } from 'zod';
import {
    exportCurrentRatings,
    exportMatchHistory,
    exportPlayerRoster,
} from '../controllers/dataExportController.js';
import { requireAuth } from '../middleware/auth.js';
import { loadClubContext, requireActiveClubMember, requireClubAdmin } from '../middleware/requireRole.js';
import { clubParamsSchema, validateRequest } from '../middleware/validate.js';

const router = express.Router({ mergeParams: true });
const booleanQuery = z.enum(['true', 'false']).transform(value => value === 'true').optional();
const categoryQuery = z.enum(['blitz', 'rapid', 'classical']).optional();
const playerExportQuery = z.object({ includeInactive: booleanQuery }).strict();
const matchExportQuery = z.object({ category: categoryQuery }).strict();
const ratingExportQuery = z.object({ category: categoryQuery, includeInactive: booleanQuery }).strict();

router.use(
    requireAuth,
    validateRequest({ params: clubParamsSchema }),
    loadClubContext,
    requireActiveClubMember,
    requireClubAdmin
);

router.get('/players.csv', validateRequest({ query: playerExportQuery }), exportPlayerRoster);
router.get('/matches.csv', validateRequest({ query: matchExportQuery }), exportMatchHistory);
router.get('/ratings.csv', validateRequest({ query: ratingExportQuery }), exportCurrentRatings);

export default router;
