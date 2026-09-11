import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// Keyed by history entry (location.key), so the same path visited twice keeps
// two independent offsets. Module scope: it must outlive the route unmounting.
const offsets = new Map();
const RESTORE_TIMEOUT_MS = 1500;

const ScrollManager = () => {
  const { key, pathname, hash } = useLocation();
  const navigationType = useNavigationType();

  // Kept in a ref so the scroll listener stays mounted once and always writes
  // against the entry that is currently on screen.
  const currentKey = useRef(key);
  currentKey.current = key;

  useEffect(() => {
    const remember = () => {
      offsets.set(currentKey.current, window.scrollY);
    };
    window.addEventListener('scroll', remember, { passive: true });
    // Also catch a reload/close mid-page so a later back lands correctly.
    window.addEventListener('pagehide', remember);
    return () => {
      window.removeEventListener('scroll', remember);
      window.removeEventListener('pagehide', remember);
    };
  }, []);

  useLayoutEffect(() => {
    // An in-page anchor knows better than we do.
    if (hash) return undefined;

    const target = navigationType === 'POP' ? offsets.get(key) ?? 0 : 0;

    if (target === 0) {
      window.scrollTo(0, 0);
      return undefined;
    }

    let frame = 0;
    const deadline = performance.now() + RESTORE_TIMEOUT_MS;
    // If the user scrolls while we are still waiting for content, stop fighting
    // them and leave the page where they put it.
    let cancelled = false;
    const stop = () => {
      cancelled = true;
    };
    window.addEventListener('wheel', stop, { passive: true, once: true });
    window.addEventListener('touchstart', stop, { passive: true, once: true });
    window.addEventListener('keydown', stop, { once: true });

    const attempt = () => {
      if (cancelled) return;
      window.scrollTo(0, target);
      const reachable = window.scrollY >= target - 1;
      if (!reachable && performance.now() < deadline) {
        frame = requestAnimationFrame(attempt);
      }
    };
    attempt();

    return () => {
      cancelAnimationFrame(frame);
      cancelled = true;
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchstart', stop);
      window.removeEventListener('keydown', stop);
    };
  }, [key, pathname, hash, navigationType]);

  return null;
};

export default ScrollManager;
