import { createPlayersBulkSchema, createPlayerSchema, RATING_CATEGORIES as categories } from '../../../../server/shared/validation.js';

function cells(line) {
    const values = [];
    let value = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (quoted && line[i + 1] === '"') { value += '"'; i++; }
            else quoted = !quoted;
        } else if (char === ',' && !quoted) { values.push(value.trim()); value = ''; }
        else value += char;
    }
    if (quoted) throw new Error('Close the quotation marks.');
    return [...values, value.trim()];
}

export function readStartRatings(values, settings = {}) {
    const ratings = {};
    for (const category of categories) {
        const raw = String(values[category] ?? '').trim();
        if (!raw) continue;
        const value = Number(raw);
        const floor = settings[category]?.ratingFloor ?? 100;
        if (!/^\d+$/.test(raw) || !Number.isInteger(value) || value < floor || value > 4000) {
            throw new Error(`${category[0].toUpperCase() + category.slice(1)} rating must be a whole number from ${floor} to 4000.`);
        }
        ratings[category] = value;
    }
    return ratings;
}

export function parseBulkPlayers(text, { sharedRatings = null, settings = {} } = {}) {
    const players = [];
    const errors = [];
    text.split(/\r?\n/).forEach((line, index) => {
        if (!line.trim()) return;
        try {
            const parts = cells(line);
            const name = parts[0];
            const values = parts.length >= 4
                ? Object.fromEntries(categories.map((category, i) => [category, parts[i + 1]]))
                : Object.fromEntries(categories.map(category => [category, parts[1] ?? '']));
            const startRatings = readStartRatings(sharedRatings ?? values, settings);
            const bio = (parts.length >= 4 ? parts.slice(4) : parts.slice(2)).join(',').trim();
            const player = createPlayerSchema.safeParse({ name, ...(Object.keys(startRatings).length ? { startRatings } : {}), ...(bio ? { bio } : {}) });
            if (!player.success) throw new Error(player.error.issues[0].message);
            players.push(player.data);
        } catch (error) { errors.push(`Line ${index + 1}: ${error.message}`); }
    });
    if (players.length > 250) errors.push('Add up to 250 players at a time.');
    const validation = createPlayersBulkSchema.safeParse({ players });
    if (players.length && !validation.success) {
        for (const issue of validation.error.issues) errors.push(issue.message);
    }
    return { players: validation.success ? validation.data.players : players, errors };
}
