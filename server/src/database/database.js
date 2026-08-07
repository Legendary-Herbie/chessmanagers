import pgDb from './pg_database.js';

// ─── Result normalisation ──────────────────────────────────────────────────────
// This function now only shapes the result into the { rows, rowCount, first }
// contract that all models depend on.
function normaliseRows(rows, rowCount) {
    return {
        rows,
        rowCount: rowCount ?? rows.length,
        first: rows[0] ?? null,
    };
}

// ─── Shared query executor ──────────────────────────────────────────────
async function execQuery(client, text, params = []) {
    const res = await client.query(text, params);
    return normaliseRows(res.rows, res.rowCount);
}

// ─── db ───────────────────────────────────────────────────────────────────────
import path from 'path';
import { fileURLToPath } from 'url';
import * as pgMigratePkg from 'node-pg-migrate';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const runner = pgMigratePkg.default || pgMigratePkg.runner || pgMigratePkg;

const db = {
    init: async () => {
        await pgDb.initPg();

        // If core tables already exist (e.g. users), skip running migrations — this
        // makes startup tolerant of environments that already have schema applied.
        const client = await pgDb.pool.connect();
        try {
            const res = await client.query("SELECT to_regclass('public.users') as users_table");
            if (res.rows && res.rows[0] && res.rows[0].users_table) {
                console.log('[DB] Schema already present; skipping migrations.');
                return;
            }
        } finally {
            client.release();
        }

        console.log('[DB] Running migrations...');
        await runner({
            dbClient: pgDb.pool,
            dir: path.join(__dirname, 'migrations'),
            direction: 'up',
            migrationsTable: 'pgmigrations',
            log: (msg) => console.log(`[Migrate] ${msg}`)
        });
        console.log('[DB] Migrations complete.');
    },

    query: async (text, params = []) => {
        return execQuery(pgDb, text, params);
    },

    transaction: async (cb) => {
        const client = await pgDb.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await cb({
                query: (text, params = []) => execQuery(client, text, params),
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