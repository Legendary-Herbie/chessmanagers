import { expect, it } from 'vitest';
import { ATTACHMENT_ERROR, validateAttachments } from './attachmentValidation.js';

it('accepts supported types at the size limit and rejects an invalid file in a batch', () => {
    const valid = { type: 'application/pdf', size: 5 * 1024 * 1024 };
    expect(validateAttachments([valid])).toBe('');
    expect(validateAttachments([valid, { ...valid, size: valid.size + 1 }])).toBe(ATTACHMENT_ERROR);
    expect(validateAttachments([{ type: 'text/html', size: 10 }])).toBe(ATTACHMENT_ERROR);
});
