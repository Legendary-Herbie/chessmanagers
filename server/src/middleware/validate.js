import { z } from 'zod';



function validationErrors(source, error) {
    return error.errors.map(issue => ({
        field: source === 'body'
            ? issue.path.join('.')
            : [source, ...issue.path].filter(Boolean).join('.'),
        message: issue.message,
    }));
}

export function validateRequest(schemas) {
    return (req, res, next) => {
        for (const [source, schema] of Object.entries(schemas)) {
            const result = schema.safeParse(req[source]);

            if (!result.success) {
                return res.status(400).json({
                    error: 'Validation failed.',
                    errors: validationErrors(source, result.error),
                });
            }

            if (source === 'body') {
                req.validated = result.data;
                req.body = result.data;
            } else if (source === 'params') {
                req.validatedParams = result.data;
                Object.assign(req.params, result.data);
            } else if (source === 'query') {
                req.validatedQuery = result.data;
            }
        }

        next();
    };
}

export function validate(schema) {
    return validateRequest({ body: schema });
}

const idSchema = z.string().trim().min(1, 'ID is required.').max(200, 'ID is too long.');
const paginationFields = {
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).max(100_000).optional(),
};
const continuationSchema = z.string().trim().max(1000).refine(value => (
    value === '' || (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\'))
), 'Continuation must be a same-site relative path.').optional();

export const emptyQuerySchema = z.object({}).strict();
export const clubParamsSchema = z.object({ clubId: idSchema }).strict();
export const clubPlayerParamsSchema = z.object({ clubId: idSchema, playerId: idSchema }).strict();
export const clubMatchParamsSchema = z.object({ clubId: idSchema, matchId: idSchema }).strict();
export const clubTournamentParamsSchema = z.object({ clubId: idSchema, tournamentId: idSchema }).strict();
export const clubTournamentPlayerParamsSchema = z.object({
    clubId: idSchema,
    tournamentId: idSchema,
    playerId: idSchema,
}).strict();
export const clubTournamentPairingParamsSchema = z.object({
    clubId: idSchema,
    tournamentId: idSchema,
    pairingId: idSchema,
}).strict();
export const clubLinkParamsSchema = z.object({ clubId: idSchema, linkId: idSchema }).strict();
export const clubJoinRequestParamsSchema = z.object({ clubId: idSchema, requestId: idSchema }).strict();
export const clubInviteParamsSchema = z.object({ clubId: idSchema, inviteId: idSchema }).strict();
export const clubMemberParamsSchema = z.object({ clubId: idSchema, userId: idSchema }).strict();
export const clubHeadToHeadParamsSchema = z.object({
    clubId: idSchema,
    playerAId: idSchema,
    playerBId: idSchema,
}).strict();

export const publicClubListQuerySchema = z.object({
    q: z.string().trim().max(100).optional(),
    ...paginationFields,
}).strict();
export const paginationQuerySchema = z.object(paginationFields).strict();
export const playerListQuerySchema = z.object({
    q: z.string().trim().max(100).optional(),
    ...paginationFields,
}).strict();
export const leaderboardQuerySchema = z.object({
    category: z.enum(['blitz', 'rapid', 'classical']).optional(),
    q: z.string().trim().max(100).optional(),
    ...paginationFields,
}).strict();
export const dashboardQuerySchema = z.object({
    category: z.enum(['blitz', 'rapid', 'classical']).optional(),
}).strict();
export const ratingHistoryQuerySchema = z.object({
    category: z.enum(['blitz', 'rapid', 'classical']).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
}).strict();
export const matchListQuerySchema = z.object({
    q: z.string().trim().max(100).optional(),
    ratingCategory: z.enum(['blitz', 'rapid', 'classical']).optional(),
    isRated: z.enum(['true', 'false']).transform(value => value === 'true').optional(),
    status: z.enum(['active', 'voided']).optional(),
    tournamentId: idSchema.optional(),
    playerId: idSchema.optional(),
    playedFrom: z.string().datetime({ offset: true }).optional(),
    playedTo: z.string().datetime({ offset: true }).optional(),
    sortBy: z.enum(['playedAt', 'createdAt']).optional(),
    sortDirection: z.enum(['asc', 'desc']).optional(),
    ...paginationFields,
}).strict().refine(value => (
    !value.playedFrom || !value.playedTo
    || new Date(value.playedFrom).valueOf() <= new Date(value.playedTo).valueOf()
), {
    message: 'playedFrom must not be after playedTo.',
    path: ['playedFrom'],
});
export const tournamentListQuerySchema = z.object({
    status: z.enum(['upcoming', 'active', 'completed']).optional(),
    q: z.string().trim().max(100).optional(),
    ...paginationFields,
}).strict();

// ── Schemas ───────────────────────────────────────────────────────────────────

export const registerSchema = z.object({
    email: z.string().trim().email('Invalid email address.').max(320),
    username: z.string().trim().regex(/^[A-Za-z0-9_]{3,30}$/, 'Username must be 3-30 letters, numbers, or underscores.').optional(),
    fullName: z.string().trim().min(1).max(100).optional(),
    name: z.string().trim().min(1, 'Name is required.').max(100).optional(),
    password: z.string().min(8, 'Password must be at least 8 characters.').max(200),
    continuation: continuationSchema,
}).strict().superRefine((value, context) => {
    if (!value.fullName && !value.name) context.addIssue({ code: 'custom', path: ['fullName'], message: 'Full name is required.' });
}).transform(value => ({
    email: value.email,
    username: value.username,
    fullName: value.fullName || value.name,
    password: value.password,
    continuation: value.continuation || '',
}));

export const loginSchema = z.object({
    email: z.string().trim().email('Invalid email address.').max(320),
    password: z.string().min(1, 'Password is required.').max(200),
}).strict();

export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, 'Current password is required.'),
    newPassword:     z.string().min(8, 'New password must be at least 8 characters.'),
}).strict();

