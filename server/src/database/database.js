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

const db = {
    init: async () => {
        await pgDb.initPg();
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