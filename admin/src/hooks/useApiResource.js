import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { keyFor, readResource, writeResource, clearResourceCache } from '../api/resourceCache.js';
import RealtimeContext from '../context/RealtimeContext.jsx';

// The one data-fetching primitive every screen uses.

export const useApiResource = (
  fetcher,
  deps = [],
  // `watch` names the server-side resources this data is derived from — pass
  // 'bills' and the screen brings itself up to date the moment anyone, anywhere,
  // writes a bill. See context/RealtimeContext.jsx.
  { immediate = true, initialData = null, cacheKey = null, watch = null } = {}
) => {
  // A cached payload is the initial state, not something applied afterwards —
  // so the first render already has it and no skeleton is ever shown for it.
  const cached = cacheKey ? readResource(keyFor(cacheKey, deps)) : undefined;

  const [data, setData] = useState(cached ?? initialData);
  const [loading, setLoading] = useState(immediate && cached === undefined);
  const [error, setError] = useState(null);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // The cache key, held in a ref rather than closed over.
  const keyRef = useRef(null);
  keyRef.current = cacheKey ? keyFor(cacheKey, deps) : null;
  const cacheKeyRef = useRef(cacheKey);
  cacheKeyRef.current = cacheKey;

  // Guards against a slow response from an abandoned filter overwriting a fast one.
  const requestId = useRef(0);
  const mounted = useRef(true);
  /** The in-flight request, so the next one — or unmounting — can cancel it. */
  const controller = useRef(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Nothing will read this response, so stop paying for it on both ends.
      controller.current?.abort();
    };
  }, []);

  const run = useCallback(async ({ silent = false } = {}) => {
    const id = ++requestId.current;

    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;

    // A revalidation behind cached data must not flip the screen back to a
    // skeleton — that would undo the whole point of having shown it.
    if (!silent) setLoading(true);
    setError(null);

    try {
      const result = await fetcherRef.current(abort.signal);
      if (mounted.current && id === requestId.current) setData(result);
      return result;
    } catch (err) {
      // An abort is this hook's own doing, not a failure to report: the caller
      // moved on, and showing them an error for it would be a lie.
      if (abort.signal.aborted || err?.aborted) return null;
      if (mounted.current && id === requestId.current) setError(err);
      return null;
    } finally {
      if (mounted.current && id === requestId.current) setLoading(false);
    }
  }, []);

  // Spread exactly as before, so which changes trigger a refetch is unchanged.
  useEffect(() => {
    if (!immediate) return;

    const key = keyRef.current;
    const hit = key ? readResource(key) : undefined;

    if (hit !== undefined) {
      // Show what we have, then quietly bring it up to date.
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

  // Read straight off the context rather than through the guard hook: a screen
  // outside the provider simply has nothing to watch, which is not an error.
  const realtime = useContext(RealtimeContext);
  const watched = Array.isArray(watch) ? watch : watch ? [watch] : [];

  // One number that moves whenever any watched resource does.
  const revision = watched.reduce((total, name) => total + (realtime?.revisions?.[name] || 0), 0);
  const seenRevision = useRef(revision);

  useEffect(() => {
    if (!watched.length || !immediate) return;
    if (revision === seenRevision.current) return;
    seenRevision.current = revision;

    // Silent: someone else's write must not blank out the page being read here.
    run({ silent: true }).then((fresh) => {
      if (fresh !== null && keyRef.current) writeResource(keyRef.current, fresh);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, immediate, run]);

  // A manual reload is always a real reload.
  const reload = useCallback(async () => {
    if (cacheKeyRef.current) clearResourceCache(cacheKeyRef.current);
    const fresh = await run();
    if (fresh !== null && keyRef.current) writeResource(keyRef.current, fresh);
    return fresh;
  }, [run]);

  return { data, loading, error, reload, setData };
};

export default useApiResource;
