export const NOTIFICATION_DISMISSAL_SQL = `
    ALTER TABLE notifications
        ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;

    CREATE INDEX IF NOT EXISTS idx_notifications_user_visible_created
        ON notifications (user_id, created_at DESC, id DESC)
        WHERE dismissed_at IS NULL;
`;

export async function up(pgm) {
    pgm.sql(NOTIFICATION_DISMISSAL_SQL);
}

export async function down(pgm) {
    pgm.sql(`
        DROP INDEX IF EXISTS idx_notifications_user_visible_created;
        ALTER TABLE notifications DROP COLUMN IF EXISTS dismissed_at;
    `);
}
