// Global query configuration to prevent infinite loading
export const defaultQueryConfig = {
  staleTime: 5 * 60 * 1000, // 5 minutes
  gcTime: 10 * 60 * 1000, // 10 minutes
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  retry: 2,
  retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
  networkMode: 'online' as const,
};

// Query timeout configuration
export const queryTimeout = 30000; // 30 seconds

// Add timeout wrapper for queries
export const withTimeout = <T>(promise: Promise<T>, timeoutMs: number = queryTimeout): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Query timeout')), timeoutMs)
    )
  ]);
};


