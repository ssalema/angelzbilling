import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { connectSocket, disconnectSocket } from '../api/socket.js';
import { clearResourceCache } from '../api/resourceCache.js';
import { useAuth } from './AuthContext.jsx';
import { SESSION_NOTICE } from '../utils/constants.js';

// One socket connection for the whole app; nothing else touches socket.io directly.

const RealtimeContext = createContext(null);

/** Resource names used by the server and by screens that watch them. */
export const RESOURCES = ['bills', 'perfumes', 'users', 'branches', 'settings'];

export const RealtimeProvider = ({ children }) => {
  const { isAuthenticated, user, logout, setUser } = useAuth();

  const [connected, setConnected] = useState(false);
  /** Bumped for a resource every time the server says it changed. */
  const [revisions, setRevisions] = useState({});
  const [lastEvent, setLastEvent] = useState(null);

  // Kept in a ref so adding a subscriber doesn't re-render listening screens.
  const handlers = useRef(new Map());

  const emitToHandlers = useCallback((event, payload) => {
    handlers.current.get(event)?.forEach((handler) => {
      try {
        handler(payload);
      } catch {
        // One bad listener must not stop the others.
      }
    });
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      disconnectSocket();
      setConnected(false);
      return undefined;
    }

    const socket = connectSocket();
    if (!socket) return undefined;

    // Events sent while disconnected were missed, so refresh every screen on reconnect.
    let droppedSinceLastConnect = false;
    const catchUp = () => {
      clearResourceCache();
      setRevisions((current) =>
        Object.fromEntries(RESOURCES.map((name) => [name, (current[name] || 0) + 1]))
      );
    };

    const onConnect = () => {
      setConnected(true);
      if (droppedSinceLastConnect) catchUp();
      droppedSinceLastConnect = false;
    };
    const onDisconnect = () => {
      setConnected(false);
      droppedSinceLastConnect = true;
    };
    // The browser can come back online before the socket reconnects.
    window.addEventListener('online', catchUp);

    const onChange = (payload) => {
      if (!payload?.resource) return;

      // Cached data is now stale; screens refetch on their own (see api/resourceCache.js).
      clearResourceCache(payload.resource);
      clearResourceCache('dashboard');

      setRevisions((current) => ({
        ...current,
        [payload.resource]: (current[payload.resource] || 0) + 1,
      }));
      setLastEvent(payload);
    };

    // Session ended by an admin or a password change. No toast: the sign-in page shows the reason.
    const onRevoked = (payload) => {
      disconnectSocket();
      logout(
        payload?.reason
          ? { message: payload.reason, severity: payload.severity || SESSION_NOTICE.ended.severity }
          : SESSION_NOTICE.ended
      );
    };

    const onProfile = (payload) => {
      if (payload?.user) setUser((current) => ({ ...current, ...payload.user }));
    };

    // One catch-all listener, because screens subscribe before this effect runs.
    const onAny = (event, payload) => {
      emitToHandlers(event, payload);
      if (payload?.resource) emitToHandlers(payload.resource, payload);
    };

    socket.onAny(onAny);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('resource:changed', onChange);
    socket.on('session:revoked', onRevoked);
    socket.on('user:profile', onProfile);

    setConnected(socket.connected);

    return () => {
      window.removeEventListener('online', catchUp);
      socket.offAny(onAny);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('resource:changed', onChange);
      socket.off('session:revoked', onRevoked);
      socket.off('user:profile', onProfile);
    };
  }, [isAuthenticated, logout, setUser, emitToHandlers]);

  useEffect(() => () => disconnectSocket(), []);

  /** Listens for a resource name ('bills') or a server event ('bill:created'). */
  const subscribe = useCallback((event, handler) => {
    if (!event || typeof handler !== 'function') return () => {};

    if (!handlers.current.has(event)) handlers.current.set(event, new Set());
    handlers.current.get(event).add(handler);

    return () => {
      const set = handlers.current.get(event);
      set?.delete(handler);
      if (set && !set.size) handlers.current.delete(event);
    };
  }, []);

  const value = useMemo(
    () => ({
      connected,
      // Which account we are, so a screen can ignore its own writes.
      selfId: user?.id ? String(user.id) : null,
      revisions,
      lastEvent,
      subscribe,
    }),
    [connected, user?.id, revisions, lastEvent, subscribe]
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
};

export const useRealtime = () => {
  const context = useContext(RealtimeContext);
  if (!context) throw new Error('useRealtime must be used inside a RealtimeProvider');
  return context;
};

export default RealtimeContext;
