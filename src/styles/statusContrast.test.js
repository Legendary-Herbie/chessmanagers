import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/styles/variables.css', 'utf8');
const themes = css.split("[data-theme='dark']");
function luminance(hex) {
    const rgb = hex.match(/[a-f\d]{2}/gi).map(value => {
        const channel = parseInt(value, 16) / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

describe('status text contrast', () => {
    for (const [index, theme] of themes.entries()) {
        it.each(['error', 'success', 'warning', 'info', 'neutral'])(`meets 4.5:1 for %s in ${index ? 'dark' : 'light'} mode`, state => {
            const read = kind => theme.match(new RegExp(`--status-${state}-${kind}: (#[a-f0-9]{6})`))[1];
            const values = [luminance(read('text')), luminance(read('bg'))].sort((a, b) => b - a);
            expect((values[0] + 0.05) / (values[1] + 0.05)).toBeGreaterThanOrEqual(4.5);
        });
    }
});
