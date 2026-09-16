import { z } from 'zod';
import { createClubSchema, clubStructuredSettingsSchema, clubRatingSettingsSchema } from '../../../server/shared/validation.js';

export const CLUB_BADGE_MAX_BYTES = 5 * 1024 * 1024;
export const CLUB_BADGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const contacts = clubStructuredSettingsSchema.shape.contacts.unwrap().shape;
const blankAsNull = schema => z.preprocess(value => value === '' ? null : value, schema);
const profileSchema = z.object({
    name: createClubSchema.shape.name,
    federation: createClubSchema.shape.federation,
    description: createClubSchema.shape.description,
    contactInfo: createClubSchema.shape.contactInfo,
    website: blankAsNull(contacts.website),
    email: blankAsNull(contacts.email),
    phone: contacts.phone,
    address: contacts.address,
    affiliation: clubStructuredSettingsSchema.shape.affiliation,
    primaryColor: clubStructuredSettingsSchema.shape.presentation.unwrap().shape.primaryColor,
    ratingSettings: clubRatingSettingsSchema.optional(),
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