const nullableProfileText = (max) => z.string().trim().max(max).nullable();
const nullableDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must use YYYY-MM-DD.').nullable();
const startRatingValue = z.number().int().min(100).max(4000);
const startRatingsSchema = z.object({
    blitz: startRatingValue.optional(),
    rapid: startRatingValue.optional(),
    classical: startRatingValue.optional(),
}).strict();

const disallowLegacyAndCategoryRatings = (data, context) => {
    if (data.rating !== undefined && data.startRatings !== undefined) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Provide either rating or startRatings, not both.',
            path: ['startRatings'],
        });
    }
};

export const createPlayerSchema = z.object({
    name:   z.string().trim().min(1, 'Player name is required.').max(100),
    rating: startRatingValue.optional(),
    startRatings: startRatingsSchema.optional(),
    bio:    nullableProfileText(500).optional(),
    dateOfBirth: nullableDate.optional(),
    federationId: nullableProfileText(100).optional(),
}).strict().superRefine(disallowLegacyAndCategoryRatings);

export const createPlayersBulkSchema = z.object({
    players: z.array(z.object({
        name: z.string().trim().min(1, 'Player name is required.').max(100),
        rating: startRatingValue.optional(),
        startRatings: startRatingsSchema.optional(),
        bio: nullableProfileText(500).optional(),
    }).strict().superRefine(disallowLegacyAndCategoryRatings)).min(1, 'At least one player is required.').max(250),
}).strict();

const chessUsername = z.string().trim().min(2).max(40).regex(/^[a-zA-Z0-9_-]+$/, 'Use the account username, not a URL.').nullable().optional();

export const updatePlayerAdminSchema = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    bio: nullableProfileText(500).optional(),
    dateOfBirth: nullableDate.optional(),
    federationId: nullableProfileText(100).optional(),
    nameLocked: z.boolean().optional(),
    chesscomUsername: chessUsername,
    lichessUsername: chessUsername,
}).strict().refine(data => Object.keys(data).length > 0, { message: 'At least one field must be provided.' });

