import pgDb from './pg_database.js';
import { runner } from 'node-pg-migrate';
import path from 'path';
import { fileURLToPath } from 'url';
import env from '../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { DATABASE_URL } = env;

// ─── JSON field normalisation ──────────────────────────────────────────────────
// Add any future JSON columns here — one place to maintain.
const JSON_FIELDS = new Set(['settings_json', 'data_json']);

// pg returns jsonb columns as parsed objects, but text-typed JSON columns come
// back as strings. This normalises both to parsed objects.
function mapJsonFields(row) {
    if (!row) return row;
    const processed = {};
    for (const [key, value] of Object.entries(row)) {
        if (JSON_FIELDS.has(key) && typeof value === 'string') {
            try {
                processed[key] = JSON.parse(value);
            } catch {
                processed[key] = value; // leave malformed JSON as-is
            }
        } else {
            processed[key] = value;
        }
    }
    return processed;
}

// ─── Normalised result shape ───────────────────────────────────────────────────
function normaliseRows(rows, rowCount) {
    const mapped = rows.map(mapJsonFields);
    return {
        rows: mapped,
        rowCount: rowCount ?? mapped.length,
        first: mapped[0] ?? null,
    };
}

async function executeQuery(queryFn, text, params = []) {
    const res = await queryFn(text, params);
    return normaliseRows(res.rows, res.rowCount);
}

// ─── db ───────────────────────────────────────────────────────────────────────

const db = {
    init: async () => {
        // Validate connection first
        await pgDb.initPg();

        // Run migrations
        try {
            const migrationsRan = await runner({
                databaseUrl: DATABASE_URL,
                dir: path.join(__dirname, 'migrations'),
                migrationsTable: 'pgmigrations',
            });

            if (migrationsRan.length > 0) {
                console.log(`[DB] Applied ${migrationsRan.length} migration(s): ${migrationsRan.join(', ')}`);
            } else {
                console.log('[DB] Migrations up to date.');
            }

            console.log('[DB] Schema initialised successfully.');
        } catch (err) {
            console.error('[DB] Migration failed:', err.message);
            throw err;
        }
    },

    query: async (text, params = []) => {
        return executeQuery(pgDb.query.bind(pgDb), text, params);
    },

    // transaction() runs a callback with a transactional query function.
    // The callback receives { query } and should return the final result.
    transaction: async (cb) => {
        const client = await pgDb.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await cb({
                query: (text, params = []) => executeQuery(client.query.bind(client), text, params),
            });
            await client.query('COMMIT');
            return result;
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    },
};

export default db;