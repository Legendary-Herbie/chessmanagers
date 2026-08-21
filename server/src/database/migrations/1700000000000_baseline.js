import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BASELINE_SCHEMA_SHA256 = '673e9dbb5ea4604f68cc73134f57d18147a45caed8c548788fbf4de29f3c3128';

export function readBaselineSchema() {
    const schema = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
    const checksum = crypto.createHash('sha256').update(schema).digest('hex');

    if (checksum !== BASELINE_SCHEMA_SHA256) {
        throw new Error(
            'schema.sql no longer matches the immutable baseline. Add a new forward migration instead of editing the baseline schema.'
        );
    }

    return schema;
}

export async function up(pgm) {
    pgm.sql(readBaselineSchema());
}

export async function down() {
    throw new Error('The baseline schema migration is intentionally irreversible.');
}
