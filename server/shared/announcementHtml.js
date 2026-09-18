// Pure policy shared by browser and server DOMPurify instances.
export const ANNOUNCEMENT_HTML_OPTIONS = {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'blockquote', 'h2', 'h3', 'h4', 'a', 'code', 'pre'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
};

export function configureAnnouncementPurifier(purifier) {
    purifier.addHook('afterSanitizeAttributes', node => {
        if (node.nodeName !== 'A') {
            for (const attribute of ['href', 'target', 'rel']) node.removeAttribute?.(attribute);
            return;
        }
        const href = node.getAttribute('href');
        if (href) {
            try {
                const url = new URL(href, 'https://club.invalid/');
                if (!['http:', 'https:', 'mailto:'].includes(url.protocol) || /^[\\/]{2}/.test(href.trim())) node.removeAttribute('href');
            } catch { node.removeAttribute('href'); }
        }
        if (node.getAttribute('target') === '_blank') node.setAttribute('rel', 'noopener noreferrer');
        else { node.removeAttribute('target'); node.removeAttribute('rel'); }
    });
    return value => purifier.sanitize(typeof value === 'string' ? value : '', ANNOUNCEMENT_HTML_OPTIONS);
}
