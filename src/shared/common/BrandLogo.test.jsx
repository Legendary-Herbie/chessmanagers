import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import BrandLogo from './BrandLogo.jsx';

afterEach(cleanup);

describe('BrandLogo', () => {
    it('provides theme-aware lockups and the responsive app icon', () => {
        const { container } = render(<BrandLogo collapse="mobile" />);
        const sources = [...container.querySelectorAll('img')]
            .map(image => image.getAttribute('src'));

        expect(sources).toEqual([
            '/primary_logo.svg',
            '/compact-logo-light.svg',
            '/app_icon.svg',
        ]);
        expect(container.querySelector('.brand-logo--collapse-mobile')).toBeTruthy();
    });

    it('uses the compact light lockup on fixed dark surfaces', () => {
        const { container } = render(<BrandLogo tone="inverted" compact />);
        expect(container.querySelector('.brand-logo__lockup').getAttribute('src'))
            .toBe('/compact-logo-light.svg');
    });
});
