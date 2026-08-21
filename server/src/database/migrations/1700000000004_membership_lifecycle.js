export const MEMBERSHIP_LIFECYCLE_SQL = `
    ALTER TABLE user_clubs
        ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

    UPDATE user_clubs
    SET activated_at = joined_at
    WHERE status = 'ACTIVE_MEMBER' AND activated_at IS NULL;

    ALTER TABLE club_join_requests
        ADD COLUMN IF NOT EXISTS processed_by TEXT,
        ADD COLUMN IF NOT EXISTS processing_reason TEXT,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'fk_join_requests_processor'
              AND conrelid = 'club_join_requests'::regclass
        ) THEN
            ALTER TABLE club_join_requests
                ADD CONSTRAINT fk_join_requests_processor
                FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL;
        END IF;
    END $$;

    SELECT create_updated_at_trigger('club_join_requests');

    CREATE TABLE IF NOT EXISTS club_membership_events (
        id TEXT PRIMARY KEY DEFAULT ('mbe_' || md5(random()::text || clock_timestamp()::text)),
        club_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        actor_user_id TEXT,
        event_type TEXT NOT NULL,
        from_status TEXT,
        to_status TEXT NOT NULL,
        payload_json JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_membership_event_from_status CHECK (
            from_status IS NULL OR from_status IN ('PENDING_APPROVAL', 'ACTIVE_MEMBER', 'REJECTED', 'REVOKED')
        ),
        CONSTRAINT chk_membership_event_to_status CHECK (
            to_status IN ('PENDING_APPROVAL', 'ACTIVE_MEMBER', 'REJECTED', 'REVOKED')
        )
    );

    CREATE TABLE IF NOT EXISTS club_join_codes (
        id TEXT PRIMARY KEY DEFAULT ('jcode_' || md5(random()::text || clock_timestamp()::text)),
        club_id TEXT NOT NULL,
        code_digest TEXT NOT NULL UNIQUE,
        created_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        revoked_at TIMESTAMPTZ,
        revoked_by TEXT
    );

    CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY DEFAULT ('notif_' || md5(random()::text || clock_timestamp()::text)),
        user_id TEXT NOT NULL,
        club_id TEXT,
        event_type TEXT NOT NULL,
        payload_json JSONB NOT NULL DEFAULT '{}',
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_membership_events_club' AND conrelid = 'club_membership_events'::regclass) THEN
            ALTER TABLE club_membership_events ADD CONSTRAINT fk_membership_events_club
                FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_membership_events_user' AND conrelid = 'club_membership_events'::regclass) THEN
            ALTER TABLE club_membership_events ADD CONSTRAINT fk_membership_events_user
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_membership_events_actor' AND conrelid = 'club_membership_events'::regclass) THEN
            ALTER TABLE club_membership_events ADD CONSTRAINT fk_membership_events_actor
                FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_join_codes_club' AND conrelid = 'club_join_codes'::regclass) THEN
            ALTER TABLE club_join_codes ADD CONSTRAINT fk_join_codes_club
                FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_join_codes_creator' AND conrelid = 'club_join_codes'::regclass) THEN
            ALTER TABLE club_join_codes ADD CONSTRAINT fk_join_codes_creator
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_join_codes_revoker' AND conrelid = 'club_join_codes'::regclass) THEN
            ALTER TABLE club_join_codes ADD CONSTRAINT fk_join_codes_revoker
                FOREIGN KEY (revoked_by) REFERENCES users(id) ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_notifications_user' AND conrelid = 'notifications'::regclass) THEN
            ALTER TABLE notifications ADD CONSTRAINT fk_notifications_user
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_notifications_club' AND conrelid = 'notifications'::regclass) THEN
            ALTER TABLE notifications ADD CONSTRAINT fk_notifications_club
                FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE RESTRICT;
        END IF;
    END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS ux_club_join_codes_active_club
        ON club_join_codes (club_id) WHERE revoked_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_membership_events_club_user_created
        ON club_membership_events (club_id, user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_join_codes_active_digest
        ON club_join_codes (code_digest) WHERE revoked_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_notifications_user_unread_created
        ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_notifications_club_created
        ON notifications (club_id, created_at DESC);
`;

export async function up(pgm) {
    pgm.sql(MEMBERSHIP_LIFECYCLE_SQL);
}

export async function down() {
    throw new Error('This membership-lifecycle migration is intentionally irreversible.');
}
