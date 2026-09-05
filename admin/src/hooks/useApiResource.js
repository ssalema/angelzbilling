import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The one data-fetching primitive every screen uses.
 * Gives each caller a consistent { data, loading, error, reload } tuple so the
 * loading / empty / error states in the UI are written once, not per screen.
 *
 * `deps` should be primitives (or a JSON-stable object) — the fetcher itself is
 * held in a ref, so an inline arrow function will not cause a refetch loop.
 */
export const useApiResource = (fetcher, deps = [], { immediate = true, initialData = null } = {}) => {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState(null);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // Guards against a slow response from an abandoned filter overwriting a fast one.
  const requestId = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      if (mounted.current && id === requestId.current) setData(result);
      return result;
    } catch (err) {
      if (mounted.current && id === requestId.current) setError(err);
      return null;
    } finally {
      if (mounted.current && id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (immediate) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, immediate]);

  return { data, loading, error, reload: run, setData };
};

export default useApiResource;
