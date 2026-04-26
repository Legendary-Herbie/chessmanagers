import pgDb from './pg_database.js';

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

// ─── Postgres placeholder conversion ──────────────────────────────────────────
function toPostgresParams(text) {
    let i = 0;
    return text.replace(/\?/g, () => `$${++i}`);
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

// ─── db ───────────────────────────────────────────────────────────────────────

const db = {
    init: async () => {
        await pgDb.initPg();
    },

    query: async (text, params = []) => {
        const res = await pgDb.query(toPostgresParams(text), params);
        const isSelect = text.trim().toUpperCase().startsWith('SELECT');

        if (isSelect) {
            return normaliseRows(res.rows, res.rowCount);
        }
        return {
            rows: [],
            rowCount: res.rowCount,
            first: null,
        };
    },

    // transaction() runs a callback with a transactional query function.
    // The callback receives { query } and should return the final result.
    transaction: async (cb) => {
        const client = await pgDb.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await cb({
                query: async (text, params = []) => {
                    const res = await client.query(toPostgresParams(text), params);
                    const isSelect = text.trim().toUpperCase().startsWith('SELECT');

                    if (isSelect) {
                        return normaliseRows(res.rows, res.rowCount);
                    }
                    return {
                        rows: [],
                        rowCount: res.rowCount,
                        first: null,
                    };
                },
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