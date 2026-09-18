import { useQuery } from '@tanstack/react-query';
import { queryClient } from './queryClient.js';

export function useClubQuery(clubId, key, queryFn, options = {}) {
    const result = useQuery({
        queryKey: ['club', clubId, ...key],
        queryFn,
        enabled: Boolean(clubId),
        ...options,
    }, queryClient);
    if ([401, 403, 404].includes(result.error?.status)) return { ...result, data: undefined };
    return result;
}
