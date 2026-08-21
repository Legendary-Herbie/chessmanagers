import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import * as pgMigratePackage from 'node-pg-migrate';
import { assertTestDatabase, configureTestEnvironment } from './testEnvironment.js';

const { Pool } = pg;
const runner = pgMigratePackage.default || pgMigratePackage.runner || pgMigratePackage;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function globalSetup() {
    configureTestEnvironment();
    assertTestDatabase();

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
        await runner({
            dbClient: pool,
            dir: path.resolve(__dirname, '../database/migrations'),
            direction: 'up',
            migrationsTable: 'pgmigrations',
            log: () => {},
        });
    } finally {
        await pool.end();
    }
}

