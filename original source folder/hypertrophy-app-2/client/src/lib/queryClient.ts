import { QueryClient } from "@tanstack/react-query";

/**
 * Simplified query client for static/localStorage app.
 * No API calls — all data reads happen in each page's queryFn
 * via the storage module. We keep TanStack Query for its
 * caching, invalidation, and mutation patterns.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
