import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { connectSocket, disconnectSocket } from '../api/socket.js';
import { clearResourceCache } from '../api/resourceCache.js';
import { useAuth } from './AuthContext.jsx';
import { useSnackbar } from './SnackbarContext.jsx';

// One connection and one set of listeners for the whole app. Nothing below this
// provider touches socket.io directly.

const RealtimeContext = createContext(null);

/** What the server calls each resource, and what a screen asks to watch. */
export const RESOURCES = ['bills', 'perfumes', 'users', 'branches', 'settings'];

export const RealtimeProvider = ({ children }) => {
  const { isAuthenticated, user, logout, setUser } = useAuth();
  const snackbar = useSnackbar();

  const [connected, setConnected] = useState(false);
  /** Bumped for a resource every time the server says it changed. */
  const [revisions, setRevisions] = useState({});
  const [lastEvent, setLastEvent] = useState(null);

  // Subscribers live outside React state: adding one must not re-render every
  // screen that is already listening.
  const handlers = useRef(new Map());

  const emitToHandlers = useCallback((event, payload) => {
    handlers.current.get(event)?.forEach((handler) => {
      try {
        handler(payload);
      } catch {
        // One bad listener must not stop the rest from hearing the event.
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

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    const onChange = (payload) => {
      if (!payload?.resource) return;

      // What the screens are holding was true before this write. See
      // api/resourceCache.js — they refetch on their own from here.
      clearResourceCache(payload.resource);
      clearResourceCache('dashboard');

      setRevisions((current) => ({
        ...current,
        [payload.resource]: (current[payload.resource] || 0) + 1,
      }));
      setLastEvent(payload);
    };

    // An administrator ended this session, or the password behind it changed.
    const onRevoked = (payload) => {
      disconnectSocket();
      logout();
      snackbar.error(payload?.reason || 'Your session has ended. Please sign in again.');
    };

    const onProfile = (payload) => {
      if (payload?.user) setUser((current) => ({ ...current, ...payload.user }));
    };

    // Subscribers are fed through one listener rather than one per subscription,
    // because a screen mounts before this effect runs.
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
      socket.offAny(onAny);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('resource:changed', onChange);
      socket.off('session:revoked', onRevoked);
      socket.off('user:profile', onProfile);
    };
  }, [isAuthenticated, logout, setUser, snackbar, emitToHandlers]);

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
