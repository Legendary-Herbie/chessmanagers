import { it, expect } from 'vitest';
import db from '../database/database.js';
import { up, down } from '../database/migrations/1700000000018_canonical_match_fields.js';
import { createUser, createClub, createPlayer, createMatch } from '../test/factories.js';

it('round-trips legacy fields without losing matches and refuses conflicting category values', async () => {
    const club = await createClub(await createUser());
    const white = await createPlayer(club);
    const black = await createPlayer(club);
    const match = await createMatch(club, white, black, { timeControl: 'rapid' });
    await db.transaction(async trx => {
        await down({ sql: text => trx.query(text) });
        const restored = (await trx.query('SELECT time_control, type FROM matches WHERE id = $1', [match.id])).first;
        expect(restored).toEqual({ time_control: 'rapid', type: 'rated' });
        await trx.query('SAVEPOINT inconsistent_legacy');
        await trx.query("UPDATE matches SET time_control = 'blitz' WHERE id = $1", [match.id]);
        await expect(up({ sql: text => trx.query(text) })).rejects.toThrow('Legacy match fields disagree');
        await trx.query('ROLLBACK TO SAVEPOINT inconsistent_legacy');
        await up({ sql: text => trx.query(text) });
        const after = (await trx.query('SELECT * FROM matches WHERE id = $1', [match.id])).first;
        // Restoring compatibility columns is an UPDATE, so the normal timestamp trigger fires.
        expect(after.updated_at.getTime()).toBeGreaterThanOrEqual(match.updated_at.getTime());
        expect({ ...after, updated_at: match.updated_at }).toEqual(match);
        const columns = await trx.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='matches' AND column_name IN ('type','time_control')");
        expect(columns.rows).toHaveLength(0);
    });
});
