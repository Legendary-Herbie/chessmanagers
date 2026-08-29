import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app, { createOriginMatcher } from '../../index.js';

describe('CORS origin handling', () => {
    it('matches exact and explicitly wildcarded origins without accepting lookalikes', () => {
        const matches = createOriginMatcher([
            'https://app.example.com',
            'https://*.preview.example.com',
        ]);

        expect(matches('https://app.example.com')).toBe(true);
        expect(matches('https://branch.preview.example.com')).toBe(true);
        expect(matches('https://app.example.com.evil.test')).toBe(false);
        expect(matches('http://branch.preview.example.com')).toBe(false);
    });

    it('allows alternate loopback ports only when development loopback support is enabled', () => {
        const production = createOriginMatcher(['https://app.example.com']);
        const development = createOriginMatcher(['https://app.example.com'], {
            allowDevelopmentLoopback: true,
        });

        expect(production('http://localhost:4173')).toBe(false);
        expect(development('http://localhost:4173')).toBe(true);
        expect(development('http://127.0.0.1:3001')).toBe(true);
        expect(development('https://evil.example')).toBe(false);
    });

    it('returns credentialed CORS headers to an allowed frontend and rejects another origin', async () => {
        const allowed = await request(app).options('/api/v1/auth/login')
            .set('Origin', 'http://localhost:3000')
            .set('Access-Control-Request-Method', 'POST')
            .expect(204);
        expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
        expect(allowed.headers['access-control-allow-credentials']).toBe('true');

        const denied = await request(app).options('/api/v1/auth/login')
            .set('Origin', 'https://evil.example')
            .set('Access-Control-Request-Method', 'POST')
            .expect(403);
        expect(denied.body.code).toBe('CORS_ORIGIN_DENIED');
        expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    });
});