export const updatePlayerSelfSchema = z.object({
    bio: nullableProfileText(500).optional(),
    name: z.string().trim().min(1).max(100).optional(),
    federationId: nullableProfileText(100).optional(),
    chesscomUsername: chessUsername,
    lichessUsername: chessUsername,
}).strict().refine(data => Object.keys(data).length > 0, { message: 'At least one field must be provided.' });

// Transitional alias for callers that have not moved to the explicit admin route yet.
export const updatePlayerSchema = updatePlayerAdminSchema;

export const playerLinkDecisionSchema = z.object({
    reason: z.string().trim().max(500).nullable().optional(),
}).strict();

export const playerUnlinkSchema = z.object({
    reason: z.string().trim().max(500).nullable().optional(),
}).strict();

export const createMatchSchema = z.object({
    // IDs in this project are TEXT-based (prefixed strings) — accept non-empty strings instead of strict UUIDs
    whitePlayerId: idSchema,
    blackPlayerId: idSchema,
    result:        z.enum(['white', 'black', 'draw'], {
        errorMap: () => ({ message: "Result must be 'white', 'black', or 'draw'." }),
    }),
    ratingCategory: z.enum(['blitz', 'rapid', 'classical']),
    playedAt: z.string().datetime({ offset: true }),
    isRated: z.boolean(),
    tournamentId: idSchema.optional().nullable(),
    notes: z.string().trim().max(1000).optional().nullable(),
    confirmDuplicate: z.boolean().optional().default(false),
}).strict();

export const updateMatchSchema = z.object({
    whitePlayerId: idSchema.optional(),
    blackPlayerId: idSchema.optional(),
    result: z.enum(['white', 'black', 'draw']).optional(),
    ratingCategory: z.enum(['blitz', 'rapid', 'classical']).optional(),
    playedAt: z.string().datetime({ offset: true }).optional(),
    isRated: z.boolean().optional(),
    tournamentId: idSchema.optional().nullable(),
    notes: z.string().trim().max(1000).optional().nullable(),
    reason: z.string().trim().max(500).optional().nullable(),
    confirmDuplicate: z.boolean().optional().default(false),
}).strict().refine(data => [
    'whitePlayerId', 'blackPlayerId', 'result', 'ratingCategory', 'playedAt',
    'isRated', 'tournamentId', 'notes',
].some(field => Object.hasOwn(data, field)), {
    message: 'At least one field must be provided.',
});

export const verificationTokenSchema = z.object({
    token: z.string().trim().min(32).max(500),
}).strict();
export const resendVerificationSchema = z.object({
    email: z.string().trim().email().max(320),
    continuation: continuationSchema,
}).strict();
export const passwordResetRequestSchema = resendVerificationSchema;
export const passwordResetCompleteSchema = z.object({
    token: z.string().trim().min(32).max(500),
    password: z.string().min(8).max(200),
}).strict();
export const deleteAccountSchema = z.object({
    confirmation: z.literal('DELETE'),
    currentPassword: z.string().max(200).optional(),
    reason: z.string().trim().max(500).optional().nullable(),
}).strict();
export const oauthStartQuerySchema = z.object({
    continuation: continuationSchema,
}).strict();
export const oauthCallbackQuerySchema = z.object({
    code: z.string().trim().min(1).max(4000).optional(),
    state: z.string().trim().min(1).max(500).optional(),
    error: z.string().trim().max(500).optional(),
// Google adds informational callback fields such as iss, scope, authuser, and
// prompt. Strip them while validating only the fields that drive our flow.
}).strip().refine(value => value.error || (value.code && value.state), {
    message: 'OAuth callback requires code and state.',
});

export const voidMatchSchema = z.object({
    reason: z.string().trim().min(1, 'A void reason is required.').max(500),
}).strict();

export const deleteMatchSchema = z.object({
    reason: z.string().trim().max(500).optional().nullable(),
}).strict();

