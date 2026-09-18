export async function up(pgm) {
    pgm.sql(`ALTER TABLE players
        ADD COLUMN name_locked BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN chesscom_username TEXT,
        ADD COLUMN lichess_username TEXT;
        CREATE TABLE announcement_views (
            announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
            viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (announcement_id, user_id)
        );
        CREATE INDEX announcement_views_club ON announcement_views (club_id);`);
}

export async function down(pgm) {
    pgm.dropTable('announcement_views');
    pgm.dropColumns('players', ['name_locked', 'chesscom_username', 'lichess_username']);
}
