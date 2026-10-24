import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { keyFor, readResource, writeResource, clearResourceCache } from '../api/resourceCache.js';
import RealtimeContext from '../context/RealtimeContext.jsx';

export const useApiResource = (
  fetcher,
  deps = [],
  // `watch` lists server resources (e.g. 'bills') that trigger a refetch when
  // anyone writes them. See context/RealtimeContext.jsx.
  { immediate = true, initialData = null, cacheKey = null, watch = null } = {}
) => {
  // Cached data is the initial state, so the first render skips the skeleton.
  const cached = cacheKey ? readResource(keyFor(cacheKey, deps)) : undefined;

  const [data, setData] = useState(cached ?? initialData);
  const [loading, setLoading] = useState(immediate && cached === undefined);
  const [error, setError] = useState(null);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const keyRef = useRef(null);
  keyRef.current = cacheKey ? keyFor(cacheKey, deps) : null;
  const cacheKeyRef = useRef(cacheKey);
  cacheKeyRef.current = cacheKey;

  // Stops a slow, stale response from overwriting a newer one.
  const requestId = useRef(0);
  const mounted = useRef(true);
  const controller = useRef(null);

  const dataRef = useRef(data);
  dataRef.current = data;
  const inFlight = useRef(false);
  const pendingRevalidate = useRef(false);
  const revalidateRef = useRef(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);

  const run = useCallback(async ({ silent = false } = {}) => {
    const id = ++requestId.current;

    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;

    // A silent refresh must not show the skeleton over cached data.
    if (!silent) setLoading(true);
    if (!silent) setError(null);
    inFlight.current = true;

    try {
      const result = await fetcherRef.current(abort.signal);
      if (mounted.current && id === requestId.current) {
        setData(result);
        setError(null);
      }
      return result;
    } catch (err) {
      // We aborted it ourselves, so it's not an error.
      if (abort.signal.aborted || err?.aborted) return null;
      // A failed silent refresh keeps the current data instead of showing an error.
      const keepShowing = silent && dataRef.current !== null && dataRef.current !== undefined;
      if (mounted.current && id === requestId.current && !keepShowing) setError(err);
      return null;
    } finally {
      if (mounted.current && id === requestId.current) {
        setLoading(false);
        inFlight.current = false;
        // A change announced mid-request may be missing from this response.
        if (pendingRevalidate.current) {
          pendingRevalidate.current = false;
          revalidateRef.current?.();
        }
      }
    }
  }, []);

  const revalidate = useCallback(
    () =>
      run({ silent: true }).then((fresh) => {
        if (fresh !== null && keyRef.current) writeResource(keyRef.current, fresh);
      }),
    [run]
  );
  revalidateRef.current = revalidate;

  useEffect(() => {
    if (!immediate) return;

    const key = keyRef.current;
    const hit = key ? readResource(key) : undefined;

    if (hit !== undefined) {
      // Show cached data, then refresh quietly.
      setData(hit);
      setLoading(false);
      run({ silent: true }).then((fresh) => {
        if (fresh !== null && key) writeResource(key, fresh);
      });
      return;
    }

    run().then((fresh) => {
      if (fresh !== null && key) writeResource(key, fresh);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, immediate, cacheKey]);

  // Read the context directly: outside the provider there is just nothing to watch.
  const realtime = useContext(RealtimeContext);
  const watched = Array.isArray(watch) ? watch : watch ? [watch] : [];

  // Changes whenever any watched resource changes.
  const revision = watched.reduce((total, name) => total + (realtime?.revisions?.[name] || 0), 0);
  const seenRevision = useRef(revision);

  useEffect(() => {
    if (!watched.length || !immediate) return;
    if (revision === seenRevision.current) return;
    seenRevision.current = revision;

    // On a slow link, let the current fetch finish and queue one more,
    // instead of restarting on every change (which might never finish).
    if (inFlight.current) {
      pendingRevalidate.current = true;
      return;
    }

    revalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, immediate, revalidate]);

  // Manual reload clears the cache and shows the loading state.
  const reload = useCallback(async () => {
    if (cacheKeyRef.current) clearResourceCache(cacheKeyRef.current);
    const fresh = await run();
    if (fresh !== null && keyRef.current) writeResource(keyRef.current, fresh);
    return fresh;
  }, [run]);

  return { data, loading, error, reload, setData };
};

export default useApiResource;
