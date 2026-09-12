import cluster from 'node:cluster';
import { Server } from 'socket.io';

import env from './env.js';
import logger from './logger.js';
import { isAllowedOrigin } from './origins.js';
import { broadcast, onBroadcast } from './broadcast.js';
import User from '../models/User.js';
import { verifyAccessToken, isAccessTokenRevoked } from '../utils/tokens.js';
import { getCachedUser, setCachedUser } from '../utils/userCache.js';
import { toLocationId } from '../utils/locations.js';

// The push half of the API: every write the REST layer makes is announced here,
// so an open panel does not have to be told to refresh.

export const ROOM_ALL = 'all';
export const userRoom = (userId) => `user:${userId}`;
export const roleRoom = (role) => `role:${role}`;
export const branchRoom = (branchId) => `branch:${toLocationId(branchId)}`;

const BRANCH_FIELDS = 'name code address phone phoneCountryCode gstin isActive hasOwnLogo logo favicon';

let io = null;

export const getIO = () => io;

// ─── Handshake ──────────────────────────────────────────────────────────────

// The same checks `middlewares/authenticate.js` runs, against the handshake token.
const resolveSocketUser = async (token) => {
  if (!token) throw new Error('You are not signed in.');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (error) {
    throw new Error(error.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'Invalid authentication token');
  }

  if (payload.tokenType !== 'access') throw new Error('Invalid authentication token');
  if (isAccessTokenRevoked(payload.jti)) throw new Error('You have been signed out.');

  let user = getCachedUser(payload.sub);
  if (!user) {
    user = await User.findById(payload.sub).populate('branch', BRANCH_FIELDS).lean();
    if (user?.isActive) setCachedUser(payload.sub, user);
  }

  if (!user) throw new Error('This account no longer exists');
  if (!user.isActive) throw new Error('Your account has been deactivated. Please contact the super admin.');
  if (user.passwordChangedAt && payload.iat * 1000 < user.passwordChangedAt.getTime()) {
    throw new Error('Your password was changed. Please sign in again.');
  }

  return { user, payload };
};

// A connection must not outlive the token behind it.
const scheduleExpiry = (socket, exp) => {
  clearTimeout(socket.data.expiryTimer);
  if (!exp) return;

  const ms = exp * 1000 - Date.now();
  if (ms <= 0) {
    socket.disconnect(true);
    return;
  }

  socket.data.expiryTimer = setTimeout(() => {
    // The client mints a fresh token and reconnects; it is not signed out.
    socket.emit('auth:expired');
    socket.disconnect(true);
  }, ms);
  socket.data.expiryTimer.unref?.();
};

const joinRooms = (socket, user) => {
  socket.join(ROOM_ALL);
  socket.join(userRoom(user._id));
  socket.join(roleRoom(user.role));
  socket.join(branchRoom(user.branch?._id || user.branch));
};

// ─── Fan-out ────────────────────────────────────────────────────────────────

const emitLocally = (rooms, event, payload) => {
  if (!io || !event) return;
  io.to(rooms).emit(event, payload);
};

// A worker holds only its own sockets, so an event raised here has to reach the
// connections on the other workers. See config/broadcast.js.
onBroadcast('realtime', (message) => emitLocally(message?.rooms || [], message?.event, message?.payload));

/** Announces an event to a set of rooms, on every worker. */
export const emit = (event, payload = null, { rooms = [ROOM_ALL] } = {}) => {
  const targets = (Array.isArray(rooms) ? rooms : [rooms]).filter(Boolean);
  if (!targets.length || !event) return;

  emitLocally(targets, event, payload);
  broadcast('realtime', { rooms: targets, event, payload });
};

// A write at one location reaches that location plus every super admin, who
// reads the whole store. A null scope means the write was store-wide.
export const roomsForScope = (scope) =>
  scope === null || scope === undefined ? [ROOM_ALL] : [branchRoom(scope), roleRoom('superadmin')];

export const emitToScope = (event, payload, scope) => emit(event, payload, { rooms: roomsForScope(scope) });

/** Tells one account's open tabs that its session is no longer usable. */
export const revokeSession = (userId, reason = 'Your session has ended. Please sign in again.', severity = 'info') => {
  if (!userId) return;
  emit('session:revoked', { reason, severity }, { rooms: [userRoom(userId)] });
};

// ─── Lifecycle ──────────────────────────────────────────────────────────────

export const initSocket = (httpServer) => {
  if (!env.realtime.enabled) {
    logger.warn('[socket] realtime is switched off (ENABLE_REALTIME=false)');
    return null;
  }

  io = new Server(httpServer, {
    path: env.realtime.path,
    serveClient: false,
    cors: {
      origin: (origin, callback) =>
        isAllowedOrigin(origin)
          ? callback(null, true)
          : callback(new Error(`Origin ${origin} is not allowed to connect.`)),
      credentials: true,
    },
    // Long polling spreads a session over several requests, and under
    // `start:cluster` each could land on a different worker. A websocket stays
    // where it opened, so no sticky-session layer is needed in front of the app.
    transports: cluster.isWorker ? ['websocket'] : ['polling', 'websocket'],
    pingInterval: env.realtime.pingIntervalMs,
    pingTimeout: env.realtime.pingTimeoutMs,
    maxHttpBufferSize: 1e5,
    // A phone that loses signal for a moment gets the events it missed back.
    connectionStateRecovery: { maxDisconnectionDuration: 60_000, skipMiddlewares: false },
  });

  io.use(async (socket, next) => {
    try {
      const header = socket.handshake.headers?.authorization || '';
      const token = socket.handshake.auth?.token || (header.startsWith('Bearer ') ? header.slice(7) : null);
      const { user, payload } = await resolveSocketUser(token);
      socket.data.user = user;
      socket.data.tokenId = payload.jti;
      socket.data.exp = payload.exp;
      return next();
    } catch (error) {
      return next(error);
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    joinRooms(socket, user);
    scheduleExpiry(socket, socket.data.exp);

    socket.emit('ready', {
      userId: String(user._id),
      role: user.role,
      branch: toLocationId(user.branch?._id || user.branch),
      rooms: [...socket.rooms].filter((room) => room !== socket.id),
    });

    socket.on('ping:check', (ack) => (typeof ack === 'function' ? ack(Date.now()) : null));
    socket.on('disconnect', () => clearTimeout(socket.data.expiryTimer));
  });

  logger.info(`[socket] realtime ready on ${env.realtime.path}`);
  return io;
};

export const closeSocket = async () => {
  if (!io) return;
  const closing = io;
  io = null;
  await new Promise((resolve) => closing.close(resolve));
};

// This worker's own connections; under the cluster each reports its share.
export const socketStats = () => {
  if (!io) return { enabled: false, connections: 0 };
  const rooms = io.sockets.adapter.rooms;
  return {
    enabled: true,
    connections: io.sockets.sockets.size,
    accounts: [...rooms.keys()].filter((room) => room.startsWith('user:')).length,
  };
};

export default { initSocket, emit, emitToScope, getIO };
