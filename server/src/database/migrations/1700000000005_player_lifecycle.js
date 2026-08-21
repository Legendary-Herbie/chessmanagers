export const PLAYER_LIFECYCLE_SQL = `
    ALTER TABLE players
        ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

    ALTER TABLE player_links
        ADD COLUMN IF NOT EXISTS unlinked_by TEXT,
        ADD COLUMN IF NOT EXISTS unlink_reason TEXT;

    CREATE TABLE IF NOT EXISTS player_lifecycle_events (
        id TEXT PRIMARY KEY DEFAULT ('ple_' || md5(random()::text || clock_timestamp()::text)),
        club_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        actor_user_id TEXT,
        event_type TEXT NOT NULL,
        from_status TEXT,
        to_status TEXT NOT NULL,
        payload_json JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_player_lifecycle_from_status CHECK (
            from_status IS NULL OR from_status IN ('active', 'inactive', 'deleted')
        ),
        CONSTRAINT chk_player_lifecycle_to_status CHECK (
            to_status IN ('active', 'inactive', 'deleted')
        )
    );

    CREATE TABLE IF NOT EXISTS player_link_events (
        id TEXT PRIMARY KEY DEFAULT ('plke_' || md5(random()::text || clock_timestamp()::text)),
        club_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        link_id TEXT NOT NULL,
        actor_user_id TEXT,
        event_type TEXT NOT NULL,
        from_status TEXT,
        to_status TEXT NOT NULL,
        payload_json JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_player_link_event_from_status CHECK (
            from_status IS NULL OR from_status IN ('pending', 'approved', 'rejected', 'unlinked')
        ),
        CONSTRAINT chk_player_link_event_to_status CHECK (
            to_status IN ('pending', 'approved', 'rejected', 'unlinked')
        )
    );

    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_player_links_unlinker' AND conrelid = 'player_links'::regclass) THEN
            ALTER TABLE player_links ADD CONSTRAINT fk_player_links_unlinker
                FOREIGN KEY (unlinked_by) REFERENCES users(id) ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_player_lifecycle_player_club' AND conrelid = 'player_lifecycle_events'::regclass) THEN
            ALTER TABLE player_lifecycle_events ADD CONSTRAINT fk_player_lifecycle_player_club
                FOREIGN KEY (player_id, club_id) REFERENCES players(id, club_id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_player_lifecycle_actor' AND conrelid = 'player_lifecycle_events'::regclass) THEN
            ALTER TABLE player_lifecycle_events ADD CONSTRAINT fk_player_lifecycle_actor
                FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_player_link_events_link' AND conrelid = 'player_link_events'::regclass) THEN
            ALTER TABLE player_link_events ADD CONSTRAINT fk_player_link_events_link
                FOREIGN KEY (link_id) REFERENCES player_links(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_player_link_events_player_club' AND conrelid = 'player_link_events'::regclass) THEN
            ALTER TABLE player_link_events ADD CONSTRAINT fk_player_link_events_player_club
                FOREIGN KEY (player_id, club_id) REFERENCES players(id, club_id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_player_link_events_user' AND conrelid = 'player_link_events'::regclass) THEN
            ALTER TABLE player_link_events ADD CONSTRAINT fk_player_link_events_user
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_player_link_events_actor' AND conrelid = 'player_link_events'::regclass) THEN
            ALTER TABLE player_link_events ADD CONSTRAINT fk_player_link_events_actor
                FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL;
        END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS idx_player_lifecycle_events_player_created
        ON player_lifecycle_events (club_id, player_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_player_link_events_player_created
        ON player_link_events (club_id, player_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_player_link_events_user_created
        ON player_link_events (club_id, user_id, created_at DESC);

    CREATE OR REPLACE VIEW v_club_leaderboard AS
    SELECT
        p.id,
        p.club_id,
        p.name,
        p.rating,
        p.games AS played,
        p.wins,
        p.draws,
        p.losses,
        p.last_played AS last_active,
        pl.status AS link_status,
        (p.wins + p.draws * 0.5) AS points
    FROM players p
    LEFT JOIN player_links pl ON pl.player_id = p.id AND pl.status = 'approved'
    WHERE p.status = 'active' AND p.deleted_at IS NULL;
`;

export async function up(pgm) {
    pgm.sql(PLAYER_LIFECYCLE_SQL);
}

export async function down() {
    throw new Error('This player-lifecycle migration is intentionally irreversible.');
}
