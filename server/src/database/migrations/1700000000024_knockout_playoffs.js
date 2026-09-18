export async function up(pgm) {
    pgm.sql(`
        ALTER TABLE tournament_pairings
            ADD COLUMN IF NOT EXISTS bracket_slot INTEGER,
            ADD COLUMN IF NOT EXISTS is_playoff BOOLEAN NOT NULL DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS rating_category TEXT;
        UPDATE tournament_pairings SET bracket_slot = board WHERE bracket_slot IS NULL;
        UPDATE tournament_pairings pairing
        SET rating_category = tournament.rating_category
        FROM tournaments tournament
        WHERE tournament.id = pairing.tournament_id
          AND tournament.club_id = pairing.club_id
          AND pairing.rating_category IS NULL;
        ALTER TABLE tournament_pairings
            ALTER COLUMN bracket_slot SET NOT NULL,
            ALTER COLUMN rating_category SET NOT NULL;
        ALTER TABLE tournament_pairings ADD CONSTRAINT chk_pairing_rating_category
            CHECK (rating_category IN ('blitz', 'rapid', 'classical'));
    `);
}

export async function down() {
    throw new Error('This knockout-playoffs migration is intentionally irreversible.');
}
