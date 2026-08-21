import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { z } from 'zod';

const imageDirectory = fileURLToPath(new URL('../../uploads/images/', import.meta.url));
const metadataSchema = z.object({
    size: z.number().int().positive().max(5 * 1024 * 1024),
    mimetype: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    originalname: z.string().min(1).max(255),
}).strict();

const TYPES = [
    { mime: 'image/jpeg', extension: 'jpg', matches: buffer => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
    { mime: 'image/png', extension: 'png', matches: buffer => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
    { mime: 'image/webp', extension: 'webp', matches: buffer => buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' },
];

function invalidImage(message) {
    return Object.assign(new Error(message), { status: 400 });
}

export async function storeImageAsset(file, namespace) {
    if (!file?.buffer) throw invalidImage('Choose an image to upload.');
    const metadata = metadataSchema.safeParse({
        size: file.size,
        mimetype: file.mimetype,
        originalname: file.originalname,
    });
    if (!metadata.success) throw invalidImage('Use a JPEG, PNG, or WebP image no larger than 5 MB.');
    const detected = TYPES.find(type => type.matches(file.buffer));
    if (!detected || detected.mime !== metadata.data.mimetype) {
        throw invalidImage('The uploaded file contents do not match a supported image type.');
    }

    await mkdir(imageDirectory, { recursive: true });
    const filename = `${namespace}-${crypto.randomUUID()}.${detected.extension}`;
    await writeFile(path.join(imageDirectory, filename), file.buffer, { flag: 'wx' });
    return `/uploads/images/${filename}`;
}

export async function removeImageAsset(assetUrl) {
    if (!assetUrl?.startsWith('/uploads/images/')) return;
    const filename = path.basename(assetUrl);
    try {
        await unlink(path.join(imageDirectory, filename));
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
}
