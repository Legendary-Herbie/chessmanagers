export const PERSISTENT_NOTIFICATIONS_SQL = `
    ALTER TABLE notifications
        ADD COLUMN IF NOT EXISTS dedupe_key TEXT,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    CREATE UNIQUE INDEX IF NOT EXISTS ux_notifications_user_dedupe
        ON notifications (user_id, dedupe_key)
        WHERE dedupe_key IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_notifications_user_created
        ON notifications (user_id, created_at DESC, id DESC);

    CREATE TABLE IF NOT EXISTS notification_outbox (
        id TEXT PRIMARY KEY DEFAULT ('nout_' || md5(random()::text || clock_timestamp()::text)),
        notification_id TEXT NOT NULL,
        channel TEXT NOT NULL DEFAULT 'email',
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        claimed_at TIMESTAMPTZ,
        delivered_at TIMESTAMPTZ,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_notification_outbox_channel CHECK (channel IN ('email')),
        CONSTRAINT chk_notification_outbox_status CHECK (
            status IN ('pending', 'processing', 'delivered', 'failed', 'skipped')
        ),
        CONSTRAINT chk_notification_outbox_attempts CHECK (attempts >= 0)
    );

    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'fk_notification_outbox_notification'
              AND conrelid = 'notification_outbox'::regclass
        ) THEN
            ALTER TABLE notification_outbox
                ADD CONSTRAINT fk_notification_outbox_notification
                FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE RESTRICT;
        END IF;
    END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS ux_notification_outbox_notification_channel
        ON notification_outbox (notification_id, channel);
    CREATE INDEX IF NOT EXISTS idx_notification_outbox_ready
        ON notification_outbox (available_at, created_at)
        WHERE status IN ('pending', 'failed');
`;

export async function up(pgm) {
    pgm.sql(PERSISTENT_NOTIFICATIONS_SQL);
}

export async function down() {
    throw new Error('This persistent-notifications migration is intentionally irreversible.');
}
