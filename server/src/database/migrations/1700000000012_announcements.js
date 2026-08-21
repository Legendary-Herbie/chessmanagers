export const ANNOUNCEMENTS_SQL = `
    CREATE TABLE IF NOT EXISTS announcements (
        id TEXT PRIMARY KEY DEFAULT ('ann_' || md5(random()::text || clock_timestamp()::text)),
        club_id TEXT NOT NULL,
        title TEXT NOT NULL,
        content_html TEXT NOT NULL,
        content_text TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        created_by TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        published_at TIMESTAMPTZ,
        published_by TEXT,
        archived_at TIMESTAMPTZ,
        archived_by TEXT,
        deleted_at TIMESTAMPTZ,
        deleted_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_announcement_status CHECK (status IN ('draft', 'published', 'archived')),
        CONSTRAINT chk_announcement_title CHECK (char_length(title) BETWEEN 1 AND 200),
        UNIQUE (id, club_id)
    );

    CREATE TABLE IF NOT EXISTS announcement_attachments (
        id TEXT PRIMARY KEY DEFAULT ('aatt_' || md5(random()::text || clock_timestamp()::text)),
        club_id TEXT NOT NULL,
        announcement_id TEXT NOT NULL,
        original_name TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        storage_key TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL,
        created_by TEXT NOT NULL,
        deleted_at TIMESTAMPTZ,
        deleted_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_announcement_attachment_kind CHECK (kind IN ('image', 'attachment')),
        CONSTRAINT chk_announcement_attachment_size CHECK (size_bytes > 0 AND size_bytes <= 5242880),
        UNIQUE (id, announcement_id, club_id)
    );

    CREATE TABLE IF NOT EXISTS announcement_audit_events (
        id TEXT PRIMARY KEY DEFAULT ('aaud_' || md5(random()::text || clock_timestamp()::text)),
        club_id TEXT NOT NULL,
        announcement_id TEXT NOT NULL,
        actor_user_id TEXT,
        event_type TEXT NOT NULL,
        old_state JSONB,
        new_state JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_announcements_club') THEN
            ALTER TABLE announcements ADD CONSTRAINT fk_announcements_club
                FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_announcements_creator') THEN
            ALTER TABLE announcements ADD CONSTRAINT fk_announcements_creator
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_announcements_updater') THEN
            ALTER TABLE announcements ADD CONSTRAINT fk_announcements_updater
                FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_announcements_publisher') THEN
            ALTER TABLE announcements ADD CONSTRAINT fk_announcements_publisher
                FOREIGN KEY (published_by) REFERENCES users(id) ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_announcements_archiver') THEN
            ALTER TABLE announcements ADD CONSTRAINT fk_announcements_archiver
                FOREIGN KEY (archived_by) REFERENCES users(id) ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_announcements_deleter') THEN
            ALTER TABLE announcements ADD CONSTRAINT fk_announcements_deleter
                FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_announcement_attachment_scope') THEN
            ALTER TABLE announcement_attachments ADD CONSTRAINT fk_announcement_attachment_scope
                FOREIGN KEY (announcement_id, club_id) REFERENCES announcements(id, club_id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_announcement_attachment_creator') THEN
            ALTER TABLE announcement_attachments ADD CONSTRAINT fk_announcement_attachment_creator
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_announcement_attachment_deleter') THEN
            ALTER TABLE announcement_attachments ADD CONSTRAINT fk_announcement_attachment_deleter
                FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_announcement_audit_scope') THEN
            ALTER TABLE announcement_audit_events ADD CONSTRAINT fk_announcement_audit_scope
                FOREIGN KEY (announcement_id, club_id) REFERENCES announcements(id, club_id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_announcement_audit_actor') THEN
            ALTER TABLE announcement_audit_events ADD CONSTRAINT fk_announcement_audit_actor
                FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL;
        END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS idx_announcements_member_feed
        ON announcements (club_id, published_at DESC, id DESC)
        WHERE status = 'published' AND deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_announcements_admin
        ON announcements (club_id, status, updated_at DESC)
        WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_announcement_attachments_active
        ON announcement_attachments (announcement_id, created_at)
        WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_announcement_audit
        ON announcement_audit_events (club_id, announcement_id, created_at DESC);
`;

export async function up(pgm) {
    pgm.sql(ANNOUNCEMENTS_SQL);
}

export async function down() {
    throw new Error('This announcements migration is intentionally irreversible.');
}
