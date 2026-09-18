export const ATTACHMENT_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
export const ATTACHMENT_ERROR = 'Choose JPEG, PNG, WebP, or PDF files up to 5 MB each.';
export function validateAttachments(files) {
    return files.some(file => file.size > 5 * 1024 * 1024 || !ATTACHMENT_ACCEPT.split(',').includes(file.type))
        ? ATTACHMENT_ERROR : '';
}
