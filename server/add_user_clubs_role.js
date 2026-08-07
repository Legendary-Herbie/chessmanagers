import db from './src/database/database.js';

(async () => {
  try {
    console.log('[DB FIX] Adding role column to user_clubs if missing...');
    await db.query("ALTER TABLE user_clubs ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'member';");
    console.log('[DB FIX] Done.');
    process.exit(0);
  } catch (err) {
    console.error('[DB FIX][ERROR]', err);
    process.exit(1);
  }
})();
