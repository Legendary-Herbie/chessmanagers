export const AUTHENTICATION_LIFECYCLE_SQL = `
    ALTER TABLE users
        ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS deletion_reason TEXT,
        ADD COLUMN IF NOT EXISTS verification_policy_migrated BOOLEAN NOT NULL DEFAULT FALSE;

    UPDATE users
    SET email_verified = TRUE,
        email_verified_at = COALESCE(email_verified_at, created_at),
        verification_policy_migrated = TRUE
    WHERE verification_policy_migrated = FALSE;

    ALTER TABLE users ALTER COLUMN verification_policy_migrated SET DEFAULT TRUE;

    ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

    DO $$
    DECLARE duplicates TEXT;
    BEGIN
        SELECT string_agg(email, ', ') INTO duplicates
        FROM (
            SELECT LOWER(email) AS email FROM users GROUP BY LOWER(email) HAVING COUNT(*) > 1
        ) duplicate_emails;
        IF duplicates IS NOT NULL THEN
            RAISE EXCEPTION 'Cannot canonicalize duplicate account emails: %', duplicates;
        END IF;
    END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email_lower ON users (LOWER(email));
    CREATE INDEX IF NOT EXISTS idx_users_active_username
        ON users (LOWER(username)) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS email_verification_tokens (
        id TEXT PRIMARY KEY DEFAULT ('evt_' || MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT)),
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        request_ip TEXT,
        user_agent TEXT
    );

    CREATE TABLE IF NOT EXISTS oauth_identities (
        id TEXT PRIMARY KEY DEFAULT ('oid_' || MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT)),
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        provider TEXT NOT NULL,
        provider_subject TEXT NOT NULL,
        provider_email TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (provider, provider_subject),
        UNIQUE (user_id, provider)
    );

    CREATE TABLE IF NOT EXISTS oauth_states (
        id TEXT PRIMARY KEY DEFAULT ('ost_' || MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT)),
        state_hash TEXT NOT NULL UNIQUE,
        provider TEXT NOT NULL,
        continuation TEXT,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        request_ip TEXT,
        user_agent TEXT
    );

    ALTER TABLE refresh_tokens
        ADD COLUMN IF NOT EXISTS family_id TEXT,
        ADD COLUMN IF NOT EXISTS replaced_by_token_id TEXT,
        ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS revoke_reason TEXT,
        ADD COLUMN IF NOT EXISTS created_ip TEXT,
        ADD COLUMN IF NOT EXISTS user_agent TEXT,
        ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

    UPDATE refresh_tokens SET family_id = id WHERE family_id IS NULL;
    UPDATE refresh_tokens SET revoked_at = created_at WHERE revoked = TRUE AND revoked_at IS NULL;
    ALTER TABLE refresh_tokens ALTER COLUMN family_id SET NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_refresh_tokens_hash ON refresh_tokens (token_hash);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_active
        ON refresh_tokens (user_id, expires_at) WHERE revoked = FALSE;
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens (family_id);

    DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_refresh_token_replacement') THEN
            ALTER TABLE refresh_tokens ADD CONSTRAINT fk_refresh_token_replacement
                FOREIGN KEY (replaced_by_token_id) REFERENCES refresh_tokens(id) ON DELETE RESTRICT;
        END IF;
    END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS ux_password_resets_hash ON password_resets (token_hash);
    CREATE INDEX IF NOT EXISTS idx_password_resets_user_active
        ON password_resets (user_id, expires_at) WHERE used_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_verification_user_active
        ON email_verification_tokens (user_id, expires_at) WHERE used_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_oauth_states_active
        ON oauth_states (expires_at) WHERE used_at IS NULL;
    SELECT create_updated_at_trigger('oauth_identities');
`;

export async function up(pgm) { pgm.sql(AUTHENTICATION_LIFECYCLE_SQL); }
export async function down() {
    throw new Error('This authentication-lifecycle migration is intentionally irreversible.');
}
