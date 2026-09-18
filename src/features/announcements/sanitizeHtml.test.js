import { expect, it } from 'vitest';
import { sanitizeAnnouncementHtml } from './sanitizeHtml.js';
it('keeps formatting while removing scripts, handlers, active embeds and unsafe URLs', () => {
    const dirty = `<h2>Club news</h2><p><strong>Safe</strong><u>Underline</u></p><script>alert(1)</script><img src=x onerror=alert(1)><svg onload=alert(1)></svg><iframe srcdoc="bad"></iframe><a href="java&#x73;cript:alert(1)" onclick="bad()">Unsafe</a><a href="//evil.test">Relative host</a><a href="https://club.test" target="_blank">Club</a>`;
    const clean = sanitizeAnnouncementHtml(dirty);
    expect(clean).toContain('<strong>Safe</strong>');
    expect(clean).toContain('<u>Underline</u>');
    expect(clean).toContain('rel="noopener noreferrer"');
    expect(clean).not.toMatch(/script|onerror|onclick|svg|iframe|<img|href="\/\//i);
    expect(sanitizeAnnouncementHtml(clean)).toBe(clean);
});
