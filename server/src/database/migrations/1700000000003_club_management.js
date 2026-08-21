export const CLUB_MANAGEMENT_SQL = `
    CREATE TABLE IF NOT EXISTS club_rating_settings (
        club_id TEXT NOT NULL,
        category TEXT NOT NULL,
        initial_rating INTEGER NOT NULL DEFAULT 1500,
        rating_floor INTEGER NOT NULL DEFAULT 500,
        established_k_factor INTEGER NOT NULL DEFAULT 32,
        provisional_k_factor INTEGER NOT NULL DEFAULT 40,
        provisional_games INTEGER NOT NULL DEFAULT 10,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (club_id, category),
        CONSTRAINT chk_club_rating_category
            CHECK (category IN ('blitz', 'rapid', 'classical')),
        CONSTRAINT chk_club_rating_values
            CHECK (
                initial_rating >= 100
                AND rating_floor >= 0
                AND rating_floor <= initial_rating
                AND established_k_factor BETWEEN 1 AND 100
                AND provisional_k_factor BETWEEN 1 AND 100
                AND provisional_games BETWEEN 1 AND 100
            )
    );

    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'fk_club_rating_settings_club_preserve'
              AND conrelid = 'club_rating_settings'::regclass
        ) THEN
            ALTER TABLE club_rating_settings
                ADD CONSTRAINT fk_club_rating_settings_club_preserve
                FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE RESTRICT;
        END IF;
    END $$;

    INSERT INTO club_rating_settings (club_id, category)
    SELECT club.id, category.name
    FROM clubs club
    CROSS JOIN (VALUES ('blitz'), ('rapid'), ('classical')) AS category(name)
    ON CONFLICT (club_id, category) DO NOTHING;

    ALTER TABLE players ALTER COLUMN rating SET DEFAULT 1500;
    ALTER TABLE players ALTER COLUMN start_rating SET DEFAULT 1500;
    ALTER TABLE players ALTER COLUMN blitz_rating SET DEFAULT 1500;
    ALTER TABLE players ALTER COLUMN rapid_rating SET DEFAULT 1500;
    ALTER TABLE players ALTER COLUMN classical_rating SET DEFAULT 1500;

    SELECT create_updated_at_trigger('club_rating_settings');
    CREATE INDEX IF NOT EXISTS idx_club_rating_settings_club
        ON club_rating_settings (club_id);

    CREATE TABLE IF NOT EXISTS club_audit_events (
        id TEXT PRIMARY KEY DEFAULT ('audit_' || md5(random()::text || clock_timestamp()::text)),
        club_id TEXT NOT NULL,
        actor_user_id TEXT,
        event_type TEXT NOT NULL,
        payload_json JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'fk_club_audit_events_club_preserve'
              AND conrelid = 'club_audit_events'::regclass
        ) THEN
            ALTER TABLE club_audit_events
                ADD CONSTRAINT fk_club_audit_events_club_preserve
                FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'fk_club_audit_events_actor'
              AND conrelid = 'club_audit_events'::regclass
        ) THEN
            ALTER TABLE club_audit_events
                ADD CONSTRAINT fk_club_audit_events_actor
                FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL;
        END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS idx_club_audit_events_club_created
        ON club_audit_events (club_id, created_at DESC);
`;

export async function up(pgm) {
    pgm.sql(CLUB_MANAGEMENT_SQL);
}

export async function down() {
    throw new Error('This club-management migration is intentionally irreversible.');
}
