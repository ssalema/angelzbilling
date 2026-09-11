import { io } from 'socket.io-client';
import { getAccessToken, refreshSession } from './client.js';

// The panel's single live connection: opened when a session starts, closed when
// it ends. Screens subscribe through RealtimeContext, they never connect here.

const trimSlash = (value) => String(value ?? '').trim().replace(/\/+$/, '');

const API_URL = trimSlash(import.meta.env.VITE_API_URL);
const SOCKET_PATH = trimSlash(import.meta.env.VITE_SOCKET_PATH) || '/socket.io';

// Same rule as the REST base: a cross-origin deploy sets VITE_API_URL, a
// same-origin one rides the panel's own origin.
const socketOrigin = () => {
  if (!API_URL) return window.location.origin;
  try {
    return new URL(API_URL, window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
};

let socket = null;

export const getSocket = () => socket;

export const isConnected = () => Boolean(socket?.connected);

/** Opens the connection for the signed-in session. Safe to call again. */
export const connectSocket = () => {
  if (socket) {
    if (!socket.connected) socket.connect();
    return socket;
  }

  socket = io(socketOrigin(), {
    path: SOCKET_PATH,
    // Read fresh on every attempt, so a reconnect after a refresh carries the
    // new token.
    auth: (callback) => callback({ token: getAccessToken() }),
    withCredentials: true,
    autoConnect: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 10_000,
    randomizationFactor: 0.5,
    timeout: 12_000,
  });

  // The connection outlives the access token. The server hangs up when it
  // expires; mint a new one and come straight back.
  const renew = () => {
    refreshSession()
      .then(() => socket?.connect())
      .catch(() => {});
  };

  socket.on('auth:expired', renew);
  socket.on('connect_error', (error) => {
    if (error?.message === 'TOKEN_EXPIRED') renew();
  });

  return socket;
};

export const disconnectSocket = () => {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
};

export default { connectSocket, disconnectSocket, getSocket, isConnected };
