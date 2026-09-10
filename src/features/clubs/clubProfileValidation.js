import { z } from 'zod';

export const CLUB_BADGE_MAX_BYTES = 5 * 1024 * 1024;
export const CLUB_BADGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const optionalWebsite = z.string().trim().max(500, 'Website must be 500 characters or fewer.').refine(value => {
    if (!value) return true;
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}, 'Enter a complete website address beginning with http:// or https://.');

const optionalEmail = z.string().trim().max(320, 'Email must be 320 characters or fewer.').refine(
    value => !value || z.string().email().safeParse(value).success,
    'Enter a valid email address.',
);

const ratingCategorySchema = z.object({
    initialRating: z.number().int('Initial rating must be a whole number.').min(100).max(4000),
    ratingFloor: z.number().int('Rating floor must be a whole number.').min(0).max(4000),
    establishedKFactor: z.number().int('Established K-factor must be a whole number.').min(1).max(100),
    provisionalKFactor: z.number().int('Provisional K-factor must be a whole number.').min(1).max(100),
    provisionalGames: z.number().int('Provisional games must be a whole number.').min(1).max(100),
}).strict().refine(value => value.ratingFloor <= value.initialRating, {
    path: ['ratingFloor'],
    message: 'Rating floor cannot exceed the initial rating.',
});

const profileSchema = z.object({
    name: z.string().trim().min(1, 'Club name is required.').max(150, 'Club name must be 150 characters or fewer.'),
    federation: z.string().trim().min(1, 'Federation is required.').max(5, 'Federation must be 5 characters or fewer.'),
    description: z.string().trim().max(1000, 'Description must be 1,000 characters or fewer.'),
    contactInfo: z.string().trim().max(500, 'Contact information must be 500 characters or fewer.'),
    website: optionalWebsite,
    email: optionalEmail,
    phone: z.string().trim().max(50, 'Phone must be 50 characters or fewer.'),
    address: z.string().trim().max(500, 'Address must be 500 characters or fewer.'),
    affiliation: z.string().trim().max(200, 'Affiliation must be 200 characters or fewer.'),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Choose a valid presentation color.'),
    ratingSettings: z.object({
        blitz: ratingCategorySchema,
        rapid: ratingCategorySchema,
        classical: ratingCategorySchema,
    }).strict().optional(),
}).strict();

function inputFromProfile(profile, isOwner) {
    const contacts = profile?.settings_json?.contacts || {};
    return {
        name: String(profile?.name ?? ''),
        federation: String(profile?.federation ?? ''),
        description: String(profile?.description ?? ''),
        contactInfo: String(profile?.contact_info ?? ''),
        website: String(contacts.website ?? ''),
        email: String(contacts.email ?? ''),
        phone: String(contacts.phone ?? ''),
        address: String(contacts.address ?? ''),
        affiliation: String(profile?.settings_json?.affiliation ?? ''),
        primaryColor: String(profile?.settings_json?.presentation?.primaryColor ?? '#2563eb'),
        ratingSettings: isOwner ? profile?.rating_settings : undefined,
    };
}

function issuesToErrors(issues) {
    return issues.reduce((errors, issue) => {
        const field = issue.path.join('.') || '_form';
        if (!errors[field]) errors[field] = issue.message;
        return errors;
    }, {});
}

function validateBadge(badgeFile) {
    if (!badgeFile) return null;
    if (!CLUB_BADGE_TYPES.includes(badgeFile.type)) {
        return 'Use a JPEG, PNG, or WebP image.';
    }
    if (!Number.isFinite(badgeFile.size) || badgeFile.size <= 0) {
        return 'Choose a non-empty image file.';
    }
    if (badgeFile.size > CLUB_BADGE_MAX_BYTES) {
        return 'Image must be 5 MB or smaller.';
    }
    return null;
}

export function validateClubProfile(profile, { isOwner = false, badgeFile = null } = {}) {
    const parsed = profileSchema.safeParse(inputFromProfile(profile, isOwner));
    const errors = parsed.success ? {} : issuesToErrors(parsed.error.issues);
    const badgeError = validateBadge(badgeFile);
    if (badgeError) errors.badgeFile = badgeError;

    if (Object.keys(errors).length > 0) return { success: false, errors, data: null };

    const values = parsed.data;
    return {
        success: true,
        errors: {},
        data: {
            name: values.name,
            federation: values.federation,
            description: values.description || null,
            contactInfo: values.contactInfo || null,
            contacts: {
                website: values.website || null,
                email: values.email || null,
                phone: values.phone || null,
                address: values.address || null,
            },
            affiliation: values.affiliation || null,
            primaryColor: values.primaryColor,
            ratingSettings: values.ratingSettings,
        },
    };
}

export function validateClubRatingSettings(settings) {
    const parsed = profileSchema.shape.ratingSettings.unwrap().safeParse(settings);
    return parsed.success ? { success: true, data: parsed.data, errors: {} }
        : { success: false, data: null, errors: issuesToErrors(parsed.error.issues.map(issue => ({ ...issue, path: ['ratingSettings', ...issue.path] }))) };
}

const API_FIELD_ALIASES = {
    contactInfo: 'contactInfo',
    'settings.contacts.website': 'website',
    'settings.contacts.email': 'email',
    'settings.contacts.phone': 'phone',
    'settings.contacts.address': 'address',
    'settings.affiliation': 'affiliation',
    'settings.presentation.primaryColor': 'primaryColor',
};

export function mapClubProfileApiErrors(apiErrors = []) {
    return apiErrors.reduce((errors, issue) => {
        const field = API_FIELD_ALIASES[issue.field] || issue.field || '_form';
        if (!errors[field]) errors[field] = issue.message;
        return errors;
    }, {});
}
