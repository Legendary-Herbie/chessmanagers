import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '../..');

function databaseName(connectionString) {
    const url = new URL(connectionString);
    return decodeURIComponent(url.pathname.replace(/^\//, ''));
}

export function resolveTestDatabaseUrl() {
    dotenv.config({ path: path.join(serverRoot, '.env'), quiet: true });

    const explicitTestUrl = process.env.TEST_DATABASE_URL?.trim();
    const sourceUrl = explicitTestUrl || process.env.DATABASE_URL?.trim();

    if (!sourceUrl) {
        throw new Error('TEST_DATABASE_URL or DATABASE_URL is required to run server tests.');
    }

    const url = new URL(sourceUrl);
    if (!explicitTestUrl) {
        const sourceName = databaseName(sourceUrl);
        url.pathname = `/${sourceName.endsWith('_test') ? sourceName : `${sourceName}_test`}`;
    }

    const resolved = url.toString();
    const resolvedName = databaseName(resolved);
    if (!resolvedName.endsWith('_test')) {
        throw new Error(
            `Refusing to run tests against database "${resolvedName}". ` +
            'The test database name must end with "_test".'
        );
    }

    return resolved;
}

export function configureTestEnvironment() {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = resolveTestDatabaseUrl();
    process.env.JWT_SECRET ||= 'test-only-jwt-secret-that-is-at-least-32-characters';
    process.env.CORS_ORIGIN ||= 'http://localhost:5173';
    process.env.SERVE_FRONTEND = 'false';
}

export function assertTestDatabase(connectionString = process.env.DATABASE_URL) {
    const name = databaseName(connectionString);
    if (!name.endsWith('_test')) {
        throw new Error(`Unsafe test database: "${name}".`);
    }
    return name;
}

