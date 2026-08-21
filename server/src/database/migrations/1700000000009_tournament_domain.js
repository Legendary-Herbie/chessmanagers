export const TOURNAMENT_DOMAIN_SQL = `
    ALTER TABLE tournaments
        ADD COLUMN IF NOT EXISTS current_round INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS delete_reason TEXT;

    ALTER TABLE tournament_players
        ADD COLUMN IF NOT EXISTS registration_round INTEGER NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
        ADD COLUMN IF NOT EXISTS withdrawn_round INTEGER,
        ADD COLUMN IF NOT EXISTS bye_count INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS seed INTEGER;

    DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tournament_player_status') THEN
            ALTER TABLE tournament_players ADD CONSTRAINT chk_tournament_player_status
                CHECK (status IN ('active', 'withdrawn'));
        END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS tournament_rounds (
        id TEXT PRIMARY KEY DEFAULT ('tround_' || MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT)),
        club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE RESTRICT,
        tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE RESTRICT,
        round_number INTEGER NOT NULL CHECK (round_number > 0),
        status TEXT NOT NULL DEFAULT 'paired' CHECK (status IN ('paired', 'completed')),
        paired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tournament_id, round_number),
        UNIQUE (id, tournament_id, club_id)
    );

    CREATE TABLE IF NOT EXISTS tournament_pairings (
        id TEXT PRIMARY KEY DEFAULT ('pairing_' || MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT)),
        club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE RESTRICT,
        tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE RESTRICT,
        round_id TEXT NOT NULL,
        round_number INTEGER NOT NULL CHECK (round_number > 0),
        board INTEGER NOT NULL CHECK (board > 0),
        white_player_id TEXT REFERENCES players(id) ON DELETE RESTRICT,
        black_player_id TEXT REFERENCES players(id) ON DELETE RESTRICT,
        result TEXT CHECK (result IN ('white', 'black', 'draw', 'bye')),
        match_id TEXT REFERENCES matches(id) ON DELETE RESTRICT,
        is_bye BOOLEAN NOT NULL DEFAULT FALSE,
        status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tournament_id, round_number, board),
        CONSTRAINT fk_pairing_round_scope FOREIGN KEY (round_id, tournament_id, club_id)
            REFERENCES tournament_rounds(id, tournament_id, club_id) ON DELETE RESTRICT,
        CONSTRAINT chk_pairing_players CHECK (
            (is_bye AND white_player_id IS NOT NULL AND black_player_id IS NULL AND result = 'bye') OR
            (NOT is_bye AND white_player_id IS NOT NULL AND black_player_id IS NOT NULL
                AND white_player_id <> black_player_id AND result IS DISTINCT FROM 'bye')
        )
    );

    CREATE INDEX IF NOT EXISTS idx_tournament_players_active
        ON tournament_players(tournament_id, status, registration_round, player_id);
    CREATE INDEX IF NOT EXISTS idx_tournament_pairings_round
        ON tournament_pairings(tournament_id, round_number, board);
    CREATE INDEX IF NOT EXISTS idx_tournament_pairings_players
        ON tournament_pairings(tournament_id, white_player_id, black_player_id);
    CREATE UNIQUE INDEX IF NOT EXISTS ux_tournament_pairing_match
        ON tournament_pairings(match_id) WHERE match_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_tournaments_active_club
        ON tournaments(club_id, status, start_date DESC) WHERE deleted_at IS NULL;
`;

export async function up(pgm) { pgm.sql(TOURNAMENT_DOMAIN_SQL); }
export async function down() {
    throw new Error('This tournament-domain migration is intentionally irreversible.');
}
