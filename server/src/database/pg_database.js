import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { types } from 'pg';
import env from '../config/env.js';

const { Pool } = pg;
const { DATABASE_URL, NODE_ENV } = env;

// ─── Type parsers ─────────────────────────────────────────────────────────────
// Parse int8 and NUMERIC as JS numbers rather than strings.
types.setTypeParser(20,   v => v === null ? null : Number(v));   // int8
types.setTypeParser(1700, v => v === null ? null : Number(v));   // numeric
// Parse boolean as true/false rather than 't'/'f' strings.
types.setTypeParser(16,   v => v === null ? null : v === 't');   // bool

// ─── Connection pool ──────────────────────────────────────────────────────────

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 2_000,
});

// ─── Schema ───────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaSQL = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

// ─── Init ─────────────────────────────────────────────────────────────────────

export const initPg = async () => {
    if (!DATABASE_URL) {
        throw new Error('DATABASE_URL is not defined in environment variables.');
    }

    let client;
    try {
        client = await pool.connect();
        await client.query(schemaSQL);
        console.log('[DB] PostgreSQL initialised successfully.');
    } catch (err) {
        // Provide actionable error messages for the most common connection failures

        if (err.message?.includes('client password must be a string')) {
            console.error('\n\x1b[31m[FATAL] PostgreSQL: Missing password in DATABASE_URL\x1b[0m');
            console.error('Expected format: postgresql://USER:PASSWORD@HOST:5432/DBNAME\n');
            process.exit(1);
        }

        if (err.code === 'ECONNREFUSED') {
            console.error('\n\x1b[31m[FATAL] PostgreSQL: Connection refused\x1b[0m');
            console.error(`Could not reach PostgreSQL at ${err.address ?? 'localhost'}:${err.port ?? 5432}`);
            console.error('Is the PostgreSQL server running?\n');
            process.exit(1);
        }

        if (err.code === '3D000') {
            console.error('\n\x1b[31m[FATAL] PostgreSQL: Database does not exist\x1b[0m');
            console.error('Create it with: createdb chess_club_manager');
            console.error('Or update DATABASE_URL to point to an existing database.\n');
            process.exit(1);
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
