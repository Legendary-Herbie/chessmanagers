import { z } from 'zod';



export function validate(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.body);

        if (!result.success) {
            const errors = result.error.errors.map(e => ({
                field:   e.path.join('.'),
                message: e.message,
            }));
            return res.status(400).json({ error: 'Validation failed.', errors });
        }

        req.validated = result.data;
        next();
    };
}

// ── Schemas ───────────────────────────────────────────────────────────────────

export const registerSchema = z.object({
    email:    z.string().email('Invalid email address.'),
    password: z.string().min(8, 'Password must be at least 8 characters.'),
});

export const loginSchema = z.object({
    email:    z.string().email('Invalid email address.'),
    password: z.string().min(1, 'Password is required.'),
});

export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, 'Current password is required.'),
    newPassword:     z.string().min(8, 'New password must be at least 8 characters.'),
});

export const createPlayerSchema = z.object({
    name:   z.string().min(1, 'Player name is required.').max(100),
    rating: z.number().int().min(100).max(3000).optional(),
    bio:    z.string().max(500).optional(),
});

export const updatePlayerSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    bio:  z.string().max(500).optional(),
}).refine(data => data.name || data.bio, {
    message: 'At least one field (name or bio) must be provided.',
});

export const createMatchSchema = z.object({
    // IDs in this project are TEXT-based (prefixed strings) — accept non-empty strings instead of strict UUIDs
    whitePlayerId: z.string().min(1, 'Invalid white player ID.'),
    blackPlayerId: z.string().min(1, 'Invalid black player ID.'),
    result:        z.enum(['white', 'black', 'draw'], {
        errorMap: () => ({ message: "Result must be 'white', 'black', or 'draw'." }),
    }),
    type:         z.enum(['casual', 'rated', 'tournament']).optional(),
    tournamentId: z.string().min(1).optional().nullable(),
    notes:        z.string().max(1000).optional(),
});

export const updateMatchSchema = z.object({
    result: z.enum(['white', 'black', 'draw']).optional(),
    notes:  z.string().max(1000).optional(),
}).refine(data => data.result || data.notes !== undefined, {
    message: 'At least one field must be provided.',
});

export const createTournamentSchema = z.object({
    name:      z.string().min(1, 'Tournament name is required.').max(150),
    type:      z.enum(['round_robin', 'knockout'], {
        errorMap: () => ({ message: "Type must be 'round_robin' or 'knockout'." }),
    }),
    startDate: z.string().datetime({ message: 'startDate must be a valid ISO datetime.' }),
    endDate:   z.string().datetime().optional().nullable(),
});

export const updateTournamentSchema = z.object({
    name:      z.string().min(1).max(150).optional(),
    startDate: z.string().datetime().optional(),
    endDate:   z.string().datetime().optional().nullable(),
});

export const setTournamentStatusSchema = z.object({
    status: z.enum(['upcoming', 'active', 'completed'], {
        errorMap: () => ({ message: "Status must be 'upcoming', 'active', or 'completed'." }),
    }),
});

export const updateClubSchema = z.object({
    name:        z.string().min(1).max(150).optional(),
    description: z.string().max(1000).optional(),
    logo:        z.string().url('Logo must be a valid URL.').optional().nullable(),
    contactInfo: z.string().max(500).optional().nullable(),
});

export const createClubSchema = z.object({
    name:        z.string().min(1).max(150),
    federation:  z.string().min(1).max(100),
    logo:        z.string().url('Logo must be a valid URL.').optional().nullable(),
    description: z.string().max(1000).optional().nullable(),
    contactInfo: z.string().max(500).optional().nullable(),
});

export const addTournamentPlayerSchema = z.object({
    // Accept project-specific TEXT IDs (not strictly UUIDs)
    playerId: z.string().min(1, 'Invalid player ID.'),
});

export const unlinkPlayerSchema = z.object({
    userId: z.string().min(1, 'Invalid user ID.'),
});