export const DATA_EXPORTS_SQL = `
    CREATE TABLE IF NOT EXISTS data_export_audit (
        id TEXT PRIMARY KEY DEFAULT ('dexp_' || md5(random()::text || clock_timestamp()::text)),
        club_id TEXT NOT NULL,
        actor_user_id TEXT,
        export_type TEXT NOT NULL,
        filters_json JSONB NOT NULL DEFAULT '{}'::JSONB,
        row_count INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_data_export_type CHECK (export_type IN ('players', 'matches', 'ratings')),
        CONSTRAINT chk_data_export_row_count CHECK (row_count >= 0),
        CONSTRAINT fk_data_export_club FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE RESTRICT,
        CONSTRAINT fk_data_export_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_data_export_audit_club_created
        ON data_export_audit (club_id, created_at DESC, id);
    CREATE INDEX IF NOT EXISTS idx_data_export_audit_actor_created
        ON data_export_audit (actor_user_id, created_at DESC, id);
`;

export async function up(pgm) {
    pgm.sql(DATA_EXPORTS_SQL);
}

export async function down() {
    throw new Error('This data-export audit migration is intentionally irreversible.');
}
