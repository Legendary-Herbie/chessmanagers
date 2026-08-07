import db from './src/database/database.js';

(async () => {
  try {
    console.log('[DB FIX] Creating club_invites table if missing...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS club_invites (
        id SERIAL PRIMARY KEY,
        club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        created_by TEXT REFERENCES users(id),
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
        expires_at TIMESTAMP WITHOUT TIME ZONE NULL,
        revoked BOOLEAN DEFAULT FALSE
      );
    `);
    console.log('[DB FIX] Done.');
    process.exit(0);
  } catch (err) {
    console.error('[DB FIX][ERROR]', err);
    process.exit(1);
  }
})();
