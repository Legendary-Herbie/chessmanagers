import { stringify } from 'csv-stringify';
import {
    EXPORT_COLUMNS,
    exportMatches,
    exportPlayers,
    exportRatings,
} from '../services/DataExportService.js';

function safeFilenamePart(value) {
    return String(value || 'club').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'club';
}

function sendCsv(req, res, next, exportType, rows) {
    const date = new Date().toISOString().slice(0, 10);
    const filename = `${safeFilenamePart(req.club.slug || req.club.name)}-${exportType}-${date}.csv`;
    res.status(200);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');

    const csv = stringify({
        header: true,
        bom: true,
        columns: EXPORT_COLUMNS[exportType],
        record_delimiter: 'windows',
    });
    csv.on('error', error => {
        if (!res.headersSent) next(error);
        else res.destroy(error);
    });
    csv.pipe(res);
    for (const row of rows) csv.write(row);
    csv.end();
}

export async function exportPlayerRoster(req, res, next) {
    try {
        const rows = await exportPlayers(req.club.id, req.user.id, req.validatedQuery);
        sendCsv(req, res, next, 'players', rows);
    } catch (error) {
        next(error);
    }
}

export async function exportMatchHistory(req, res, next) {
    try {
        const rows = await exportMatches(req.club.id, req.user.id, req.validatedQuery);
        sendCsv(req, res, next, 'matches', rows);
    } catch (error) {
        next(error);
    }
}

export async function exportCurrentRatings(req, res, next) {
    try {
        const rows = await exportRatings(req.club.id, req.user.id, req.validatedQuery);
        sendCsv(req, res, next, 'ratings', rows);
    } catch (error) {
        next(error);
    }
}
