import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportApi } from '../api/exportApi.js';
import DataExportPanel from './DataExportPanel.jsx';

vi.mock('../api/exportApi.js', () => ({
    exportApi: {
        downloadPlayers: vi.fn(),
        downloadMatches: vi.fn(),
        downloadRatings: vi.fn(),
    },
}));

describe('DataExportPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        exportApi.downloadPlayers.mockResolvedValue();
        exportApi.downloadMatches.mockResolvedValue();
        exportApi.downloadRatings.mockResolvedValue();
    });
    afterEach(cleanup);

    it('downloads each approved export with lifecycle and category filters', async () => {
        render(<DataExportPanel clubId="club_1" />);

        fireEvent.click(screen.getByLabelText(/Include inactive and deleted players/i));
        fireEvent.click(screen.getByRole('button', { name: 'Download player roster' }));
        await waitFor(() => expect(exportApi.downloadPlayers).toHaveBeenCalledWith(
            'club_1', { includeInactive: true }
        ));

        const categorySelectors = screen.getAllByLabelText('Category');
        fireEvent.change(categorySelectors[0], { target: { value: 'rapid' } });
        fireEvent.click(screen.getByRole('button', { name: 'Download match history' }));
        await waitFor(() => expect(exportApi.downloadMatches).toHaveBeenCalledWith(
            'club_1', { category: 'rapid' }
        ));

        fireEvent.change(categorySelectors[1], { target: { value: 'classical' } });
        fireEvent.click(screen.getByRole('button', { name: 'Download current ratings' }));
        await waitFor(() => expect(exportApi.downloadRatings).toHaveBeenCalledWith(
            'club_1', { category: 'classical', includeInactive: true }
        ));
        expect(screen.getByText('CSV import is not available.')).toBeTruthy();
    });

    it('shows a useful error without starting another export', async () => {
        exportApi.downloadPlayers.mockRejectedValue(new Error('Export denied.'));
        render(<DataExportPanel clubId="club_1" />);
        fireEvent.click(screen.getByRole('button', { name: 'Download player roster' }));
        expect(await screen.findByText('Export denied.')).toBeTruthy();
    });
});
