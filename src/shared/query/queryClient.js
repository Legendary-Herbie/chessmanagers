import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
    defaultOptions: { queries: {
        staleTime: 45_000,
        gcTime: 5 * 60_000,
        retry: false,
        refetchOnWindowFocus: false,
    } },
});

export async function invalidateClubQueries(clubId) {
    await queryClient.cancelQueries({ queryKey: ['club', clubId] });
    return queryClient.invalidateQueries({ queryKey: ['club', clubId] });
}

export function invalidateAfterMutation(endpoint) {
    const clubId = endpoint.match(/^\/clubs\/([^/?]+)/)?.[1];
    if (clubId && !['join-by-code', 'join-by-token'].includes(clubId)) {
        void invalidateClubQueries(clubId);
    } else if (endpoint.startsWith('/clubs')) {
        void queryClient.invalidateQueries();
    }
}

let accountId = null;
export function setQueryAccount(nextAccountId) {
    if (accountId !== nextAccountId) queryClient.clear();
    accountId = nextAccountId;
}
export function clearQuerySession() {
    accountId = null;
    queryClient.clear();
}
