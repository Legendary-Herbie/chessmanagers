import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function up(pgm) {
    pgm.sql(fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8'));
}

export async function down() {
    throw new Error('The baseline schema migration is intentionally irreversible.');
}
