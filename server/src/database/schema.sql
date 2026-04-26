-- ─── Users ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    id            TEXT    PRIMARY KEY,
    email         TEXT    UNIQUE NOT NULL,
    name         TEXT,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'member', -- 'admin' | 'linked_player' | 'member' | 'staff'
    created_at    BIGINT  NOT NULL,
    updated_at    BIGINT  NOT NULL DEFAULT 0
);

-- ─── Clubs ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clubs (
    id           TEXT    PRIMARY KEY,
    name         TEXT    NOT NULL,
    description  TEXT,
    logo         TEXT,                               -- URL to logo image
    contact_info TEXT,
    owner_id     TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    share_token  TEXT,
    public_leaderboard INTEGER NOT NULL DEFAULT 0,
    share_expires BIGINT,
    settings_json TEXT   NOT NULL DEFAULT '{}',
    created_at   BIGINT  NOT NULL,
    updated_at   BIGINT  NOT NULL DEFAULT 0
);

-- Club membership — many users can belong to a club
CREATE TABLE IF NOT EXISTS user_clubs (
    user_id   TEXT   NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    club_id   TEXT   NOT NULL REFERENCES clubs(id)  ON DELETE CASCADE,
    joined_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, club_id)
);

-- ─── Players ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS players (
    id           TEXT    PRIMARY KEY,
    club_id      TEXT    NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    name         TEXT    NOT NULL,
    bio          TEXT,
    rating       INTEGER NOT NULL DEFAULT 1200,
    start_rating INTEGER NOT NULL DEFAULT 1200,
    games        INTEGER NOT NULL DEFAULT 0,
    wins         INTEGER NOT NULL DEFAULT 0,
    draws        INTEGER NOT NULL DEFAULT 0,
    losses       INTEGER NOT NULL DEFAULT 0,
    last_played  BIGINT,
    created_at   BIGINT  NOT NULL,
    updated_at   BIGINT  NOT NULL DEFAULT 0
);

-- Player ↔ User link — optional, requires admin approval
CREATE TABLE IF NOT EXISTS player_links (
    id          TEXT   PRIMARY KEY,
    player_id   TEXT   NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    user_id     TEXT   NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    status      TEXT   NOT NULL DEFAULT 'pending',     -- 'pending' | 'approved' | 'rejected'
    created_at  BIGINT NOT NULL,
    reviewed_at BIGINT,
    UNIQUE (player_id),                                -- one approved link per player
    UNIQUE (user_id)                                   -- one player per user account
);

-- ─── Matches ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS matches (
    id              TEXT    PRIMARY KEY,
    club_id         TEXT    NOT NULL REFERENCES clubs(id)   ON DELETE CASCADE,
    white_player_id TEXT    NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    black_player_id TEXT    NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    result          TEXT    NOT NULL,                       -- 'white' | 'black' | 'draw'
    type            TEXT    NOT NULL DEFAULT 'casual',      -- 'casual' | 'practice' | 'tournament'
    tournament_id   TEXT    REFERENCES tournaments(id)      ON DELETE SET NULL,
    notes           TEXT,
    played_at       BIGINT  NOT NULL,
    created_at      BIGINT  NOT NULL,
    updated_at      BIGINT  NOT NULL DEFAULT 0
);

-- Rating snapshot per match per player — feeds sparklines and history graphs
CREATE TABLE IF NOT EXISTS rating_history (
    id           TEXT    PRIMARY KEY,
    player_id    TEXT    NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    match_id     TEXT    NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    rating_before INTEGER NOT NULL,
    rating_after  INTEGER NOT NULL,
    created_at   BIGINT  NOT NULL,
    UNIQUE (player_id, match_id)
);

-- ─── Tournaments ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tournaments (
    id         TEXT    PRIMARY KEY,
    club_id    TEXT    NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    name       TEXT    NOT NULL,
    type       TEXT    NOT NULL,                           -- 'round_robin' | 'knockout'
    status     TEXT    NOT NULL DEFAULT 'upcoming',        -- 'upcoming' | 'active' | 'completed'
    start_date BIGINT  NOT NULL,
    end_date   BIGINT,
    settings_json TEXT NOT NULL DEFAULT '{}',              -- reserved for future pairing config
    created_at BIGINT  NOT NULL,
    updated_at BIGINT  NOT NULL DEFAULT 0
);

-- Tournament roster — players entered in a tournament
CREATE TABLE IF NOT EXISTS tournament_players (
    tournament_id TEXT   NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    player_id     TEXT   NOT NULL REFERENCES players(id)     ON DELETE CASCADE,
    joined_at     BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (tournament_id, player_id)
);

-- ─── Auth ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          TEXT    PRIMARY KEY,
    user_id     TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT    NOT NULL,
    expires_at  BIGINT  NOT NULL,
    created_at  BIGINT  NOT NULL,
    revoked     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS password_resets (
    id          TEXT    PRIMARY KEY,
    user_id     TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT    NOT NULL,
    expires_at  BIGINT  NOT NULL,
    created_at  BIGINT  NOT NULL,
    used_at     BIGINT,
    request_ip  TEXT,
    user_agent  TEXT,
    attempts    INTEGER NOT NULL DEFAULT 0
);

-- ─── Indices ──────────────────────────────────────────────────────────────────

-- Users
CREATE INDEX IF NOT EXISTS idx_users_email              ON users(email);

-- Clubs
CREATE INDEX IF NOT EXISTS idx_clubs_owner              ON clubs(owner_id);
CREATE INDEX IF NOT EXISTS idx_clubs_share_token        ON clubs(share_token);
CREATE INDEX IF NOT EXISTS idx_user_clubs_user          ON user_clubs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_clubs_club          ON user_clubs(club_id);

-- Players
CREATE INDEX IF NOT EXISTS idx_players_club             ON players(club_id);
CREATE INDEX IF NOT EXISTS idx_players_rating_sort      ON players(club_id, rating DESC);
CREATE INDEX IF NOT EXISTS idx_players_name_search      ON players(club_id, name);

-- Player links
CREATE INDEX IF NOT EXISTS idx_player_links_player      ON player_links(player_id);
CREATE INDEX IF NOT EXISTS idx_player_links_user        ON player_links(user_id);
CREATE INDEX IF NOT EXISTS idx_player_links_status      ON player_links(status);

-- Matches
CREATE INDEX IF NOT EXISTS idx_matches_club             ON matches(club_id);
CREATE INDEX IF NOT EXISTS idx_matches_date_sort        ON matches(club_id, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_white_player     ON matches(white_player_id);
CREATE INDEX IF NOT EXISTS idx_matches_black_player     ON matches(black_player_id);
CREATE INDEX IF NOT EXISTS idx_matches_tournament       ON matches(tournament_id);

-- Rating history
CREATE INDEX IF NOT EXISTS idx_rating_history_player    ON rating_history(player_id);
CREATE INDEX IF NOT EXISTS idx_rating_history_match     ON rating_history(match_id);

-- Tournaments
CREATE INDEX IF NOT EXISTS idx_tournaments_club         ON tournaments(club_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_status       ON tournaments(club_id, status);
CREATE INDEX IF NOT EXISTS idx_tournament_players_tour  ON tournament_players(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_players_player ON tournament_players(player_id);

-- Auth
CREATE INDEX IF NOT EXISTS idx_refresh_token_user       ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_token_hash       ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_password_resets_token    ON password_resets(token_hash);
CREATE INDEX IF NOT EXISTS idx_password_resets_user     ON password_resets(user_id);