export const createTournamentSchema = z.object({
    name:      z.string().trim().min(1, 'Tournament name is required.').max(150),
    type:      z.enum(['round_robin', 'swiss'], {
        errorMap: () => ({ message: "Type must be 'round_robin' or 'swiss'." }),
    }),
    startDate: z.string().datetime({ message: 'startDate must be a valid ISO datetime.' }),
    endDate:   z.string().datetime().optional().nullable(),
    ratingCategory: z.enum(['blitz', 'rapid', 'classical']).default('rapid'),
    isRated: z.boolean().default(true),
}).strict();

export const updateTournamentSchema = z.object({
    name:      z.string().trim().min(1).max(150).optional(),
    startDate: z.string().datetime().optional(),
    endDate:   z.string().datetime().optional().nullable(),
}).strict().refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
});

export const setTournamentStatusSchema = z.object({
    status: z.enum(['upcoming', 'active', 'completed'], {
        errorMap: () => ({ message: "Status must be 'upcoming', 'active', or 'completed'." }),
    }),
}).strict();

const ratingCategorySettingsSchema = z.object({
    initialRating: z.number().int().min(100).max(4000),
    ratingFloor: z.number().int().min(0).max(4000),
    establishedKFactor: z.number().int().min(1).max(100),
    provisionalKFactor: z.number().int().min(1).max(100),
    provisionalGames: z.number().int().min(1).max(100),
}).strict().refine(value => value.ratingFloor <= value.initialRating, {
    message: 'Rating floor cannot exceed the initial rating.',
    path: ['ratingFloor'],
});

export const clubRatingSettingsSchema = z.object({
    blitz: ratingCategorySettingsSchema.optional(),
    rapid: ratingCategorySettingsSchema.optional(),
    classical: ratingCategorySettingsSchema.optional(),
}).strict().refine(value => Object.keys(value).length > 0, {
    message: 'At least one rating category must be provided.',
});

