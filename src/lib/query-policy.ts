/** Memory only. Live/time-gated reads keep their explicit refresh intervals. */
export const searchCache = { staleTime: 30_000, gcTime: 10 * 60_000 };
export const directoryCache = { staleTime: 5 * 60_000, gcTime: 10 * 60_000 };
