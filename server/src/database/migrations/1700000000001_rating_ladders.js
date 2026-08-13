export async function up(pgm) {
    pgm.sql(`
        ALTER TABLE players
            ADD COLUMN IF NOT EXISTS blitz_rating INTEGER NOT NULL DEFAULT 1200,
            ADD COLUMN IF NOT EXISTS rapid_rating INTEGER NOT NULL DEFAULT 1200,
            ADD COLUMN IF NOT EXISTS classical_rating INTEGER NOT NULL DEFAULT 1200;

        ALTER TABLE matches
            ADD COLUMN IF NOT EXISTS time_control TEXT NOT NULL DEFAULT 'blitz';

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'chk_matches_time_control'
            ) THEN
                ALTER TABLE matches ADD CONSTRAINT chk_matches_time_control
                    CHECK (time_control IN ('blitz', 'rapid', 'classical'));
            END IF;
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'club_join_requests_club_id_user_id_key'
            ) THEN
                ALTER TABLE club_join_requests
                    ADD CONSTRAINT club_join_requests_club_id_user_id_key UNIQUE (club_id, user_id);
            END IF;
        END $$;

        ALTER TABLE club_invites ALTER COLUMN created_by DROP NOT NULL;
    `);
}

export async function down() {
    throw new Error('This data-preserving migration is intentionally irreversible.');
}
