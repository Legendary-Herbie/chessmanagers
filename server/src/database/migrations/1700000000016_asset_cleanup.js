export async function up(pgm) {
    pgm.sql(`CREATE TABLE asset_cleanup_jobs (
        kind TEXT NOT NULL CHECK (kind IN ('image', 'attachment')),
        asset_key TEXT NOT NULL,
        PRIMARY KEY (kind, asset_key)
    )`);
}

export async function down(pgm) {
    pgm.dropTable('asset_cleanup_jobs');
}
