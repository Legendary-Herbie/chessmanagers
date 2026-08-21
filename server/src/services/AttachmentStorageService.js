import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { z } from 'zod';

const storageRoot = fileURLToPath(new URL('../../uploads/attachments/', import.meta.url));
const metadataSchema = z.object({
    size: z.number().int().positive().max(5 * 1024 * 1024),
    mimetype: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
    originalname: z.string().min(1).max(255),
}).strict();
const TYPES = [
    { mime: 'image/jpeg', extension: 'jpg', kind: 'image', matches: buffer => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
    { mime: 'image/png', extension: 'png', kind: 'image', matches: buffer => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
    { mime: 'image/webp', extension: 'webp', kind: 'image', matches: buffer => buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' },
    { mime: 'application/pdf', extension: 'pdf', kind: 'attachment', matches: buffer => buffer.length >= 5 && buffer.toString('ascii', 0, 5) === '%PDF-' },
];

function invalidAttachment(message) {
    return Object.assign(new Error(message), { status: 400 });
}

function safeSegment(value) {
    return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export async function storeAttachment(file, { clubId, announcementId }) {
    if (!file?.buffer) throw invalidAttachment('Choose an image or PDF to upload.');
    const metadata = metadataSchema.safeParse({
        size: file.size,
        mimetype: file.mimetype,
        originalname: file.originalname,
    });
    if (!metadata.success) {
        throw invalidAttachment('Use a JPEG, PNG, WebP, or PDF file no larger than 5 MB.');
    }
    const detected = TYPES.find(type => type.matches(file.buffer));
    if (!detected || detected.mime !== metadata.data.mimetype) {
        throw invalidAttachment('The uploaded file contents do not match a supported file type.');
    }
    const namespace = path.join(safeSegment(clubId), safeSegment(announcementId));
    const directory = path.join(storageRoot, namespace);
    await mkdir(directory, { recursive: true });
    const filename = `${crypto.randomUUID()}.${detected.extension}`;
    const storageKey = path.posix.join(namespace.replaceAll('\\', '/'), filename);
    await writeFile(path.join(directory, filename), file.buffer, { flag: 'wx' });
    return {
        storageKey,
        originalName: metadata.data.originalname,
        contentType: detected.mime,
        sizeBytes: metadata.data.size,
        kind: detected.kind,
    };
}

export function resolveAttachmentPath(storageKey) {
    const resolved = path.resolve(storageRoot, storageKey);
    const root = path.resolve(storageRoot);
    if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error('Invalid attachment storage key.');
    return resolved;
}

export async function removeAttachment(storageKey) {
    try {
        await unlink(resolveAttachmentPath(storageKey));
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
}
