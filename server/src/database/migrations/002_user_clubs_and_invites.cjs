/* Add role to user_clubs, unique constraint, and create club_invites table if missing
   CommonJS migration for node-pg-migrate in an ES module project
*/

module.exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE IF EXISTS user_clubs
      ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'member',
      ADD COLUMN IF NOT EXISTS joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'i' AND c.relname = 'user_clubs_club_id_user_id_idx'
      ) THEN
        CREATE UNIQUE INDEX user_clubs_club_id_user_id_idx ON user_clubs (club_id, user_id);
      END IF;
    END$$;
  `);

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS club_invites (
      id SERIAL PRIMARY KEY,
      club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      expires_at TIMESTAMP WITH TIME ZONE,
      revoked BOOLEAN DEFAULT false
    );
  `);
};

module.exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS club_invites;
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_class c WHERE c.relname = 'user_clubs_club_id_user_id_idx') THEN
        DROP INDEX user_clubs_club_id_user_id_idx;
      END IF;
    END$$;
    ALTER TABLE IF EXISTS user_clubs DROP COLUMN IF EXISTS role;
    ALTER TABLE IF EXISTS user_clubs DROP COLUMN IF EXISTS joined_at;
  `);
};
