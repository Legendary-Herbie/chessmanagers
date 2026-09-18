import db from '../database/database.js';
import { removeImageAsset } from './ImageAssetService.js';
import { removeAttachment } from './AttachmentStorageService.js';

export async function drainAssetCleanup() {
    try {
        await db.transaction(async trx => {
            const jobs = await trx.query('SELECT * FROM asset_cleanup_jobs LIMIT 100 FOR UPDATE SKIP LOCKED');
            for (const job of jobs.rows) {
                // A URL can have been reused in another club. Keep any referenced file.
                const used = job.kind === 'image'
                    ? await trx.query('SELECT 1 FROM clubs WHERE logo = $1 UNION ALL SELECT 1 FROM players WHERE photo_url = $1 LIMIT 1', [job.asset_key])
                    : await trx.query('SELECT 1 FROM announcement_attachments WHERE storage_key = $1 LIMIT 1', [job.asset_key]);
                if (!used.rows.length) {
                    try {
                        if (job.kind === 'image') await removeImageAsset(job.asset_key);
                        else await removeAttachment(job.asset_key);
                    } catch (error) {
                        console.error('[CLEANUP] Could not remove uploaded file; will retry.', error.code);
                        continue;
                    }
                }
                await trx.query('DELETE FROM asset_cleanup_jobs WHERE kind = $1 AND asset_key = $2', [job.kind, job.asset_key]);
            }
        });
    } catch (error) {
        console.error('[CLEANUP] File cleanup will be retried.', error.message);
    }
}

export function startAssetCleanupWorker() {
    void drainAssetCleanup();
    const interval = setInterval(() => void drainAssetCleanup(), 30_000);
    interval.unref();
    return interval;
}
