export const up = pgm => pgm.sql(`
    CREATE TABLE player_registration_requests (
        id TEXT PRIMARY KEY DEFAULT ('preg_' || md5(random()::text || clock_timestamp()::text)),
        club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 150),
        bio TEXT,
        federation_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
        player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
        reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TIMESTAMPTZ,
        review_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        FOREIGN KEY (user_id, club_id) REFERENCES user_clubs(user_id, club_id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX uq_player_registration_pending ON player_registration_requests(club_id,user_id) WHERE status='pending';
    CREATE INDEX idx_player_registration_queue ON player_registration_requests(club_id,status,created_at);
`);
export const down = pgm => pgm.dropTable('player_registration_requests');
