import pg from 'pg';
import { types } from 'pg';
import env from '../config/env.js';

const { Pool } = pg;
const { DATABASE_URL, NODE_ENV } = env;

// ─── Type parsers ─────────────────────────────────────────────────────────────
// Parse int8 and NUMERIC as JS numbers rather than strings.
types.setTypeParser(20,   v => v === null ? null : Number(v));   // int8
types.setTypeParser(1700, v => v === null ? null : Number(v));   // numeric
// pg already returns real Postgres booleans as JS true/false —
// this parser is kept as an explicit safeguard against driver version drift.
types.setTypeParser(16,   v => v === null ? null : v === true || v === 't');  // bool

// ─── Connection pool ──────────────────────────────────────────────────────────

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 2_000,
});

// ─── Init ─────────────────────────────────────────────────────────────────────
// Validates database connection. Schema migrations are run by database.js.

export const initPg = async () => {
    if (!DATABASE_URL) {
        throw new Error(
            'DATABASE_URL is not defined. ' +
            'Expected format: postgresql://USER:PASSWORD@HOST:5432/DBNAME'
        );
    }

    let client;
    try {
        client = await pool.connect();
        console.log('[DB] PostgreSQL connected successfully.');
    } catch (err) {
        // Enrich the error with an actionable message, then re-throw.
        // The caller (server bootstrap) decides whether to exit.
        if (err.message?.includes('client password must be a string')) {
            throw Object.assign(err, {
                friendlyMessage:
                    'PostgreSQL: Missing password in DATABASE_URL.\n' +
                    'Expected format: postgresql://USER:PASSWORD@HOST:5432/DBNAME',
            });
        }

        if (err.code === 'ECONNREFUSED') {
            throw Object.assign(err, {
                friendlyMessage:
                    `PostgreSQL: Connection refused at ` +
                    `${err.address ?? 'localhost'}:${err.port ?? 5432}.\n` +
                    'Is the PostgreSQL server running?',
            });
        }

        if (err.code === '3D000') {
            throw Object.assign(err, {
                friendlyMessage:
                    'PostgreSQL: Database does not exist.\n' +
                    'Create it with: createdb chessmanagers\n' +
                    'Or update DATABASE_URL to point to an existing database.',
            });
        }

        throw err;
    } finally {
        client?.release();
    }
};

// ─── Query ────────────────────────────────────────────────────────────────────

export const query = async (text, params) => {
    return pool.query(text, params);
};

// ─── Export ───────────────────────────────────────────────────────────────────

export default { query, pool, initPg };