export async function up(pgm) {
    pgm.sql(`
        CREATE UNIQUE INDEX IF NOT EXISTS ux_players_id_club ON players (id, club_id);
        CREATE UNIQUE INDEX IF NOT EXISTS ux_tournaments_id_club ON tournaments (id, club_id);
        ALTER TABLE tournament_players ADD COLUMN IF NOT EXISTS club_id TEXT;
        UPDATE tournament_players entry SET club_id = tournament.club_id
        FROM tournaments tournament WHERE tournament.id = entry.tournament_id AND entry.club_id IS NULL;
        ALTER TABLE tournament_players ALTER COLUMN club_id SET NOT NULL;
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS round_robin_roster TEXT[];

        -- Validate existing data as well as future writes. Invalid historical chess
        -- relationships must be repaired explicitly, never silently removed.
        ALTER TABLE tournament_players ADD CONSTRAINT fk_tournament_roster_club
            FOREIGN KEY (tournament_id, club_id) REFERENCES tournaments(id, club_id) ON DELETE RESTRICT;
        ALTER TABLE tournament_players ADD CONSTRAINT fk_tournament_roster_player_club
            FOREIGN KEY (player_id, club_id) REFERENCES players(id, club_id) ON DELETE RESTRICT;
        ALTER TABLE tournament_rounds ADD CONSTRAINT fk_tournament_round_club
            FOREIGN KEY (tournament_id, club_id) REFERENCES tournaments(id, club_id) ON DELETE RESTRICT;
        ALTER TABLE tournament_pairings ADD CONSTRAINT fk_pairing_white_club
            FOREIGN KEY (white_player_id, club_id) REFERENCES players(id, club_id) ON DELETE RESTRICT;
        ALTER TABLE tournament_pairings ADD CONSTRAINT fk_pairing_black_club
            FOREIGN KEY (black_player_id, club_id) REFERENCES players(id, club_id) ON DELETE RESTRICT;
        CREATE INDEX IF NOT EXISTS idx_tournament_roster_player_club ON tournament_players(player_id, club_id);
    `);
}

export async function down() {
    throw new Error('Tournament tenant constraints and frozen schedules must be retained.');
}
