export const up = pgm => pgm.sql(`
    ALTER TABLE matches ADD COLUMN client_request_id TEXT, ADD COLUMN client_user_id TEXT REFERENCES users(id) ON DELETE SET NULL, ADD COLUMN client_payload_hash TEXT;
    CREATE UNIQUE INDEX matches_client_request ON matches(club_id, client_user_id, client_request_id) WHERE client_request_id IS NOT NULL;
    ALTER TABLE tournaments ADD COLUMN tiebreaks TEXT[] NOT NULL DEFAULT ARRAY['buchholz','sonnebornBerger','directHeadToHead'];
`);
export const down = pgm => pgm.sql(`ALTER TABLE tournaments DROP COLUMN tiebreaks; DROP INDEX matches_client_request; ALTER TABLE matches DROP COLUMN client_request_id, DROP COLUMN client_user_id, DROP COLUMN client_payload_hash;`);