const clubWebsiteSchema = z.string()
    .trim()
    .max(500, 'Website must be 500 characters or fewer.')
    .url('Enter a valid website address.')
    .refine(value => /^https?:\/\//i.test(value), 'Website must begin with http:// or https://.');

export const clubStructuredSettingsSchema = z.object({
    contacts: z.object({
        website: clubWebsiteSchema.optional().nullable(),
        email: z.string().trim().email('Enter a valid email address.').max(320, 'Email must be 320 characters or fewer.').optional().nullable(),
        phone: z.string().trim().max(50, 'Phone must be 50 characters or fewer.').optional().nullable(),
        address: z.string().trim().max(500, 'Address must be 500 characters or fewer.').optional().nullable(),
    }).strict().optional(),
    affiliation: z.string().trim().max(200, 'Affiliation must be 200 characters or fewer.').optional().nullable(),
    presentation: z.object({
        primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
        locale: z.string().trim().min(2).max(20).optional(),
    }).strict().optional(),
    notifications: z.object({
        emailEnabled: z.boolean().optional(),
        membershipEvents: z.boolean().optional(),
        playerClaimEvents: z.boolean().optional(),
        matchEvents: z.boolean().optional(),
        announcementEvents: z.boolean().optional(),
        tournamentEvents: z.boolean().optional(),
    }).strict().optional(),
}).strict();

export const updateClubSchema = z.object({
    name:        z.string().trim().min(1, 'Club name is required.').max(150, 'Club name must be 150 characters or fewer.').optional(),
    federation:  z.string().trim().min(1, 'Federation is required.').max(5, 'Federation must be 5 characters or fewer.').optional(),
    description: z.string().trim().max(1000, 'Description must be 1,000 characters or fewer.').optional().nullable(),
    contactInfo: z.string().trim().max(500, 'Contact information must be 500 characters or fewer.').optional().nullable(),
    visibility: z.enum(['public', 'private']).optional(),
    publicLeaderboard: z.boolean().optional(),
    settings: clubStructuredSettingsSchema.optional(),
    ratingSettings: clubRatingSettingsSchema.optional(),
}).strict().refine(value => Object.keys(value).length > 0, {
    message: 'At least one club setting must be provided.',
});

export const updateClubPresentationSchema = z.object({
    federation: z.string().trim().min(1, 'Federation is required.').max(5, 'Federation must be 5 characters or fewer.').optional(),
    description: z.string().trim().max(1000, 'Description must be 1,000 characters or fewer.').optional().nullable(),
    contactInfo: z.string().trim().max(500, 'Contact information must be 500 characters or fewer.').optional().nullable(),
    settings: z.object({
        contacts: clubStructuredSettingsSchema.shape.contacts,
        affiliation: clubStructuredSettingsSchema.shape.affiliation,
        presentation: clubStructuredSettingsSchema.shape.presentation,
    }).strict().optional(),
}).strict().refine(value => Object.keys(value).length > 0, {
    message: 'At least one public presentation field must be provided.',
});

export const createClubSchema = z.object({
    name:        z.string().trim().min(1, 'Club name is required.').max(150, 'Club name must be 150 characters or fewer.'),
    federation:  z.string().trim().min(1, 'Federation is required.').max(5, 'Federation must be 5 characters or fewer.'),
    description: z.string().trim().max(1000, 'Description must be 1,000 characters or fewer.').optional().nullable(),
    contactInfo: z.string().trim().max(500, 'Contact information must be 500 characters or fewer.').optional().nullable(),
    // Previously accepted by the frontend (CreateClub.jsx) but silently
    // dropped here — every club ended up private regardless of what the
    // user picked. Now validated and passed through to ClubModel.create().
    is_public:   z.boolean().optional(),
    visibility: z.enum(['public', 'private']).optional(),
    publicLeaderboard: z.boolean().optional(),
    settings: clubStructuredSettingsSchema.optional(),
    ratingSettings: clubRatingSettingsSchema.optional(),
}).strict();

export const transferClubOwnershipSchema = z.object({
    newOwnerUserId: idSchema,
    previousOwnerRole: z.enum(['admin', 'member']),
}).strict();

export const clubLifecycleSchema = z.object({
    reason: z.string().trim().min(1).max(500).optional(),
}).strict().default({});

export const requestJoinClubSchema = z.object({
    message: z.string().trim().max(500).optional(),
}).strict();

export const joinByTokenSchema = z.object({
    token: z.string().trim().min(1, 'Token is required.').max(200),
}).strict();

export const joinByCodeSchema = z.object({
    code: z.string().regex(/^\d{6}$/, 'Join code must contain exactly six digits.'),
}).strict();

export const membershipReasonSchema = z.object({
    reason: z.string().trim().min(1).max(500).optional(),
}).strict().default({});

export const emptyBodySchema = z.object({}).strict().default({});

export const createInviteSchema = z.object({
    expiresAt: z.string().datetime('Invite expiration must be a valid ISO datetime.').optional(),
}).strict();

export const addTournamentPlayerSchema = z.object({
    // Accept project-specific TEXT IDs (not strictly UUIDs)
    playerId: z.string().min(1, 'Invalid player ID.'),
}).strict();

export const recordTournamentResultSchema = z.object({
    result: z.enum(['white', 'black', 'draw']),
    playedAt: z.string().datetime({ message: 'playedAt must be a valid ISO datetime.' }),
    notes: z.string().trim().max(1000).optional().nullable(),
    confirmDuplicate: z.boolean().optional(),
}).strict();

export const tournamentReasonSchema = z.object({
    reason: z.string().trim().max(500).optional().nullable(),
}).strict().default({});

export const tournamentSetupSchema = z.object({
    playerIds: z.array(z.string().trim().min(1)).max(250),
    allActivePlayers: z.boolean().optional(),
    start: z.boolean().default(false),
}).strict();

// Old clients used DELETE for archive/retention. Require the new explicit contract.
export const permanentDeletionSchema = z.object({
    permanent: z.literal(true),
    reason: z.string().trim().max(500).optional().nullable(),
}).strict();

// Promotes/demotes a club member between 'member' and 'admin'.
// Used by the (new) PATCH /clubs/:clubId/members/:userId/role route.
export const setMemberRoleSchema = z.object({
    role: z.enum(['admin', 'member'], {
        errorMap: () => ({ message: "Role must be 'admin' or 'member'." }),
    }),
});
