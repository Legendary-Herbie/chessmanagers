export async function up(pgm) {
    pgm.sql(`
        ALTER TABLE announcements
            ADD COLUMN IF NOT EXISTS notification_enabled BOOLEAN NOT NULL DEFAULT TRUE;

        -- Invalid legacy views cannot be attributed reliably; retain only correctly scoped views.
        DELETE FROM announcement_views view_record
        WHERE NOT EXISTS (SELECT 1 FROM announcements announcement
            WHERE announcement.id = view_record.announcement_id AND announcement.club_id = view_record.club_id);

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'fk_announcement_views_scope'
                  AND conrelid = 'announcement_views'::regclass
            ) THEN
                ALTER TABLE announcement_views
                    ADD CONSTRAINT fk_announcement_views_scope
                    FOREIGN KEY (announcement_id, club_id)
                    REFERENCES announcements(id, club_id)
                    ON DELETE CASCADE;
            END IF;
        END $$;

        CREATE INDEX IF NOT EXISTS idx_announcement_views_scope
            ON announcement_views (announcement_id, club_id);
    `);
}

export async function down() {
    throw new Error('This announcement-integrity migration is intentionally irreversible.');
}
